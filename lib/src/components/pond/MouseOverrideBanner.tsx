import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { PopupButtonRow, popupButton } from '../design';

export function MouseOverrideBanner({
  anchor,
  onMakePermanent,
  onCancel,
}: {
  anchor: HTMLElement;
  onMakePermanent: () => void;
  onCancel: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [flashed, setFlashed] = useState<'sticky' | 'cancel' | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const r = anchor.getBoundingClientRect();
      setPos({ x: r.left, y: r.bottom + 4 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  useEffect(() => {
    if (!flashed) return;
    const id = window.setTimeout(() => {
      if (flashed === 'sticky') onMakePermanent();
      else onCancel();
    }, 260);
    return () => window.clearTimeout(id);
  }, [flashed, onMakePermanent, onCancel]);

  if (!pos) return null;

  return createPortal(
    <PopupButtonRow
      className="z-[9999]"
      style={clampOverlayPosition({ left: pos.x, top: pos.y, width: 340, height: 32 })}
      onMouseDown={(e) => e.stopPropagation()}
      role="status"
    >
      <span className="px-1.5 py-0.5">Temporary mouse override until mouse-up.</span>
      <button
        type="button"
        className={popupButton({ tone: 'muted', flashed: flashed === 'sticky' })}
        onClick={() => !flashed && setFlashed('sticky')}
      >Make sticky</button>
      <button
        type="button"
        className={popupButton({ tone: 'muted', flashed: flashed === 'cancel' })}
        onClick={() => !flashed && setFlashed('cancel')}
      >Cancel</button>
    </PopupButtonRow>,
    document.body,
  );
}

function clampOverlayPosition({ left, top, width, height }: {
  left: number;
  top: number;
  width: number;
  height: number;
}): CSSProperties {
  const margin = 12;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);

  return {
    position: 'fixed',
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}
