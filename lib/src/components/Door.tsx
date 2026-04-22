import { BellIcon } from '@phosphor-icons/react';
import { TODO_OFF, isSoftTodo, type SessionStatus, type TodoState } from '../lib/terminal-registry';
import { useTodoPillContent } from './TodoPillBody';
import { bellIconClass } from './bell-icon-class';

export interface DoorProps {
  doorId?: string;
  title: string;
  isActive?: boolean;
  windowFocused?: boolean;
  status?: SessionStatus;
  todo?: TodoState;
  onClick?: () => void;
}

export function Door({
  doorId,
  title,
  isActive = false,
  windowFocused = true,
  status = 'ALERT_DISABLED',
  todo = TODO_OFF,
  onClick,
}: DoorProps) {
  // Doors can only be active in command mode (navigated to via arrow keys).
  // Pressing Enter restores the door into a pane, so passthrough+active is impossible.
  //
  // Always use a 2px border on all sides to prevent layout shift when
  // the dashed selection border appears. Inactive: bottom is transparent.

  const alertEnabled = status !== 'ALERT_DISABLED';
  const alertRinging = status === 'ALERT_RINGING';
  const todoPill = useTodoPillContent(todo);

  return (
    <button
      data-door-id={doorId}
      className={[
        'relative flex h-6 max-w-[220px] min-w-[68px] items-center gap-2 overflow-hidden px-2.5',
        'rounded-t-md',
        'bg-surface',
        'text-[10px] font-medium font-mono tracking-[0.02em]',
        'transition-colors hover:bg-surface-raised',
      ].join(' ')}
      style={{
        border: '2px solid var(--color-border)',
        borderBottom: '2px solid transparent',
      }}
      onClick={onClick}
      title={title}
    >
      <span className={['min-w-0 flex-1 truncate', (isActive && windowFocused) ? 'text-foreground' : 'text-muted'].join(' ')}>
        {title}
      </span>
      {(todoPill.visible || alertEnabled) && (
        <span className="flex shrink-0 items-center gap-1.5">
          {todoPill.visible && (
            <span
              className={[
                'rounded bg-surface-raised px-1 py-px text-[8px] font-semibold tracking-[0.08em] text-foreground',
                isSoftTodo(todo) || todoPill.flourishing ? 'border border-dashed border-border' : 'border border-border',
              ].join(' ')}
            >
              {todoPill.body}
            </span>
          )}
          {alertEnabled && (
            <span className={[alertRinging ? 'text-warning' : (isActive && windowFocused) ? 'text-foreground' : 'text-muted'].join(' ')}>
              <BellIcon size={11} weight="fill" className={bellIconClass(status)} />
            </span>
          )}
        </span>
      )}
    </button>
  );
}
