import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { TodoState } from '../lib/terminal-registry';

const FLOURISH_MS = 500;

/**
 * Shared render body + flourish state for the TODO pill.
 *
 * Returns `visible: false` when the pill should not render at all.
 * Returns `flourishing: true` briefly after a TODO clears so the
 * caller can set `data-flourishing="true"` on its pill shell.
 *
 * The body is a grid-stacked <letters, check> so the pill width stays
 * stable across steady/flourishing states — the CSS drives the animation.
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

  const body: ReactNode = visible ? (
    <span className="todo-pill-stack">
      <span className="todo-pill-stack__letters">TODO</span>
      <span className="todo-pill-stack__check" aria-hidden>✓</span>
    </span>
  ) : null;

  return { visible, flourishing, body };
}
