import { clsx } from 'clsx';
import { tv, type VariantProps } from 'tailwind-variants';
import type { HTMLAttributes, ReactNode } from 'react';

// App-wide type scale, color strategy, and chrome conventions: see
// docs/specs/theme.md and AGENTS.md.

// Pane headers/doors own the top corners; terminal bodies own the bottom.
// Keep the CSS class, the px (used in SVG), and the rem string in lockstep.
const TERMINAL_BORDER_RADIUS_REM = 0.5;
export const TERMINAL_BORDER_RADIUS_PX = 8;
export const TERMINAL_TOP_RADIUS_CLASS = 'rounded-t-lg';
export const TERMINAL_BOTTOM_RADIUS_CLASS = 'rounded-b-lg';
export const TERMINAL_SELECTION_BORDER_RADIUS = `${TERMINAL_BORDER_RADIUS_REM}rem`;
export const DOOR_SELECTION_BORDER_RADIUS = `${TERMINAL_BORDER_RADIUS_REM}rem ${TERMINAL_BORDER_RADIUS_REM}rem 0 0`;

export function PopupButtonRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'flex items-stretch overflow-hidden rounded border border-border bg-surface-raised font-mono text-sm text-foreground shadow-md',
        className,
      )}
      {...props}
    />
  );
}

export const popupButton = tv({
  base: 'm-0 px-1.5 py-0.5',
  variants: {
    tone: {
      foreground: '',
      muted: 'text-muted hover:text-foreground',
    },
    flashed: {
      true: 'animate-copy-flash bg-header-active-bg/25 text-header-active-bg',
      false: 'hover:bg-foreground/10',
    },
  },
  defaultVariants: { tone: 'foreground', flashed: false },
});

export type PopupButtonVariants = VariantProps<typeof popupButton>;

/** Keyboard shortcut rendered as `[keys]` in muted color. Use everywhere key
 *  bindings appear in UI text so the bracket convention is consistent. */
export function Shortcut({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={clsx('text-muted', className)}>[{children}]</span>;
}

/** Render a string with any `[...]` segments replaced by <Shortcut>. */
export function renderShortcuts(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /\[([^\]]+)\]/g;
  let lastIndex = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<Shortcut key={idx++}>{match[1]}</Shortcut>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
