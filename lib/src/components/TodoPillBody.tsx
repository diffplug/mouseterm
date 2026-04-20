import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  hasTodo,
  isHardTodo,
  isSoftTodo,
  TODO_OFF,
  type TodoState,
} from '../lib/terminal-registry';

interface StrikeLetterProps {
  char: string;
  strike: boolean;
}

function StrikeLetter({ char, strike }: StrikeLetterProps) {
  return (
    <span className="strike-letter" data-strike={strike ? 'true' : 'false'}>
      {char}
    </span>
  );
}

const TODO_LETTERS = ['T', 'O', 'D', 'O'] as const;
const FLOURISH_MS = 500;

/**
 * Shared render body + flourish state for the soft/hard TODO pill.
 *
 * Returns `visible: false` when the pill should not render at all.
 * Returns `flourishing: true` briefly after a soft TODO clears, so the
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
    if (isSoftTodo(prev) && todo === TODO_OFF) {
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

  const visible = hasTodo(todo) || flourishing;

  let body: ReactNode = null;
  if (flourishing) {
    body = (
      <span className="todo-pill-flourish">
        <span className="todo-pill-flourish__letters">
          {TODO_LETTERS.map((ch, i) => (
            <StrikeLetter key={i} char={ch} strike />
          ))}
        </span>
        <span className="todo-pill-flourish__check" aria-hidden>
          ✓
        </span>
      </span>
    );
  } else if (isSoftTodo(todo)) {
    const strikes = Math.round((1 - todo) * 4);
    body = (
      <span className="inline-flex">
        {TODO_LETTERS.map((ch, i) => (
          <StrikeLetter key={i} char={ch} strike={strikes > i} />
        ))}
      </span>
    );
  } else if (isHardTodo(todo)) {
    body = <>TODO</>;
  }

  return { visible, flourishing, body };
}
