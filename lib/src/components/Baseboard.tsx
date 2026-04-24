import { useEffect, useRef, useState, useMemo, useLayoutEffect, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { Door } from './Door';
import { DoorElementsContext, type DooredItem } from './Pond';
import { DEFAULT_ACTIVITY_STATE, getActivitySnapshot, subscribeToActivity } from '../lib/terminal-registry';

export interface BaseboardProps {
  items: DooredItem[];
  onReattach: (item: DooredItem) => void;
  notice?: ReactNode;
}

/** Resolve any CSS color string (hex, rgb, hsl, named, color-mix...) to RGB
 *  by letting the canvas do the heavy lifting. Returns null on failure. */
function rgbOf(color: string, ctx: CanvasRenderingContext2D): [number, number, number] | null {
  if (!color) return null;
  ctx.fillStyle = '#000'; // reset to a known value if `color` is invalid
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

/** Convert sRGB (0-255) to OKLab — Björn Ottosson's perceptually-uniform
 *  color space. ΔE in OKLab is just Euclidean distance and accounts for
 *  lightness, hue, and chroma together. */
function rgbToOklab([r, g, b]: [number, number, number]): [number, number, number] {
  const toLinear = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const lp = Math.cbrt(l), mp = Math.cbrt(m), sp = Math.cbrt(s);
  return [
    0.2104542553 * lp + 0.7936177850 * mp - 0.0040720468 * sp,
    1.9779984951 * lp - 2.4285922050 * mp + 0.4505937099 * sp,
    0.0259040371 * lp + 0.7827717662 * mp - 0.8086757660 * sp,
  ];
}

function deltaEOklab(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0], da = a[1] - b[1], db = a[2] - b[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Doors should pop against the baseboard. Pick the door bg/fg pair —
 *  panel-inactive vs terminal — that has the larger ΔE (perceptual color
 *  distance in OKLab) from app-bg, since which one wins depends on the
 *  theme's lightness *and* hue. Sets --color-door-* on body so Door's
 *  `bg-door-bg` / `text-door-fg` resolve correctly. */
function usePickDoorPalette() {
  useEffect(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;

    const update = () => {
      const styles = getComputedStyle(document.body);
      const app = rgbOf(styles.getPropertyValue('--color-app-bg').trim(), ctx);
      const panel = rgbOf(styles.getPropertyValue('--color-header-inactive-bg').trim(), ctx);
      const term = rgbOf(styles.getPropertyValue('--color-surface').trim(), ctx);
      if (!app || !panel || !term) return;
      const oApp = rgbToOklab(app);
      const usePanel = deltaEOklab(rgbToOklab(panel), oApp) >= deltaEOklab(rgbToOklab(term), oApp);
      const bg = usePanel ? '--color-header-inactive-bg' : '--color-surface';
      const fg = usePanel ? '--color-header-inactive-fg' : '--color-foreground';
      document.body.style.setProperty('--color-door-bg', `var(${bg})`);
      document.body.style.setProperty('--color-door-fg', `var(${fg})`);
    };

    update();
    const mo = new MutationObserver(update);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => {
      mo.disconnect();
      document.body.style.removeProperty('--color-door-bg');
      document.body.style.removeProperty('--color-door-fg');
    };
  }, []);
}

export function Baseboard({ items, onReattach, notice }: BaseboardProps) {
  usePickDoorPalette();
  const { elements: doorElements, bumpVersion } = useContext(DoorElementsContext);
  const activityStates = useSyncExternalStore(subscribeToActivity, getActivitySnapshot);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [startIndex, setStartIndex] = useState(0);
  const doorWidthsRef = useRef<number[]>([]);
  const arrowMeasureEl = useRef<HTMLButtonElement>(null);
  const layoutMetrics = useRef({ doorGap: 0, arrowWidth: 0 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure door widths from hidden elements — re-measures when items change
  const measureEl = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = measureEl.current;
    if (!el) return;
    const widths: number[] = [];
    for (let i = 0; i < el.children.length; i++) {
      widths.push((el.children[i] as HTMLElement).offsetWidth);
    }
    doorWidthsRef.current = widths;

    // Measure layout metrics from DOM to stay in sync with CSS classes
    const container = containerRef.current;
    if (container) {
      layoutMetrics.current.doorGap = parseFloat(getComputedStyle(container).gap) || 0;
    }
    if (arrowMeasureEl.current) {
      layoutMetrics.current.arrowWidth = arrowMeasureEl.current.offsetWidth;
    }
  }, [items, activityStates]);

  // Reset startIndex when the set of door items changes (not just count)
  const itemKey = useMemo(() => items.map(i => i.id).join('\0'), [items]);
  useLayoutEffect(() => {
    setStartIndex(0);
  }, [itemKey]);

  // Keyboard shortcut hint — only show when there's enough space and no doors
  const shortcutHint = 'LCmd → RCmd to enter command mode';
  const showHint = items.length === 0 && containerWidth > 350;

  // Calculate which doors fit
  // contentRect.width already excludes container padding
  const availableWidth = containerWidth;
  let visibleCount = 0;
  let usedWidth = 0;

  if (items.length > 0) {
    const widths = doorWidthsRef.current;
    const { doorGap, arrowWidth } = layoutMetrics.current;
    const hasLeftOverflow = startIndex > 0;
    let budget = availableWidth - (hasLeftOverflow ? arrowWidth : 0);

    for (let i = startIndex; i < items.length; i++) {
      const doorW = (widths[i] || 100) + (visibleCount > 0 ? doorGap : 0);
      // Reserve space for right arrow if there are more items after this one
      const needsRightArrow = i + 1 < items.length;
      const rightReserve = needsRightArrow ? arrowWidth : 0;

      if (usedWidth + doorW + rightReserve > budget) break;
      usedWidth += doorW;
      visibleCount++;
    }

    // Ensure at least one door is visible
    if (visibleCount === 0 && items.length > 0) visibleCount = 1;
  }

  const endIndex = startIndex + visibleCount;
  const hiddenLeft = startIndex;
  const hiddenRight = items.length - endIndex;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const visibleDoors = new Map<string, HTMLElement>();
    for (const item of items.slice(startIndex, endIndex)) {
      const el = container.querySelector<HTMLElement>(`[data-door-id="${item.id}"]`);
      if (el) visibleDoors.set(item.id, el);
    }

    let changed = false;
    if (doorElements.size !== visibleDoors.size) {
      changed = true;
    } else {
      for (const [id, el] of visibleDoors) {
        if (doorElements.get(id) !== el) {
          changed = true;
          break;
        }
      }
    }

    if (!changed) return;

    doorElements.clear();
    for (const [id, el] of visibleDoors) {
      doorElements.set(id, el);
    }
    bumpVersion();
  }, [items, startIndex, endIndex, doorElements, bumpVersion]);

  const scrollLeft = () => setStartIndex(Math.max(0, startIndex - 1));
  const scrollRight = () => setStartIndex(Math.min(items.length - 1, startIndex + 1));

  return (
    <div
      ref={containerRef}
      className="flex h-7 shrink-0 items-end gap-1.5 bg-app-bg px-1.5 pt-1"
    >
      {/* Hidden measurement pass — doors + overflow arrow */}
      <div ref={measureEl} className="absolute -left-[9999px] flex gap-1.5" aria-hidden>
        {items.map(item => {
          const activity = activityStates.get(item.id) ?? DEFAULT_ACTIVITY_STATE;
          return (
            <Door
              key={item.id}
              title={item.title}
              status={activity.status}
              todo={activity.todo}

            />
          );
        })}
      </div>
      <button ref={arrowMeasureEl} className="absolute -left-[9999px] flex h-5 shrink-0 items-center gap-1 rounded px-1.5 pb-px text-sm font-medium font-mono tracking-[0.06em] text-muted" aria-hidden tabIndex={-1}>
        9 more <CaretRightIcon size={10} weight="bold" />
      </button>

      {items.length === 0 && showHint && (
        <span className="truncate pb-1 text-sm font-mono tracking-[0.06em] text-muted">
          {shortcutHint}
        </span>
      )}

      {hiddenLeft > 0 && (
        <button
          className="flex h-5 shrink-0 items-center gap-1 rounded px-1.5 pb-px text-sm font-medium font-mono tracking-[0.06em] text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          onClick={scrollLeft}
        >
          <CaretLeftIcon size={10} weight="bold" />
          {hiddenLeft} more
        </button>
      )}

      {items.slice(startIndex, endIndex).map(item => {
        const activity = activityStates.get(item.id) ?? DEFAULT_ACTIVITY_STATE;
        return (
          <Door
            key={item.id}
            doorId={item.id}
            title={item.title}
            status={activity.status}
            todo={activity.todo}
            onClick={() => onReattach(item)}
          />
        );
      })}

      {hiddenRight > 0 && (
        <button
          className="ml-auto flex h-5 shrink-0 items-center gap-1 rounded px-1.5 pb-px text-sm font-medium font-mono tracking-[0.06em] text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          onClick={scrollRight}
        >
          {hiddenRight} more
          <CaretRightIcon size={10} weight="bold" />
        </button>
      )}

      {notice && <div className="ml-auto shrink-0">{notice}</div>}
    </div>
  );
}
