import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { XIcon } from '@phosphor-icons/react';
import { Shortcut } from './design';
import {
  clearSessionTodo,
  DEFAULT_ACTIVITY_STATE,
  disableSessionAlert,
  dismissOrToggleAlert,
  getActivity,
  getActivitySnapshot,
  markSessionTodo,
  subscribeToActivity,
  toggleSessionAlert,
  toggleSessionTodo,
} from '../lib/terminal-registry';

let dialogKeyboardActive = false;

/** Pond's command-mode keyboard handler consults this to avoid reacting to
 *  `a`/`t` while the dialog is open (the dialog has its own handlers). */
export function isDialogKeyboardActive(): boolean {
  return dialogKeyboardActive;
}

function pointInConvexPolygon(x: number, y: number, vertices: Array<{ x: number; y: number }>): boolean {
  let sign = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const cross = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
    if (cross === 0) continue;
    if (sign === 0) sign = cross > 0 ? 1 : -1;
    else if ((cross > 0 ? 1 : -1) !== sign) return false;
  }
  return true;
}

/**
 * Manages focus trapping, Escape-to-close, and click-outside-to-close for
 * portal-based popovers. Scopes keyboard handling to the popover's DOM subtree
 * so Tab/Escape don't leak to the rest of the app.
 */
function usePopoverFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  restoreFocusSelector?: string,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when focus is inside the popover
      if (!el.contains(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (focusables.length === 0) return;

      const currentIndex = focusables.findIndex((f) => f === document.activeElement);
      const nextIndex = currentIndex === -1
        ? 0
        : (currentIndex + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;

      e.preventDefault();
      focusables[nextIndex]?.focus();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (restoreFocusSelector) {
        document.querySelector<HTMLElement>(restoreFocusSelector)?.focus();
      }
    };
  }, [ref, onClose, restoreFocusSelector]);
}

export function TodoAlertDialog({
  triggerRect,
  sessionId,
  onClose,
}: {
  triggerRect: DOMRect;
  sessionId: string;
  onClose: () => void;
}) {
  const activityStates = useSyncExternalStore(subscribeToActivity, getActivitySnapshot);
  const activity = activityStates.get(sessionId) ?? DEFAULT_ACTIVITY_STATE;
  const alertEnabled = activity.status !== 'ALERT_DISABLED';
  const dialogRef = useRef<HTMLDivElement>(null);

  usePopoverFocusTrap(dialogRef, onClose, `[data-alert-button-for="${sessionId}"]`);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);

  // Keyboard shortcuts within dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    dialogKeyboardActive = true;
    const handler = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement)) return;
      if (e.key === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        dismissOrToggleAlert(sessionId, getActivity(sessionId).status);
      }
      if (e.key === 't') {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleSessionTodo(sessionId);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      dialogKeyboardActive = false;
      window.removeEventListener('keydown', handler, true);
    };
  }, [sessionId]);

  // Hot area: close when mouse leaves (dialog ∪ funnel from trigger button to dialog top).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = (e: MouseEvent) => {
      const dialogRect = dialog.getBoundingClientRect();
      const { clientX: x, clientY: y } = e;
      if (x >= dialogRect.left && x <= dialogRect.right && y >= dialogRect.top && y <= dialogRect.bottom) return;
      const funnel = [
        { x: triggerRect.left, y: triggerRect.top },
        { x: triggerRect.right, y: triggerRect.top },
        { x: dialogRect.right, y: dialogRect.top },
        { x: dialogRect.left, y: dialogRect.top },
      ];
      if (pointInConvexPolygon(x, y, funnel)) return;
      onClose();
    };
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, [triggerRect, onClose]);

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed z-[9999] w-fit rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
      style={{ left: triggerRect.left, top: triggerRect.bottom + 8 }}
      role="dialog"
      aria-modal="true"
      aria-label="TODO and alert settings"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute right-2 top-2 rounded p-0.5 text-muted hover:bg-foreground/10 hover:text-foreground"
        onClick={onClose}
      >
        <XIcon size={12} weight="bold" />
      </button>

      <div className="mb-3 grid w-fit grid-cols-[auto_auto_auto] items-center gap-x-2 gap-y-2">
        {/* TODO row */}
        <Shortcut>t</Shortcut>
        <span className="text-xs font-medium text-foreground">TODO</span>
        <OnOffSwitch
          on={activity.todo}
          onEnable={() => markSessionTodo(sessionId)}
          onDisable={() => clearSessionTodo(sessionId)}
          label="TODO"
        />

        {/* Alert row */}
        <Shortcut>a</Shortcut>
        <span className="text-xs font-medium text-foreground">alert</span>
        <OnOffSwitch
          on={alertEnabled}
          onEnable={() => toggleSessionAlert(sessionId)}
          onDisable={() => disableSessionAlert(sessionId)}
          label="alert"
        />
      </div>

      <div className="border-t border-border pt-2 text-xs leading-relaxed text-muted">
        When a tab with a ringing alert is selected,<br />
        the alert is cleared and the tab gets a TODO.<br />
        Pressing [Enter] into the tab will clear the TODO.
      </div>
    </div>,
    document.body,
  );
}

function OnOffSwitch({
  on,
  onEnable,
  onDisable,
  label,
}: {
  on: boolean;
  onEnable: () => void;
  onDisable: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${label} ${on ? 'on' : 'off'}`}
      onClick={() => (on ? onDisable() : onEnable())}
      className="relative inline-flex h-5 w-14 items-center rounded-full border border-border bg-surface text-xs font-medium"
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 w-[calc(50%-2px)] rounded-full bg-accent/25 transition-transform"
        style={{ transform: on ? 'translateX(2px)' : 'translateX(calc(100% + 2px))' }}
      />
      <span className={['z-10 flex-1 text-center', on ? 'text-accent' : 'text-muted'].join(' ')}>on</span>
      <span className={['z-10 flex-1 text-center', on ? 'text-muted' : 'text-accent'].join(' ')}>off</span>
    </button>
  );
}
