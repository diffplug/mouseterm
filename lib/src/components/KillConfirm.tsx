import { useLayoutEffect, useState } from 'react';
import { resolvePanelElement } from '../lib/spatial-nav';
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
        <span
          className={`text-xl font-bold${exit === 'confirm' ? ' kill-letter-flash' : ''}`}
          style={{ color: 'var(--color-error)' }}
        >
          {char}
        </span>
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


