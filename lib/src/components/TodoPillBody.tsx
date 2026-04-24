import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { TodoState } from '../lib/terminal-registry';

const FLOURISH_MS = 500;

/**
 * Shared render body + flourish state for the TODO pill.
 *
 * Returns `visible: false` when the pill should not render at all.
 * Returns `flourishing: true` briefly after a TODO clears, so the
 * caller can render a non-interactive wrapper (no click target).
 */
export function useTodoPillContent(todo: TodoState): {
  visible: boolean;
  flourishing: boolean;
  body: ReactNode;
} {
  const [flourishing, setFlourishing] = useState(false);
  const prevRef = useRef<TodoState>(todo);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = todo;
    if (prev && !todo) {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setFlourishing(true);
      timerRef.current = setTimeout(() => {
        setFlourishing(false);
        timerRef.current = null;
      }, FLOURISH_MS);
    }
  }, [todo]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const visible = todo || flourishing;

  let body: ReactNode = null;
  if (flourishing) {
    body = (
      <span className="todo-pill-flourish">
        <span className="todo-pill-flourish__letters">TODO</span>
        <span className="todo-pill-flourish__check" aria-hidden>
          ✓
        </span>
      </span>
    );
  } else if (todo) {
    body = <>TODO</>;
  }

  return { visible, flourishing, body };
}
