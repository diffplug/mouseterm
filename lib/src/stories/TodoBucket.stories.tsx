import { useState, useCallback } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { Door } from '../components/Door';
import { TODO_OFF, TODO_SOFT_FULL, TODO_HARD, isSoftTodo } from '../lib/terminal-registry';
import { cfg } from '../cfg';

const BUCKET_TIME_TO_FULL_MS = cfg.todoBucket.timeToFullSeconds * 1_000;
const BUCKET_KEYPRESSES_TO_EMPTY = cfg.todoBucket.keypressesToEmpty;

/**
 * Interactive story to test the soft-TODO bucket feel.
 * Type in the input to drain the bucket. Stop typing to let it refill.
 */
function TodoBucketDemo({ width = 300 }: { width?: number }) {
  const [todo, setTodo] = useState(TODO_SOFT_FULL);
  const [lastDrainAt, setLastDrainAt] = useState(0);
  const [refillTimer, setRefillTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const drain = useCallback(() => {
    setTodo((prev) => {
      if (!isSoftTodo(prev)) return prev;

      const now = Date.now();
      let level = prev;

      // Apply refill based on time since last drain
      if (lastDrainAt > 0) {
        const elapsed = now - lastDrainAt;
        level = Math.min(TODO_SOFT_FULL, level + elapsed / BUCKET_TIME_TO_FULL_MS);
      }

      // Drain by one keypress
      level = level - 1 / BUCKET_KEYPRESSES_TO_EMPTY;
      setLastDrainAt(now);

      if (level < 1e-9) {
        if (refillTimer) clearTimeout(refillTimer);
        setRefillTimer(null);
        return TODO_OFF;
      }

      // Schedule refill
      if (refillTimer) clearTimeout(refillTimer);
      const timer = setTimeout(() => {
        setTodo(TODO_SOFT_FULL);
        setLastDrainAt(0);
        setRefillTimer(null);
      }, (TODO_SOFT_FULL - level) * BUCKET_TIME_TO_FULL_MS);
      setRefillTimer(timer);

      return level;
    });
  }, [lastDrainAt, refillTimer]);

  const reset = useCallback(() => {
    if (refillTimer) clearTimeout(refillTimer);
    setRefillTimer(null);
    setTodo(1);
    setLastDrainAt(0);
  }, [refillTimer]);

  const bucketPercent = isSoftTodo(todo) ? Math.round(todo * 100) : todo === TODO_HARD ? 100 : 0;
  const label = todo === TODO_OFF ? 'OFF' : todo === TODO_HARD ? 'HARD' : `SOFT (${bucketPercent}%)`;

  return (
    <div style={{ width, padding: 24 }}>
      <div className="mb-4 text-[11px] text-muted">
        Type in the box below to drain the soft-TODO bucket.
        Stop typing and it will refill over {cfg.todoBucket.timeToFullSeconds}s.
        Takes {cfg.todoBucket.keypressesToEmpty} rapid keypresses to empty.
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
              width: `${bucketPercent}%`,
              backgroundColor: isSoftTodo(todo)
                ? `hsl(${120 * todo}, 60%, 50%)`
                : todo === TODO_HARD ? 'hsl(220, 60%, 50%)' : 'transparent',
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-muted w-20 text-right">{label}</span>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 rounded border border-border bg-surface px-2 py-1 text-[12px] font-mono text-foreground outline-none focus:border-accent"
          placeholder="Type here to drain..."
          onKeyDown={(e) => {
            if (e.key.length === 1) drain();
          }}
          autoFocus
        />
      </div>

      <div className="flex gap-2">
        <button
          className="rounded border border-border px-3 py-1 text-[11px] text-foreground hover:bg-foreground/10"
          onClick={reset}
        >
          Reset to soft
        </button>
        <button
          className="rounded border border-border px-3 py-1 text-[11px] text-foreground hover:bg-foreground/10"
          onClick={() => { if (refillTimer) clearTimeout(refillTimer); setRefillTimer(null); setTodo(TODO_HARD); }}
        >
          Set hard
        </button>
        <button
          className="rounded border border-border px-3 py-1 text-[11px] text-foreground hover:bg-foreground/10"
          onClick={() => { if (refillTimer) clearTimeout(refillTimer); setRefillTimer(null); setTodo(TODO_OFF); }}
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
