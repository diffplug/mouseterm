import { clsx } from 'clsx';
import { tv, type VariantProps } from 'tailwind-variants';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * App-wide type scale. Use one of these five rem-based classes for every
 * font-size — never `text-[9px]` or other arbitrary pixel values.
 *
 *   text-micro  (10px) — badges, baseboard/door metadata, tab-bar hints
 *   text-xs     (12px) — default UI body: dialog labels, buttons, popups, help text
 *   text-sm     (14px) — section headers inside dialogs
 *   text-base   (16px) — dialog titles
 *   text-xl     (20px) — single-purpose emphasis (the KillConfirm character)
 *
 * `text-micro` is registered in theme.css; the rest are stock Tailwind.
 */

export function PopupButtonRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'flex items-stretch overflow-hidden rounded border border-border bg-surface-raised font-mono text-xs text-foreground shadow-md',
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
      true: 'animate-copy-flash bg-accent/25 text-accent',
      false: 'hover:bg-foreground/10',
    },
  },
  defaultVariants: { tone: 'foreground', flashed: false },
});

export type PopupButtonVariants = VariantProps<typeof popupButton>;

/**
 * A keyboard shortcut rendered as `[keys]` in muted color. Use this everywhere
 * key bindings appear in UI text, so the bracket convention and tone are
 * consistent. Pass `className` to override the tone for special states.
 */
export function Shortcut({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={clsx('text-muted', className)}>[{children}]</span>;
}

/**
 * Render a string with any `[...]` segments replaced by <Shortcut>. Use when
 * the shortcut is embedded inline in a label (e.g., "Split left/right [" or |]").
 */
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
