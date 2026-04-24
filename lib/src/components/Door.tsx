import { BellIcon } from '@phosphor-icons/react';
import type { SessionStatus, TodoState } from '../lib/terminal-registry';
import { useTodoPillContent } from './TodoPillBody';
import { bellIconClass } from './bell-icon-class';

export interface DoorProps {
  doorId?: string;
  title: string;
  status?: SessionStatus;
  todo?: TodoState;
  onClick?: () => void;
}

export function Door({
  doorId,
  title,
  status = 'ALERT_DISABLED',
  todo = false,
  onClick,
}: DoorProps) {
  // Command-mode focus is shown by the shared marching-ants selection ring
  // (from Pond.tsx SelectionOverlay), so the door doesn't track active state
  // itself — it always renders with inactive-header colors and lets the ring
  // do the signaling.

  const alertEnabled = status !== 'ALERT_DISABLED';
  const alertRinging = status === 'ALERT_RINGING';
  const todoPill = useTodoPillContent(todo);

  return (
    <button
      data-door-id={doorId}
      className={[
        'relative flex h-6 max-w-[220px] min-w-[68px] items-center gap-2 overflow-hidden px-2.5',
        'rounded-t-md',
        'bg-header-inactive-bg text-header-inactive-fg',
        'text-sm font-medium font-mono tracking-[0.02em]',
        'transition-colors hover:bg-header-active-bg hover:text-header-active-fg',
      ].join(' ')}
      style={{
        borderTop: '2px solid var(--color-border)',
        borderLeft: '2px solid var(--color-border)',
        borderRight: '2px solid var(--color-border)',
      }}
      onClick={onClick}
      title={title}
    >
      <span className="min-w-0 flex-1 truncate">
        {title}
      </span>
      {(todoPill.visible || alertEnabled) && (
        <span className="flex shrink-0 items-center gap-1.5">
          {todoPill.visible && (
            <span
              className="todo-pill-shell text-xs font-semibold tracking-[0.08em]"
              data-flourishing={todoPill.flourishing ? 'true' : 'false'}
            >
              {todoPill.body}
            </span>
          )}
          {alertEnabled && (
            <span className={alertRinging ? 'text-warning' : ''}>
              <BellIcon size={11} weight="fill" className={bellIconClass(status)} />
            </span>
          )}
        </span>
      )}
    </button>
  );
}
