import { clsx } from 'clsx';
import { tv, type VariantProps } from 'tailwind-variants';
import type { HTMLAttributes } from 'react';

export function PopupButtonRow({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'flex items-stretch overflow-hidden rounded border border-border bg-surface-raised text-xs text-foreground shadow-md',
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
