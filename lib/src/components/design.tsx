import { clsx } from 'clsx';
import { tv, type VariantProps } from 'tailwind-variants';
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * App-wide type scale. Use one of these four rem-based classes for every
 * font-size — never `text-[9px]` or other arbitrary pixel values.
 *
 *   text-xs    (10px) — TODO indicators (Door letters in baseboard, Pond tab pill)
 *   text-sm    (12px) — default UI body: tab titles, buttons, dialog labels,
 *                       popups, help text, baseboard, ThemePicker
 *   text-base  (16px) — dialog titles
 *   text-xl    (20px) — single-purpose emphasis (the KillConfirm character)
 *
 * `text-xs` and `text-sm` are overridden in theme.css (Tailwind's defaults
 * would be 12px and 14px); `text-base` and `text-xl` are stock.
 */

/**
 * Color strategy — see also `lib/src/theme.css` for the actual @theme tokens.
 *
 * Surfaces (3 distinct + 1 dynamic). All resolve directly through VSCode CSS
 * vars. Real VSCode provides them in extension mode; standalone/website apply
 * them from bundled or installed MouseTerm themes before rendering.
 *
 *   --color-app           sideBar.background
 *                            baseboard, dockview gutters, gaps around panes
 *   --color-terminal-bg      terminal.background
 *                            terminal container + xterm default bg
 *   --color-header-inactive-bg   list.inactiveSelectionBackground
 *                            unfocused pane headers
 *   --color-header-active-bg     list.activeSelectionBackground
 *                            focused pane header + the marching-ants ring
 *   --color-door-bg          runtime: whichever of (header-inactive, terminal)
 *                            has the larger ΔE OKLab vs the app background
 *                            (see Pond.useDynamicPalette)
 *
 * Foregrounds:
 *
 *   --color-on-app           sideBar.foreground (text on the app background)
 *   --color-foreground       editor.foreground (generic body text)
 *   --color-muted            descriptionForeground (hints, secondary)
 *   --color-header-active-fg / --color-header-inactive-fg
 *                            paired with their bg counterparts
 *   --color-door-fg          runtime, paired with --color-door-bg
 *
 * Inside a pane header, **text and buttons inherit** the header's fg — never
 * give them an explicit text-muted/text-foreground class. Hover feedback is
 * `hover:bg-current/10` (currentColor at 10% alpha) so it follows whatever
 * fg the header is currently using. Semantic exceptions: `text-warning` for
 * a ringing bell; `hover:bg-error/10 hover:text-error` for the kill button.
 *
 * Selection ring: --color-focus-ring is published by Pond.useDynamicPalette
 * by ranking (header-active-bg, header-active-fg, --vscode-focusBorder)
 * with a 3-tier rule:
 *   1. **Match panel-active-bg** if its absolute OKLab chroma is ≥ 0.05
 *      — i.e., it's a "real color", not a translucent grey overlay.
 *      Visually unifies the ring with the focused header.
 *   2. Else the most-saturated of (header-active-fg, focusBorder) that
 *      clears the same absolute chroma floor.
 *   3. Else max ΔE OKLab against the app background (greyscale-theme fallback).
 * Absolute chroma is used (not chroma-vs-app-background) so themes whose app
 * background is itself mildly saturated (e.g. Solarized) don't underweight clearly-
 * chromatic candidates. Both the marching-ants overlay and the terminal
 * text-selection border read --color-focus-ring.
 *
 * Doors: bg-only chrome with no border and no hover. The dynamic
 * --color-door-bg is recomputed whenever the theme changes (Baseboard's
 * MutationObserver on body class/style).
 *
 * Other tokens kept narrow: --color-surface-raised (dialog bodies),
 * --color-border (dialog edges, dividers), --color-error / --color-warning /
 * --color-success (mapped to terminal ANSI red/yellow/green),
 * --color-input-bg / --color-input-border (ThemePicker only).
 *
 * Things to avoid:
 *   - Hardcoded colors (`bg-black`, hex values) — always go through a token.
 *   - Reintroducing tokens we removed: tab-active-*, tab-inactive-*,
 *     tab-selected-*, accent, surface, surface-alt, badge-*, button-*. Use the
 *     header-* / app-* / terminal-* set instead.
 *   - Conditional `text-muted hover:text-foreground` inside a header — let
 *     the inherited fg do the work and use bg-current/10 for hover.
 *
 * High-contrast VSCode themes are an accepted trade-off: bg-only chrome
 * renders flat in HC themes (their design conveys structure via borders).
 * Terminal content keeps its HC ANSI palette regardless.
 */

/**
 * Shared terminal chrome radius. Pane headers/doors own the top corners while
 * terminal bodies own the bottom corners; keep the CSS and SVG values aligned.
 */
export const TERMINAL_BORDER_RADIUS_REM = 0.5;
export const TERMINAL_BORDER_RADIUS_PX = 8;
export const TERMINAL_TOP_RADIUS_CLASS = 'rounded-t-lg';
export const TERMINAL_BOTTOM_RADIUS_CLASS = 'rounded-b-lg';
export const DOOR_RADIUS_CLASS = TERMINAL_TOP_RADIUS_CLASS;
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
