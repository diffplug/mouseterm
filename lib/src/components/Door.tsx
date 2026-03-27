import { BellIcon } from '@phosphor-icons/react';
import { TODO_OFF, isSoftTodo, hasTodo, type SessionStatus, type TodoState } from '../lib/terminal-registry';

export interface DoorProps {
  doorId?: string;
  title: string;
  isActive?: boolean;
  status?: SessionStatus;
  todo?: TodoState;
  onClick?: () => void;
}

export function Door({
  doorId,
  title,
  isActive = false,
  status = 'ALARM_DISABLED',
  todo = TODO_OFF,
  onClick,
}: DoorProps) {
  // Doors can only be active in command mode (navigated to via arrow keys).
  // Pressing Enter restores the door into a pane, so passthrough+active is impossible.
  //
  // Always use a 2px border on all sides to prevent layout shift when
  // the dashed selection border appears. Inactive: bottom is transparent.

  const alarmEnabled = status !== 'ALARM_DISABLED';
  const alarmRinging = status === 'ALARM_RINGING';

  return (
    <button
      data-door-id={doorId}
      className={[
        'relative flex h-6 max-w-[220px] min-w-[68px] items-center gap-2 overflow-hidden px-2.5',
        'rounded-t-md',
        alarmRinging
          ? 'bg-warning/10 motion-safe:animate-pulse motion-reduce:animate-none ring-1 ring-warning/60'
          : 'bg-surface',
        'text-[10px] font-medium font-mono tracking-[0.02em]',
        'transition-colors hover:bg-surface-raised',
      ].join(' ')}
      style={{
        border: '2px solid var(--mt-border)',
        borderBottom: '2px solid transparent',
      }}
      onClick={onClick}
      title={title}
    >
      <span className={['min-w-0 flex-1 truncate', isActive ? 'text-foreground' : 'text-muted'].join(' ')}>
        {title}
      </span>
      {(hasTodo(todo) || alarmEnabled) && (
        <span className="flex shrink-0 items-center gap-1.5">
          {hasTodo(todo) && (
            <span
              className={[
                'rounded bg-surface-raised px-1 py-px text-[8px] font-semibold tracking-[0.08em] text-foreground',
                isSoftTodo(todo) ? 'border border-dashed border-border' : 'border border-border',
              ].join(' ')}
              style={isSoftTodo(todo) ? {
                opacity: 0.3 + 0.7 * todo,
                transform: `scale(${0.7 + 0.3 * todo})`,
                transition: 'opacity 0.15s ease, transform 0.15s ease',
              } : undefined}
            >
              TODO
            </span>
          )}
          {alarmEnabled && (
            <span className={['relative', alarmRinging ? 'text-warning' : isActive ? 'text-foreground' : 'text-muted'].join(' ')}>
              <BellIcon size={11} weight="fill" />
              {(status === 'MIGHT_BE_BUSY' || status === 'BUSY' || status === 'MIGHT_NEED_ATTENTION') && (
                <span className={[
                  'absolute -top-0.5 -right-0.5 h-1 w-1 rounded-full',
                  status === 'MIGHT_BE_BUSY' && 'bg-foreground/40',
                  status === 'BUSY' && 'bg-accent motion-safe:animate-alarm-dot motion-reduce:animate-none',
                  status === 'MIGHT_NEED_ATTENTION' && 'bg-warning/60 motion-safe:animate-alarm-dot motion-reduce:animate-none',
                ].filter(Boolean).join(' ')} />
              )}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
