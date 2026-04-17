import { useCallback, useEffect, useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Door } from '../components/Door';
import { TODO_OFF, TODO_SOFT_FULL, TODO_HARD, isSoftTodo } from '../lib/terminal-registry';
import { cfg } from '../cfg';

const STRIKE_RECOVERY_MS = cfg.todoBucket.recoverySecondsPerLetter * 1_000;
const STRIKE_STEP = 0.25;

/**
 * Interactive story to test the soft-TODO strike feel.
 * Type in the input to strike one letter per printable keypress.
 * Stop typing and one letter recovers every `recoverySecondsPerLetter` seconds.
 */
function TodoBucketDemo({ width = 300 }: { width?: number }) {
  const [todo, setTodo] = useState(TODO_SOFT_FULL);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRecoveryTimer = useCallback(() => {
    if (recoveryTimerRef.current !== null) {
      clearTimeout(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
  }, []);

  const scheduleRecoveryTick = useCallback(() => {
    clearRecoveryTimer();
    const tick = () => {
      recoveryTimerRef.current = null;
      setTodo((prev) => {
        if (!isSoftTodo(prev)) return prev;
        const next = Math.min(TODO_SOFT_FULL, prev + STRIKE_STEP);
        if (next < TODO_SOFT_FULL) {
          recoveryTimerRef.current = setTimeout(tick, STRIKE_RECOVERY_MS);
        }
        return next;
      });
    };
    recoveryTimerRef.current = setTimeout(tick, STRIKE_RECOVERY_MS);
  }, [clearRecoveryTimer]);

  const strike = useCallback(() => {
    setTodo((prev) => {
      if (!isSoftTodo(prev)) return prev;
      const next = prev - STRIKE_STEP;
      if (next < 1e-9) {
        clearRecoveryTimer();
        return TODO_OFF;
      }
      scheduleRecoveryTick();
      return next;
    });
  }, [clearRecoveryTimer, scheduleRecoveryTick]);

  useEffect(() => clearRecoveryTimer, [clearRecoveryTimer]);

  const reset = useCallback(() => {
    clearRecoveryTimer();
    setTodo(TODO_SOFT_FULL);
  }, [clearRecoveryTimer]);

  const strikes = isSoftTodo(todo) ? Math.round((1 - todo) * 4) : 0;
  const label = todo === TODO_OFF
    ? 'OFF'
    : todo === TODO_HARD
      ? 'HARD'
      : `SOFT (${strikes}/4 strikes)`;

  return (
    <div style={{ width, padding: 24 }}>
      <div className="mb-4 text-xs text-muted">
        Type in the box below — each printable keypress strikes one letter of TODO.
        Stop typing and one letter recovers every {cfg.todoBucket.recoverySecondsPerLetter}s.
        4 strikes clears the TODO (watch for the ✓ flourish).
      </div>

      <div className="mb-4">
        <div className="bg-surface-alt flex h-16 items-end border-t border-border px-4">
          <Door title="build-server" status="NOTHING_TO_SHOW" todo={todo} />
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="h-3 flex-1 rounded-full bg-surface-alt border border-border overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150 ease-out"
            style={{
              width: `${isSoftTodo(todo) ? todo * 100 : todo === TODO_HARD ? 100 : 0}%`,
              backgroundColor: isSoftTodo(todo)
                ? `hsl(${120 * todo}, 60%, 50%)`
                : todo === TODO_HARD ? 'hsl(220, 60%, 50%)' : 'transparent',
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted w-24 text-right">{label}</span>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-xs font-mono text-foreground outline-none focus:border-accent"
          placeholder="Type here to strike letters..."
          onKeyDown={(e) => {
            if (e.key.length === 1) strike();
          }}
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <button
          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-foreground/10"
          onClick={reset}
        >
          Reset to soft
        </button>
        <button
          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-foreground/10"
          onClick={() => { clearRecoveryTimer(); setTodo(TODO_HARD); }}
        >
          Set hard
        </button>
        <button
          className="rounded border border-border px-3 py-1 text-xs text-foreground hover:bg-foreground/10"
          onClick={() => { clearRecoveryTimer(); setTodo(TODO_OFF); }}
        >
          Set off
        </button>
      </div>
    </div>
  );
}

const meta: Meta<typeof TodoBucketDemo> = {
  title: 'Interactions/TodoBucket',
  component: TodoBucketDemo,
  args: {
    width: 300,
  },
  argTypes: {
    width: { control: 'number' },
  },
};

export default meta;
type Story = StoryObj<typeof TodoBucketDemo>;

export const Interactive: Story = {};
