import { useLayoutEffect, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { resolvePanelElement } from '../lib/spatial-nav';
import { disposeSession } from '../lib/terminal-registry';
import { Shortcut } from './design';

export interface ConfirmKill {
  id: string;
  char: string;
  shaking?: boolean;
}

/** Random a-z excluding x (prevents accidental double-tap on kill shortcut) */
const KILL_CONFIRM_CHARS = 'abcdefghijklmnopqrstuvwyz'; // no x
export function randomKillChar(): string {
  return KILL_CONFIRM_CHARS[Math.floor(Math.random() * KILL_CONFIRM_CHARS.length)];
}

export function KillConfirmCard({ char, onCancel, shaking }: { char: string; onCancel?: () => void; shaking?: boolean }) {
  return (
    <div className={`bg-surface-raised border border-border px-6 py-4 rounded-lg text-center shadow-lg font-mono${shaking ? ' motion-safe:animate-shake-x' : ''}`}>
      <h2 className="text-base font-bold mb-3 text-foreground">Confirm kill</h2>
      <div className="bg-surface py-2 px-6 rounded border border-border inline-block mb-2">
        <span className="text-xl font-bold text-error">{char}</span>
      </div>
      <div className="text-sm text-muted leading-relaxed grid grid-cols-[auto_auto] gap-x-2 justify-center">
        <Shortcut className="justify-self-end">{char}</Shortcut>
        <span className="justify-self-start">to confirm</span>
        <button type="button" onClick={onCancel} className="contents group cursor-pointer">
          <Shortcut className="justify-self-end group-hover:text-foreground transition-colors">Esc</Shortcut>
          <span className="justify-self-start group-hover:text-foreground transition-colors">to cancel</span>
        </button>
      </div>
    </div>
  );
}

export function KillConfirmOverlay({ confirmKill, panelElements, onCancel }: {
  confirmKill: ConfirmKill;
  panelElements: Map<string, HTMLElement>;
  onCancel: () => void;
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // useLayoutEffect (not useEffect) so the initial measurement + re-render happens
  // before the browser paints. Otherwise the centered-in-viewport fallback below
  // flashes for one frame before the overlay snaps to the panel.
  useLayoutEffect(() => {
    const panelEl = resolvePanelElement(panelElements.get(confirmKill.id));
    if (!panelEl) { setRect(null); return; }

    const update = () => {
      const r = panelEl.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(panelEl);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [confirmKill.id, panelElements]);

  if (rect) {
    return (
      <div
        style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, zIndex: 100 }}
        className="flex items-center justify-center bg-surface/50 rounded"
      >
        <KillConfirmCard char={confirmKill.char} onCancel={onCancel} shaking={confirmKill.shaking} />
      </div>
    );
  }

  // Fallback: centered in viewport
  return (
    <div className="fixed inset-0 bg-surface/50 z-[100] flex items-center justify-center">
      <KillConfirmCard char={confirmKill.char} onCancel={onCancel} shaking={confirmKill.shaking} />
    </div>
  );
}


// --- Kill animation ---
//
// Orchestrates the visual reclaim when a pane is killed:
//   1. Fade the real killed pane's group element in place (its actual content
//      dissolves — a solid-color ghost over a same-colored background would be
//      invisible).
//   2. After the fade completes, capture pre-rects of surviving panes, remove
//      the panel (dockview snaps the layout), and FLIP each grower via
//      clip-path so its newly claimed territory is hidden at start and swept
//      in by the transition. clip-path (not transform) keeps
//      getBoundingClientRect accurate so the SelectionOverlay doesn't lag.
//
// killInProgressRef is set across api.removePanel so the onDidRemovePanel
// auto-spawn handler knows we already waited for our own fade and can skip
// its own 440ms delay (avoids stacking 440ms + 440ms on last-pane kill).
export function orchestrateKill(
  api: DockviewApi,
  killedId: string,
  selectPanel: (id: string) => void,
  setSelectedId: (id: string | null) => void,
  killInProgressRef: { current: boolean },
  overlayElRef: { current: HTMLElement | null },
): void {
  const panel = api.getPanel(killedId);
  if (!panel) return;

  const bareRemove = () => {
    killInProgressRef.current = true;
    disposeSession(killedId);
    api.removePanel(panel);
    killInProgressRef.current = false;
    if (api.panels.length > 0) selectPanel(api.panels[0].id);
    else setSelectedId(null);
  };

  const reduceMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const killedGroupEl = panel.api.group?.element;
  if (reduceMotion || !killedGroupEl) {
    bareRemove();
    return;
  }

  // Fade the killed pane in place. Block input on it during the fade.
  // For a last-pane kill (auto-spawn will create a replacement), also shrink
  // the pane toward the bottom-right so the disappearance is visible — a plain
  // fade offers no visual cue since the pane's space is reclaimed by a new one
  // appearing in exactly the same rect from the opposite corner. The focus
  // ring (SelectionOverlay element) gets a matching shrink animation so it
  // scales with the pane rather than sitting over empty space.
  const isLastPane = api.panels.length === 1;
  const fadeClass = isLastPane ? 'pane-fading-and-shrinking-to-br' : 'pane-fading-out';
  const fadeAnimationName = isLastPane ? 'pane-fade-and-shrink-to-br' : 'pane-fade-out';
  killedGroupEl.style.pointerEvents = 'none';
  killedGroupEl.classList.add(fadeClass);
  const overlayEl = isLastPane ? overlayElRef.current : null;
  if (overlayEl) overlayEl.classList.add('ring-shrinking-to-br');

  let finalized = false;
  const finalize = () => {
    if (finalized) return;
    finalized = true;

    // Snapshot pre-rects just before removal.
    interface Pre { el: HTMLElement; rect: DOMRect; }
    const preRects = new Map<string, Pre>();
    for (const p of api.panels) {
      if (p.id === killedId) continue;
      const el = p.api.group?.element;
      if (el) preRects.set(p.id, { el, rect: el.getBoundingClientRect() });
    }

    bareRemove();

    // FLIP each grower.
    for (const p of api.panels) {
      const pre = preRects.get(p.id);
      if (!pre) continue;
      const postRect = pre.el.getBoundingClientRect();
      const dw = postRect.width - pre.rect.width;
      const dh = postRect.height - pre.rect.height;
      if (Math.abs(dw) < 0.5 && Math.abs(dh) < 0.5) continue;

      // Clear any in-progress spawn animation before applying FLIP.
      pre.el.classList.remove('pane-spawning-from-left', 'pane-spawning-from-top', 'pane-spawning-from-top-left');

      const clipTop    = Math.max(0, (pre.rect.top - postRect.top)       / postRect.height * 100);
      const clipBottom = Math.max(0, (postRect.bottom - pre.rect.bottom) / postRect.height * 100);
      const clipLeft   = Math.max(0, (pre.rect.left - postRect.left)     / postRect.width  * 100);
      const clipRight  = Math.max(0, (postRect.right - pre.rect.right)   / postRect.width  * 100);

      pre.el.style.transition = 'none';
      pre.el.style.clipPath = `inset(${clipTop}% ${clipRight}% ${clipBottom}% ${clipLeft}%)`;
      void pre.el.offsetHeight;
      pre.el.style.transition = 'clip-path 440ms cubic-bezier(0.22, 1, 0.36, 1)';
      pre.el.style.clipPath = 'inset(0)';
      const cleanup = () => {
        pre.el.style.transition = '';
        pre.el.style.clipPath = '';
      };
      pre.el.addEventListener('transitionend', cleanup, { once: true });
      setTimeout(cleanup, 1000);
    }

    // Peel the ring-shrink class so the next selection's overlay renders at
    // full scale. The element may have been reused by React for the next
    // selected pane's overlay by the time the animation finishes.
    if (overlayEl) overlayEl.classList.remove('ring-shrinking-to-br');
  };

  killedGroupEl.addEventListener('animationend', (ev) => {
    if ((ev as AnimationEvent).animationName !== fadeAnimationName) return;
    finalize();
  });
  // Safety: if animationend never fires, still finalize.
  setTimeout(finalize, 1000);
}
