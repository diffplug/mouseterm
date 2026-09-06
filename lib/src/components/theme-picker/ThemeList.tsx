import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { XIcon } from '@phosphor-icons/react';
import type { DormouseTheme } from '../../lib/themes';
import { getThemePreviewStyle, ThemePreview } from './ThemePreview';

/** The preview list shared by every ThemePicker placement. */
export function ThemeList({
  themes,
  activeId,
  onSelect,
  onUninstall,
}: {
  themes: DormouseTheme[];
  activeId: string;
  onSelect: (id: string) => void;
  onUninstall: (theme: DormouseTheme) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ above: false, below: false });
  const previews = useMemo(() => themes.map((theme) => ({
    theme,
    // Resolve omissions using the candidate's polarity, never the active
    // document's theme. Previewing must not apply a theme or mutate storage.
    style: getThemePreviewStyle(theme),
  })), [themes]);
  const backgroundColor = previews.find(({ theme }) => theme.id === activeId)?.style.backgroundColor
    ?? 'var(--color-terminal-bg)';

  useLayoutEffect(() => {
    const scroll = scrollRef.current!;
    const update = () => {
      // scrollTop may be fractional (or negative during Safari overscroll),
      // while scrollHeight/clientHeight are rounded to integer CSS pixels.
      const above = scroll.scrollTop > 1;
      const below = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 1;
      setOverflow((previous) => previous.above === above && previous.below === below
        ? previous : { above, below });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(scroll);
    observer.observe(contentRef.current!);
    scroll.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      scroll.removeEventListener('scroll', update);
    };
  }, [themes]);

  return (
    <div className="relative flex max-h-80 min-h-0 flex-1 flex-col" style={{ backgroundColor }}>
      <div ref={scrollRef} className="min-h-0 overflow-y-auto">
        <div ref={contentRef} className="flex flex-col gap-2 p-2">
          {previews.map(({ theme, style }) => {
            const isActive = theme.id === activeId;
            const isInstalled = theme.origin.kind === 'installed';
            return (
              <div
                key={theme.id}
                className="flex items-center overflow-hidden rounded"
                style={style}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  title={theme.label}
                  onClick={() => onSelect(theme.id)}
                  className={`group/theme-preview flex min-h-8 min-w-0 flex-1 items-center rounded py-1 pl-2 text-left text-sm pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-current ${isInstalled ? 'pr-1' : 'pr-2'}`}
                  style={{ color: 'inherit' }}
                >
                  <ThemePreview theme={theme} />
                </button>
                {isInstalled ? (
                  <button
                    type="button"
                    aria-label={`Uninstall ${theme.label}`}
                    title={`Uninstall ${theme.label}`}
                    // Keep a gap from selection: uninstall requires finding
                    // the extension again in OpenVSX to undo.
                    className="mr-1 ml-1 flex min-h-8 shrink-0 items-center rounded px-1.5 pointer-coarse:min-h-11 hover:opacity-65 focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-current"
                    style={{ color: 'inherit' }}
                    onClick={() => onUninstall(theme)}
                  >
                    <XIcon size={12} weight="bold" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {overflow.above ? (
        <div
          aria-hidden="true"
          data-scroll-fade="above"
          className="pointer-events-none absolute inset-x-0 top-0 h-8"
          style={{ background: `linear-gradient(to bottom, ${backgroundColor}, transparent)` }}
        />
      ) : null}
      {overflow.below ? (
        <div
          aria-hidden="true"
          data-scroll-fade="below"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-8"
          style={{ background: `linear-gradient(to top, ${backgroundColor}, transparent)` }}
        />
      ) : null}
    </div>
  );
}
