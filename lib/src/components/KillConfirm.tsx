import { useLayoutEffect, useState } from 'react';
import type { DockviewApi } from 'dockview-react';
import { resolvePanelElement } from '../lib/spatial-nav';
import { disposeSession } from '../lib/terminal-registry';
import { Shortcut } from './design';

export type KillExit = 'shake' | 'confirm';

export interface ConfirmKill {
  id: string;
  char: string;
  exit?: KillExit;
}

export const KILL_SHAKE_MS = 400;
export const KILL_CONFIRM_MS = 220;

// Excludes 'x' so the kill shortcut can't accept itself on a double-tap.
const KILL_CONFIRM_CHARS = 'abcdefghijklmnopqrstuvwyz';
export function randomKillChar(): string {
  return KILL_CONFIRM_CHARS[Math.floor(Math.random() * KILL_CONFIRM_CHARS.length)];
}

export function KillConfirmCard({ char, onCancel, exit }: { char: string; onCancel?: () => void; exit?: KillExit }) {
  return (
    <div className={`bg-surface-raised border border-border px-6 py-4 rounded-lg text-center shadow-lg font-mono${exit === 'shake' ? ' motion-safe:animate-shake-x' : ''}`}>
      <h2 className="text-base font-bold mb-3 text-foreground">Confirm kill</h2>
      <div className="bg-app-bg py-2 px-6 rounded border border-border inline-block mb-2">
        <span className={`text-xl font-bold text-error${exit === 'confirm' ? ' kill-letter-flash' : ''}`}>{char}</span>
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
  const exitClass = confirmKill.exit === 'confirm' ? ' kill-overlay-confirm' : '';
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
        className={`flex items-center justify-center bg-app-bg/50 rounded${exitClass}`}
      >
        <KillConfirmCard char={confirmKill.char} onCancel={onCancel} exit={confirmKill.exit} />
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 bg-app-bg/50 z-[100] flex items-center justify-center${exitClass}`}>
      <KillConfirmCard char={confirmKill.char} onCancel={onCancel} exit={confirmKill.exit} />
    </div>
  );
}


// killInProgressRef is set across api.removePanel so the onDidRemovePanel
// auto-spawn handler skips its own 440ms delay — otherwise a last-pane kill
// stacks two 440ms waits.
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

  // Last-pane kill also shrinks toward bottom-right: the auto-spawn fills the
  // same rect from the top-left, so a plain fade would offer no cue.
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

    interface Pre { el: HTMLElement; rect: DOMRect; }
    const preRects = new Map<string, Pre>();
    for (const p of api.panels) {
      if (p.id === killedId) continue;
      const el = p.api.group?.element;
      if (el) preRects.set(p.id, { el, rect: el.getBoundingClientRect() });
    }

    bareRemove();

    for (const p of api.panels) {
      const pre = preRects.get(p.id);
      if (!pre) continue;
      const postRect = pre.el.getBoundingClientRect();
      const dw = postRect.width - pre.rect.width;
      const dh = postRect.height - pre.rect.height;
      if (Math.abs(dw) < 0.5 && Math.abs(dh) < 0.5) continue;

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

    // The overlay element may already have been reused by React for the next
    // selected pane by the time the animation finishes — peel the class so it
    // doesn't render at scale 0.
    if (overlayEl) overlayEl.classList.remove('ring-shrinking-to-br');
  };

  killedGroupEl.addEventListener('animationend', (ev) => {
    if ((ev as AnimationEvent).animationName !== fadeAnimationName) return;
    finalize();
  });
  // Safety: if animationend never fires, still finalize.
  setTimeout(finalize, 1000);
}
