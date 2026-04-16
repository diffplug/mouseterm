import { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo, createContext, useContext, useSyncExternalStore } from 'react';
import {
  DockviewReact,
  themeAbyss,
  type DockviewTheme,
  type DockviewReadyEvent,
  type DockviewApi,
  type SerializedDockview,
  type IDockviewPanelProps,
  type IDockviewPanelHeaderProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { createPortal } from 'react-dom';
import { TerminalPane } from './TerminalPane';
import { Baseboard } from './Baseboard';
import { tv } from 'tailwind-variants';
import { BellIcon, BellSlashIcon, SplitHorizontalIcon, SplitVerticalIcon, ArrowsOutIcon, ArrowsInIcon, ArrowLineDownIcon, XIcon } from '@phosphor-icons/react';
import {
  type AlarmButtonActionResult,
  clearSessionAttention,
  clearSessionTodo,
  DEFAULT_SESSION_UI_STATE,
  disableSessionAlarm,
  dismissOrToggleAlarm,
  focusTerminal,
  getSessionState,
  getSessionStateSnapshot,
  markSessionAttention,
  markSessionTodo,
  subscribeToSessionStateChanges,
  toggleSessionAlarm,
  toggleSessionTodo,
  destroyTerminal,
  swapTerminals,
  setPendingShellOpts,
  type SessionStatus,
} from '../lib/terminal-registry';
import { resolvePanelElement, findPanelInDirection, findRestoreNeighbor, type DetachDirection } from '../lib/spatial-nav';
import { cloneLayout, getLayoutStructureSignature } from '../lib/layout-snapshot';
import { getPlatform } from '../lib/platform';
import { saveSession } from '../lib/session-save';
import type { PersistedDetachedItem } from '../lib/session-types';
import { cfg } from '../cfg';

// --- Theme ---

const mousetermTheme: DockviewTheme = {
  ...themeAbyss,
  name: 'mouseterm',
  gap: 6,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
};

let dialogKeyboardActive = false;

// --- Types ---

export interface DetachedItem {
  id: string;
  title: string;
  neighborId: string | null;       // panel that was adjacent before detach
  direction: DetachDirection;       // where we were relative to that neighbor
  remainingPanelIds: string[];      // sorted panel IDs after detach (for layout-changed check)
  restoreLayout: SerializedDockview | null;
  detachedLayoutSignature: string;
}

function toDetachedItem(item: PersistedDetachedItem): DetachedItem {
  return {
    ...item,
    restoreLayout: item.restoreLayout as SerializedDockview | null,
  };
}

interface ConfirmKill {
  id: string;
  char: string;
}

export type PondMode = 'command' | 'passthrough';

export type PondEvent =
  | { type: 'modeChange'; mode: PondMode }
  | { type: 'zoomChange'; zoomed: boolean }
  | { type: 'detachChange'; count: number }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; source: 'keyboard' | 'mouse' }
  | { type: 'selectionChange'; id: string | null; kind: 'pane' | 'door' };

// --- Variants ---

const tabVariant = tv({
  base: 'flex h-full w-full cursor-grab items-center gap-1.5 rounded-t pl-2 pr-[5px] text-[12px] leading-none font-mono tracking-normal select-none active:cursor-grabbing',
  variants: {
    state: {
      selected: 'bg-tab-selected-bg text-tab-selected-fg',
      inactive: 'bg-tab-inactive-bg text-tab-inactive-fg',
    },
  },
});

interface HeaderActionButtonProps {
  className: string;
  ariaLabel: string;
  tooltip?: string;
  onMouseDownCapture?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseDown?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  dataAlarmButtonFor?: string;
}

function HeaderActionButton({
  className,
  ariaLabel,
  tooltip,
  onMouseDownCapture,
  onMouseDown,
  onClick,
  onContextMenu,
  children,
  dataAlarmButtonFor,
}: HeaderActionButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties | null>(null);
  const tooltipText = tooltip ?? ariaLabel;

  useEffect(() => {
    if (!isVisible || !buttonRef.current) return;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltipStyle({
        position: 'fixed',
        left: rect.left + rect.width / 2,
        top: rect.top - 8,
        transform: 'translate(-50%, -100%)',
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isVisible]);

  return (
    <>
    <div className="relative flex shrink-0 items-center">
      <button
        ref={buttonRef}
        type="button"
        className={className}
        data-alarm-button-for={dataAlarmButtonFor}
        onMouseDownCapture={onMouseDownCapture}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onMouseDown?.(e);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick(e);
        }}
        onContextMenu={onContextMenu ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e);
        } : undefined}
        aria-label={ariaLabel}
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
      >
        {children}
      </button>
    </div>
    {isVisible && tooltipStyle && createPortal(
      <span
        className="pointer-events-none z-[9999] whitespace-nowrap rounded border border-border bg-surface-raised px-2 py-1.5 text-[11px] leading-none text-foreground shadow-sm"
        style={tooltipStyle}
      >
        {tooltipText}
      </span>,
      document.body,
    )}
    </>
  );
}

// --- Alarm context menu (right-click on bell) ---

function clampOverlayPosition({ left, top, width, height }: {
  left: number;
  top: number;
  width: number;
  height: number;
}): React.CSSProperties {
  const margin = 12;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);

  return {
    position: 'fixed',
    left: Math.min(Math.max(left, margin), maxLeft),
    top: Math.min(Math.max(top, margin), maxTop),
  };
}

/**
 * Manages focus trapping, Escape-to-close, and click-outside-to-close for
 * portal-based popovers. Scopes keyboard handling to the popover's DOM subtree
 * so Tab/Escape don't leak to the rest of the app.
 */
function usePopoverFocusTrap(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  restoreFocusSelector?: string,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (!el.contains(e.target as Node)) onClose();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keys when focus is inside the popover
      if (!el.contains(document.activeElement)) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const focusables = Array.from(
        el.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      );
      if (focusables.length === 0) return;

      const currentIndex = focusables.findIndex((f) => f === document.activeElement);
      const nextIndex = currentIndex === -1
        ? 0
        : (currentIndex + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length;

      e.preventDefault();
      focusables[nextIndex]?.focus();
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKeyDown, true);
      if (restoreFocusSelector) {
        document.querySelector<HTMLElement>(restoreFocusSelector)?.focus();
      }
    };
  }, [ref, onClose, restoreFocusSelector]);
}

function TodoAlarmDialog({
  position,
  sessionId,
  onClose,
}: {
  position: { x: number; y: number };
  sessionId: string;
  onClose: () => void;
}) {
  const sessionStates = useSyncExternalStore(subscribeToSessionStateChanges, getSessionStateSnapshot);
  const sessionState = sessionStates.get(sessionId) ?? DEFAULT_SESSION_UI_STATE;
  const alarmEnabled = sessionState.status !== 'ALARM_DISABLED';
  const dialogRef = useRef<HTMLDivElement>(null);

  usePopoverFocusTrap(dialogRef, onClose, `[data-alarm-button-for="${sessionId}"]`);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, []);

  // Keyboard shortcuts within dialog
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    dialogKeyboardActive = true;
    const handler = (e: KeyboardEvent) => {
      if (!el.contains(document.activeElement)) return;
      if (e.key === 'a') {
        e.preventDefault();
        e.stopImmediatePropagation();
        dismissOrToggleAlarm(sessionId, getSessionState(sessionId).status);
      }
      if (e.key === 't') {
        e.preventDefault();
        e.stopImmediatePropagation();
        toggleSessionTodo(sessionId);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => {
      dialogKeyboardActive = false;
      window.removeEventListener('keydown', handler, true);
    };
  }, [sessionId]);

  const toggleBtn = (active: boolean) => [
    'rounded px-2 py-1 text-[11px] font-medium transition-colors',
    active
      ? 'bg-accent/20 text-accent border border-accent/40'
      : 'text-muted border border-border hover:bg-foreground/10 hover:text-foreground',
  ].join(' ');

  return createPortal(
    <div
      ref={dialogRef}
      className="z-[9999] w-[280px] rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
      style={clampOverlayPosition({ left: position.x, top: position.y, width: 280, height: 160 })}
      role="dialog"
      aria-modal="true"
      aria-label="TODO and alarm settings"
    >
      {/* TODO row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-mono text-muted">[t]</span>
        <span className="text-[11px] text-foreground font-medium w-10">TODO</span>
        <div className="flex gap-1 ml-auto">
          <button type="button" className={toggleBtn(sessionState.todo === 'hard')}
            onClick={() => { if (sessionState.todo !== 'hard') markSessionTodo(sessionId); }}>
            hard
          </button>
          <button type="button" className={toggleBtn(sessionState.todo === false)}
            onClick={() => { if (sessionState.todo !== false) clearSessionTodo(sessionId); }}>
            off
          </button>
        </div>
      </div>

      {/* Alarm row */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-mono text-muted">[a]</span>
        <span className="text-[11px] text-foreground font-medium w-10">alarm</span>
        <div className="flex gap-1 ml-auto">
          <button type="button" className={toggleBtn(alarmEnabled)}
            onClick={() => { if (!alarmEnabled) toggleSessionAlarm(sessionId); }}>
            enabled
          </button>
          <button type="button" className={toggleBtn(!alarmEnabled)}
            onClick={() => { if (alarmEnabled) disableSessionAlarm(sessionId); }}>
            disabled
          </button>
        </div>
      </div>

      {/* Help text */}
      <div className="border-t border-border pt-2 text-[9px] leading-relaxed text-muted">
        When an alarming tab is selected,<br />
        the alarm is cleared and the tab gets a soft TODO.<br />
        Typing characters into the tab will automatically clear a soft TODO.
      </div>
    </div>,
    document.body,
  );
}

// --- Contexts ---

// We own selection/focus, not dockview. These contexts let panel components read our state.
export const ModeContext = createContext<PondMode>('command');
export const SelectedIdContext = createContext<string | null>(null);

// Map of panel ID → stable panel mount element. We resolve the current
// Dockview group wrapper lazily so panel refs survive layout deserialization.
interface PanelElementsState {
  elements: Map<string, HTMLElement>;
  version: number;
  bumpVersion: () => void;
}

const PanelElementsContext = createContext<PanelElementsState>({
  elements: new Map(),
  version: 0,
  bumpVersion: () => {},
});

export const DoorElementsContext = createContext<PanelElementsState>({
  elements: new Map(),
  version: 0,
  bumpVersion: () => {},
});

export interface PondActions {
  onKill: (id: string) => void;
  onDetach: (id: string) => void;
  onAlarmButton: (id: string, displayedStatus: SessionStatus) => AlarmButtonActionResult;
  onToggleTodo: (id: string) => void;
  onSplitH: (id: string | null, source?: 'keyboard' | 'mouse') => void;
  onSplitV: (id: string | null, source?: 'keyboard' | 'mouse') => void;
  onZoom: (id: string) => void;
  onClickPanel: (id: string) => void;
  onStartRename: (id: string) => void;
  onFinishRename: (id: string, value: string) => void;
  onCancelRename: () => void;
}
export const PondActionsContext = createContext<PondActions>({
  onKill: () => {},
  onDetach: () => {},
  onAlarmButton: () => 'noop',
  onToggleTodo: () => {},
  onSplitH: () => {},
  onSplitV: () => {},
  onZoom: () => {},
  onClickPanel: () => {},
  onStartRename: () => {},
  onFinishRename: () => {},
  onCancelRename: () => {},
});

export const RenamingIdContext = createContext<string | null>(null);
export const ZoomedContext = createContext(false);

const ARROW_OPPOSITES: Record<string, string> = {
  ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
  ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp',
};

/** Compare two sorted ID arrays by value. */
function idsMatch(a: string[], b: string[]): boolean {
  if (import.meta.env.DEV) {
    const isSorted = (arr: string[]) => arr.every((v, i) => i === 0 || v >= arr[i - 1]);
    console.assert(isSorted(a) && isSorted(b), 'idsMatch: inputs must be sorted');
  }
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Random A-Z excluding X (prevents accidental double-tap on kill shortcut) */
const KILL_CONFIRM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWYZ'; // no X
function randomKillChar(): string {
  return KILL_CONFIRM_CHARS[Math.floor(Math.random() * KILL_CONFIRM_CHARS.length)];
}

// --- Panel content component ---

function TerminalPanel({ api }: IDockviewPanelProps) {
  const mode = useContext(ModeContext);
  const selectedId = useContext(SelectedIdContext);
  const actions = useContext(PondActionsContext);
  const { elements: panelElements, bumpVersion } = useContext(PanelElementsContext);
  const isFocused = mode === 'passthrough' && selectedId === api.id;
  const elRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elRef.current) return;
    panelElements.set(api.id, elRef.current);
    bumpVersion();
    return () => {
      panelElements.delete(api.id);
      bumpVersion();
    };
  }, [api.id, panelElements, bumpVersion]);

  return (
    <div ref={elRef} className="h-full w-full" onMouseDown={() => actions.onClickPanel(api.id)}>
      <TerminalPane id={api.id} isFocused={isFocused} />
    </div>
  );
}

// --- Custom tab component ---

type HeaderTier = 'full' | 'compact' | 'minimal';

export function TerminalPaneHeader({ api }: IDockviewPanelHeaderProps) {
  const mode = useContext(ModeContext);
  const selectedId = useContext(SelectedIdContext);
  const renamingId = useContext(RenamingIdContext);
  const zoomed = useContext(ZoomedContext);
  const sessionStates = useSyncExternalStore(subscribeToSessionStateChanges, getSessionStateSnapshot);
  const actions = useContext(PondActionsContext);
  const sessionState = sessionStates.get(api.id) ?? DEFAULT_SESSION_UI_STATE;
  const isSelected = selectedId === api.id;
  const showSelectedHeader = mode === 'passthrough' && isSelected;
  const isRenaming = renamingId === api.id;
  const tabRef = useRef<HTMLDivElement>(null);
  const suppressAlarmClickRef = useRef(false);
  const [tier, setTier] = useState<HeaderTier>('full');
  const [dialogPosition, setDialogPosition] = useState<{ x: number; y: number } | null>(null);
  const showTodoPill = sessionState.todo !== false && tier !== 'minimal';
  const alarmButtonAriaLabel = sessionState.status === 'ALARM_RINGING'
    ? 'Alarm ringing'
    : sessionState.status === 'ALARM_DISABLED'
      ? 'Enable alarm'
      : 'Disable alarm';
  const alarmButtonTooltip = sessionState.status === 'ALARM_RINGING'
    ? 'Alarm ringing - Click to dismiss and show options'
    : sessionState.status === 'ALARM_DISABLED'
      ? 'Enable alarm [a] - Right-click for options'
      : 'Disable alarm [a] - Right-click for options';

  const openDialogFromButton = useCallback((button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setDialogPosition({
      x: rect.left + rect.width / 2 - 140,
      y: rect.bottom + 6,
    });
  }, []);

  const triggerAlarmButtonAction = useCallback((displayedStatus: SessionStatus, button: HTMLButtonElement) => {
    const result = actions.onAlarmButton(api.id, displayedStatus);
    if (result === 'dismissed') {
      openDialogFromButton(button);
    }
  }, [actions, api.id, openDialogFromButton]);

  useEffect(() => {
    const el = tabRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w > 280) setTier('full');
      else if (w > 160) setTier('compact');
      else setTier('minimal');
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={tabRef}
      className={tabVariant({ state: showSelectedHeader ? 'selected' : 'inactive' })}
      onMouseDown={() => actions.onClickPanel(api.id)}
    >
      <div className="flex flex-1 min-w-0 items-center gap-2">
        {isRenaming ? (
          <input
            className="bg-transparent outline-none border-none text-inherit font-medium font-mono tracking-normal w-full min-w-0 p-0 m-0"
            defaultValue={api.title}
            autoFocus
            ref={(el) => el?.select()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                actions.onFinishRename(api.id, (e.target as HTMLInputElement).value);
              }
              if (e.key === 'Escape') actions.onCancelRename();
              e.stopPropagation();
            }}
            onBlur={(e) => actions.onFinishRename(api.id, e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className="min-w-0 truncate cursor-text font-medium text-inherit decoration-current/50 underline-offset-2 hover:underline"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); actions.onStartRename(api.id); }}
          >{api.title}</span>
        )}
        <HeaderActionButton
          className={[
            'flex h-5 min-w-5 items-center justify-center rounded transition-colors shrink-0',
            sessionState.status === 'ALARM_RINGING'
              ? 'bg-warning/15 text-warning hover:bg-warning/20 motion-safe:animate-pulse motion-reduce:animate-none'
              : 'text-muted hover:bg-foreground/10 hover:text-foreground',
          ].join(' ')}
          onMouseDownCapture={(e) => {
            if (e.button !== 0) return;
            suppressAlarmClickRef.current = true;
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation?.();
            triggerAlarmButtonAction(sessionState.status, e.currentTarget);
          }}
          onClick={(e) => {
            if (suppressAlarmClickRef.current) {
              suppressAlarmClickRef.current = false;
              return;
            }
            triggerAlarmButtonAction(sessionState.status, e.currentTarget);
          }}
          onContextMenu={(e) => { e.preventDefault(); setDialogPosition({ x: e.clientX, y: e.clientY }); }}
          ariaLabel={alarmButtonAriaLabel}
          tooltip={alarmButtonTooltip}
          dataAlarmButtonFor={api.id}
        >
          <span className="relative flex items-center justify-center">
            {sessionState.status === 'ALARM_DISABLED' ? (
              <BellSlashIcon size={14} />
            ) : (
              <BellIcon size={14} weight="fill" />
            )}
            {(sessionState.status === 'MIGHT_BE_BUSY' || sessionState.status === 'BUSY' || sessionState.status === 'MIGHT_NEED_ATTENTION') && (
              <span className={[
                'absolute -top-0.5 -right-0.5 h-[6px] w-[6px] rounded-full border border-surface-alt',
                sessionState.status === 'MIGHT_BE_BUSY' && 'bg-foreground/40',
                sessionState.status === 'BUSY' && 'bg-accent motion-safe:animate-alarm-dot motion-reduce:animate-none',
                sessionState.status === 'MIGHT_NEED_ATTENTION' && 'bg-warning/60 motion-safe:animate-alarm-dot motion-reduce:animate-none',
              ].filter(Boolean).join(' ')} />
            )}
          </span>
        </HeaderActionButton>
        {showTodoPill && (
          <button
            type="button"
            data-session-todo-for={api.id}
            className={[
              'shrink-0 rounded px-1.5 py-px text-[9px] font-semibold tracking-[0.08em] text-muted transition-colors hover:bg-foreground/10',
              sessionState.todo === 'soft' ? 'border border-dashed border-muted' : 'border border-muted',
            ].join(' ')}
            aria-label="TODO settings"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setDialogPosition({ x: rect.left + rect.width / 2 - 140, y: rect.bottom + 6 });
            }}
          >
            TODO
          </button>
        )}
      </div>
      {!isRenaming && (
        <>
          {/* Split/Zoom controls — hidden at compact and minimal tiers */}
          {tier === 'full' && (
            <div className="ml-1 flex shrink-0 items-center gap-0.5">
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); actions.onSplitH(api.id); }}
                ariaLabel="Split horizontal"
                tooltip='Split horizontal ["]'
              ><SplitHorizontalIcon size={14} /></HeaderActionButton>
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); actions.onSplitV(api.id); }}
                ariaLabel="Split vertical"
                tooltip="Split vertical [%]"
              ><SplitVerticalIcon size={14} /></HeaderActionButton>
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); actions.onZoom(api.id); }}
                ariaLabel={zoomed ? 'Unzoom' : 'Zoom'}
                tooltip={zoomed ? 'Unzoom [z]' : 'Zoom [z]'}
              >{zoomed ? <ArrowsInIcon size={14} /> : <ArrowsOutIcon size={14} />}</HeaderActionButton>
            </div>
          )}
          {/* Detach / Kill controls — always visible */}
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <HeaderActionButton
              className="flex h-5 min-w-5 items-center justify-center rounded text-muted transition-colors hover:bg-foreground/10 hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); actions.onDetach(api.id); }}
              ariaLabel="Detach"
              tooltip="Detach [d]"
            ><ArrowLineDownIcon size={14} /></HeaderActionButton>
            <HeaderActionButton
              className="flex h-5 min-w-5 items-center justify-center rounded text-muted transition-colors hover:bg-error/10 hover:text-error"
              onClick={(e) => { e.stopPropagation(); actions.onKill(api.id); }}
              ariaLabel="Kill"
              tooltip="Kill [x]"
            ><XIcon size={14} /></HeaderActionButton>
          </div>
        </>
      )}
      {dialogPosition && (
        <TodoAlarmDialog
          position={dialogPosition}
          sessionId={api.id}
          onClose={() => setDialogPosition(null)}
        />
      )}
    </div>
  );
}

const components = { terminal: TerminalPanel };
const tabComponents = { terminal: TerminalPaneHeader };

// --- Selection overlay ---

function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const onFocus = () => setFocused(true);
    const onBlur = () => setFocused(false);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return focused;
}

function readSelectionColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
}

function useSelectionColor() {
  const [color, setColor] = useState(readSelectionColor);

  useEffect(() => {
    const mo = new MutationObserver(() => setColor(readSelectionColor()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => mo.disconnect();
  }, []);

  return color;
}

/** Build a closed SVG path for a rounded rectangle.
 *  Starts at the midpoint of the top edge so the seam falls in a straight segment. */
export function roundedRectPath(
  w: number, h: number,
  tl: number, tr: number, br: number, bl: number,
  inset: number,
): string {
  const i = inset;
  const rtl = Math.max(0, tl - i);
  const rtr = Math.max(0, tr - i);
  const rbr = Math.max(0, br - i);
  const rbl = Math.max(0, bl - i);
  const mx = w / 2;
  return (
    `M ${mx},${i} ` +
    `L ${w - i - rtr},${i} ` +
    `Q ${w - i},${i} ${w - i},${i + rtr} ` +
    `L ${w - i},${h - i - rbr} ` +
    `Q ${w - i},${h - i} ${w - i - rbr},${h - i} ` +
    `L ${i + rbl},${h - i} ` +
    `Q ${i},${h - i} ${i},${h - i - rbl} ` +
    `L ${i},${i + rtl} ` +
    `Q ${i},${i} ${i + rtl},${i} ` +
    `Z`
  );
}

/** SVG marching-ants border that adapts its dash pattern to tile evenly. */
export function MarchingAntsRect({ width, height, isDoor, color, paused }: {
  width: number;
  height: number;
  isDoor: boolean;
  color: string;
  paused?: boolean;
}) {
  const svgRef = useRef<SVGPathElement>(null);
  const [dashStyle, setDashStyle] = useState<{ dasharray: string; offset: number } | null>(null);
  const ma = cfg.marchingAnts;

  // Door: rounded top, flat bottom.  Pane: all corners rounded.
  const r = 8; // ~0.5rem
  const rDoor = 6; // ~0.375rem
  const tl = isDoor ? rDoor : r;
  const tr = isDoor ? rDoor : r;
  const br = isDoor ? 0 : r;
  const bl = isDoor ? 0 : r;
  const inset = ma.strokeWidth / 2;

  const d = roundedRectPath(width, height, tl, tr, br, bl, inset);

  useLayoutEffect(() => {
    const path = svgRef.current;
    if (!path) return;
    const len = path.getTotalLength();
    const count = Math.max(1, Math.round(len / ma.segLen));
    const adjusted = len / count;
    const dash = adjusted * ma.dashFraction;
    const gap = adjusted * (1 - ma.dashFraction);
    setDashStyle({ dasharray: `${dash} ${gap}`, offset: adjusted });
  }, [width, height, isDoor]);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}
    >
      <path
        ref={svgRef}
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={ma.strokeWidth}
        strokeDasharray={dashStyle?.dasharray}
        style={dashStyle ? {
          animation: `marching-ants ${ma.cycleDuration}s linear infinite`,
          animationPlayState: (ma.paused || paused) ? 'paused' : 'running',
          ['--march-offset' as string]: `-${dashStyle.offset}px`,
        } : undefined}
      />
    </svg>
  );
}

function SelectionOverlay({ apiRef, selectedId, selectedType, mode }: {
  apiRef: React.RefObject<DockviewApi | null>;
  selectedId: string | null;
  selectedType: 'pane' | 'door';
  mode: PondMode;
}) {
  const { elements: panelElements, version: panelVersion } = useContext(PanelElementsContext);
  const { elements: doorElements, version: doorVersion } = useContext(DoorElementsContext);
  const selectionColor = useSelectionColor();
  const windowFocused = useWindowFocused();
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const isDoor = selectedType === 'door';

  useEffect(() => {
    const api = apiRef.current;
    if (!api || !selectedId) { setRect(null); return; }

    const INFLATE = 3; // half the 6px gap

    const update = () => {
      const targetEl = selectedType === 'door'
        ? doorElements.get(selectedId)
        : resolvePanelElement(panelElements.get(selectedId));
      // Keep stale rect while the element is temporarily missing (e.g. during
      // detach → door transition) so the overlay stays mounted and can animate.
      if (!targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();
      const inflate = selectedType === 'door' ? 2 : INFLATE;
      setRect({
        top: targetRect.top - inflate,
        left: targetRect.left - inflate,
        width: targetRect.width + inflate * 2,
        height: targetRect.height + inflate * 2,
      });
    };

    update();

    const ro = new ResizeObserver(update);
    const panelEl = resolvePanelElement(panelElements.get(selectedId));
    if (panelEl) ro.observe(panelEl);
    const doorEl = doorElements.get(selectedId);
    if (doorEl) ro.observe(doorEl);

    const d = api.onDidLayoutChange(update);

    return () => { ro.disconnect(); d.dispose(); };
  }, [apiRef, selectedId, selectedType, panelVersion, doorVersion]);

  if (!rect || !selectedId) return null;

  const style: React.CSSProperties = {
    position: 'fixed',
    pointerEvents: 'none',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    zIndex: 50,
    transition: 'top 150ms, left 150ms, width 150ms, height 150ms, filter 200ms',
    filter: windowFocused ? undefined : 'saturate(0.3)',
  };

  if (mode === 'passthrough') {
    style.borderRadius = isDoor ? '0.375rem 0.375rem 0 0' : '0.5rem';
    style.border = `1px solid ${selectionColor}`;
    return <div style={style} />;
  }

  return (
    <div style={style}>
      <MarchingAntsRect
        width={rect.width}
        height={rect.height}
        isDoor={isDoor}
        color={selectionColor}
        paused={!windowFocused}
      />
    </div>
  );
}

// --- Kill confirmation overlay ---

function KillConfirmCard({ char, onCancel }: { char: string; onCancel?: () => void }) {
  return (
    <div className="bg-surface-raised border border-error/30 px-6 py-4 rounded-lg text-center shadow-lg">
      <h2 className="text-base font-bold mb-3 text-foreground">Kill Session?</h2>
      <div className="bg-black py-2 px-6 rounded border border-border inline-block mb-2">
        <span className="text-xl font-bold text-error">{char}</span>
      </div>
      <div className="text-xs text-muted uppercase tracking-widest leading-relaxed">
        <div>[{char}] to confirm</div>
        <button type="button" onClick={onCancel} className="uppercase hover:text-foreground transition-colors cursor-pointer">[ESC] to cancel</button>
      </div>
    </div>
  );
}

function KillConfirmOverlay({ confirmKill, panelElements, onCancel }: {
  confirmKill: ConfirmKill;
  panelElements: Map<string, HTMLElement>;
  onCancel: () => void;
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const panelEl = resolvePanelElement(panelElements.get(confirmKill.id));
    if (!panelEl) { setRect(null); return; }

    const update = () => {
      const r = panelEl.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(panelEl);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [confirmKill.id, panelElements]);

  if (rect) {
    return (
      <div
        style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, height: rect.height, zIndex: 100 }}
        className="flex items-center justify-center bg-surface/50 rounded"
      >
        <KillConfirmCard char={confirmKill.char} onCancel={onCancel} />
      </div>
    );
  }

  // Fallback: centered in viewport
  return (
    <div className="fixed inset-0 bg-surface/50 z-[100] flex items-center justify-center">
      <KillConfirmCard char={confirmKill.char} onCancel={onCancel} />
    </div>
  );
}


// --- Main component ---

export function Pond({
  initialPaneIds,
  restoredLayout,
  initialDetached,
  onApiReady,
  onEvent,
  baseboardNotice,
}: {
  initialPaneIds?: string[];
  restoredLayout?: unknown;
  initialDetached?: PersistedDetachedItem[];
  onApiReady?: (api: DockviewApi) => void;
  onEvent?: (event: PondEvent) => void;
  baseboardNotice?: React.ReactNode;
} = {}) {
  const apiRef = useRef<DockviewApi | null>(null);
  const [dockviewApi, setDockviewApi] = useState<DockviewApi | null>(null);
  const dockviewContainerRef = useRef<HTMLDivElement | null>(null);

  // Pane ID generation (instance-scoped, not module-level)
  const paneCounterRef = useRef(0);
  const generatePaneId = useCallback(() => {
    return `pane-${(++paneCounterRef.current).toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
  }, []);

  // Consumed once in handleReady to restore existing sessions
  const initialPaneIdsRef = useRef(initialPaneIds);
  const restoredLayoutRef = useRef(restoredLayout);
  const initialDetachedRef = useRef((initialDetached ?? []).map(toDetachedItem));

  // Mutable maps shared via context — consumers must call bumpVersion() after
  // any mutation so that dependent effects/components re-run.
  const panelElementsRef = useRef(new Map<string, HTMLElement>());
  const panelElements = panelElementsRef.current;
  const [panelElementsVersion, setPanelElementsVersion] = useState(0);
  const doorElementsRef = useRef(new Map<string, HTMLElement>());
  const doorElements = doorElementsRef.current;
  const [doorElementsVersion, setDoorElementsVersion] = useState(0);
  const bumpPanelElementsVersion = useCallback(() => {
    setPanelElementsVersion((v) => v + 1);
  }, []);
  const bumpDoorElementsVersion = useCallback(() => {
    setDoorElementsVersion((v) => v + 1);
  }, []);

  // We own these — dockview is just for spatial layout and DnD
  const [mode, setMode] = useState<PondMode>('command');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'pane' | 'door'>('pane');

  // UI state
  const [confirmKill, setConfirmKill] = useState<ConfirmKill | null>(null);
  const [renamingPaneId, setRenamingPaneId] = useState<string | null>(null);
  const [detached, setDetached] = useState<DetachedItem[]>(() => (initialDetached ?? []).map(toDetachedItem));
  const [zoomed, setZoomed] = useState(false);

  // Refs for mode-switch gesture (Left Cmd → Right Cmd within 500ms)
  const lastCmdSide = useRef<'left' | 'right' | null>(null);
  const lastCmdTime = useRef(0);

  // Navigation breadcrumb: remember last direction + origin for back-navigation
  const navHistory = useRef<{ direction: string; fromId: string } | null>(null);

  // Use refs so the capture-phase listener always sees latest state without re-registering
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const selectedTypeRef = useRef(selectedType);
  selectedTypeRef.current = selectedType;
  const detachedRef = useRef(detached);
  detachedRef.current = detached;
  const confirmKillRef = useRef(confirmKill);
  confirmKillRef.current = confirmKill;
  const renamingRef = useRef(renamingPaneId);
  renamingRef.current = renamingPaneId;
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSavePromiseRef = useRef<Promise<void> | null>(null);

  // --- External event notifications ---
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => { onEventRef.current?.({ type: 'modeChange', mode }); }, [mode]);
  useEffect(() => { onEventRef.current?.({ type: 'zoomChange', zoomed }); }, [zoomed]);
  useEffect(() => { onEventRef.current?.({ type: 'detachChange', count: detached.length }); }, [detached]);
  useEffect(() => { onEventRef.current?.({ type: 'selectionChange', id: selectedId, kind: selectedType }); }, [selectedId, selectedType]);

  // --- Helpers ---

  const pendingSaveNeededRef = useRef(false);

  const doSave = useCallback((): Promise<void> => {
    const api = apiRef.current;
    if (!api) return Promise.resolve();

    const panes = api.panels.map((p) => ({ id: p.id, title: p.title ?? '<unnamed>' }));
    const detachedItems: PersistedDetachedItem[] = detachedRef.current.map((item) => ({
      id: item.id,
      title: item.title,
      neighborId: item.neighborId,
      direction: item.direction,
      remainingPanelIds: item.remainingPanelIds,
      restoreLayout: item.restoreLayout,
      detachedLayoutSignature: item.detachedLayoutSignature,
    }));
    return saveSession(getPlatform(), api.toJSON(), panes, detachedItems);
  }, []);

  const persistSessionNow = useCallback((): Promise<void> => {
    if (sessionSavePromiseRef.current) {
      // A save is already in flight — mark that another save is needed so
      // the latest state is captured after the current one completes.
      pendingSaveNeededRef.current = true;
      return sessionSavePromiseRef.current;
    }

    const runSave = (): Promise<void> => {
      pendingSaveNeededRef.current = false;
      const savePromise = doSave()
        .finally(() => {
          if (sessionSavePromiseRef.current === savePromise) {
            if (pendingSaveNeededRef.current) {
              // Another save was requested while we were saving — run it now
              sessionSavePromiseRef.current = null;
              sessionSavePromiseRef.current = runSave();
            } else {
              sessionSavePromiseRef.current = null;
            }
          }
        });
      sessionSavePromiseRef.current = savePromise;
      return savePromise;
    };

    return runSave();
  }, [doSave]);

  const flushSessionSave = useCallback(() => {
    if (sessionSaveTimerRef.current) {
      clearTimeout(sessionSaveTimerRef.current);
      sessionSaveTimerRef.current = null;
    }
    return persistSessionNow();
  }, [persistSessionNow]);

  const scheduleSessionSave = useCallback(() => {
    if (sessionSaveTimerRef.current) return;
    sessionSaveTimerRef.current = setTimeout(() => {
      sessionSaveTimerRef.current = null;
      void persistSessionNow().catch(() => undefined);
    }, 500);
  }, [persistSessionNow]);

  /** Select a panel: update our state + tell dockview so tabs highlight correctly */
  const selectPanel = useCallback((id: string) => {
    selectedIdRef.current = id;
    selectedTypeRef.current = 'pane';
    setSelectedId(id);
    setSelectedType('pane');
    const panel = apiRef.current?.getPanel(id);
    if (panel) panel.api.setActive();
  }, []);

  /** Select a door in the baseboard */
  const selectDoor = useCallback((id: string) => {
    selectedIdRef.current = id;
    selectedTypeRef.current = 'door';
    setSelectedId(id);
    setSelectedType('door');
  }, []);

  /** Enter terminal mode for the given panel */
  const enterTerminalMode = useCallback((id: string) => {
    modeRef.current = 'passthrough';
    selectedIdRef.current = id;
    selectedTypeRef.current = 'pane';
    setSelectedId(id);
    setSelectedType('pane');
    setMode('passthrough');
    markSessionAttention(id);
    // Defer focus so it happens after mousedown/click event finishes,
    // preventing dockview from stealing focus back from xterm
    requestAnimationFrame(() => focusTerminal(id, true));
    const panel = apiRef.current?.getPanel(id);
    if (panel) panel.api.setActive();
  }, []);
  const enterTerminalModeRef = useRef(enterTerminalMode);
  enterTerminalModeRef.current = enterTerminalMode;

  /** Detach a panel: capture neighbor context, remove from dockview, add to detached state */
  const detachPanel = useCallback((id: string) => {
    const api = apiRef.current;
    if (!api) return;
    const panel = api.getPanel(id);
    if (!panel) return;
    const title = panel.title ?? id;
    const restoreLayout = cloneLayout(api.toJSON());

    // Capture the nearest adjacent pane and our actual relative position
    // so immediate restore can reconstruct the original split precisely.
    const { neighborId, direction } = findRestoreNeighbor(id, api, panelElements);

    const remainingPanelIds = api.panels
      .filter(p => p.id !== id)
      .map(p => p.id)
      .sort();

    api.removePanel(panel);
    clearSessionAttention(id);
    const detachedLayoutSignature = getLayoutStructureSignature(api.toJSON());
    const nextDetached = [...detachedRef.current, {
      id,
      title,
      neighborId,
      direction,
      remainingPanelIds,
      restoreLayout,
      detachedLayoutSignature,
    }];
    detachedRef.current = nextDetached;
    setDetached(nextDetached);

    // Keep the detached terminal selected as a door so the user can track where it went.
    modeRef.current = 'command';
    setMode('command');
    selectDoor(id);
  }, [selectDoor]);

  /** Exit terminal mode */
  const exitTerminalMode = useCallback(() => {
    modeRef.current = 'command';
    setMode('command');
    const id = selectedIdRef.current;
    if (id) focusTerminal(id, false);
  }, []);

  useEffect(() => {
    const handleBlur = () => clearSessionAttention();
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  // --- Dockview ready ---

  const handleReady = useCallback((e: DockviewReadyEvent) => {
    apiRef.current = e.api;
    setDockviewApi(e.api);

    // Restore existing PTY sessions if available
    const restored = initialPaneIdsRef.current;
    const layout = restoredLayoutRef.current;
    const restoredDetached = initialDetachedRef.current;
    initialPaneIdsRef.current = undefined; // consume once
    restoredLayoutRef.current = undefined;
    initialDetachedRef.current = [];
    detachedRef.current = restoredDetached;
    setDetached(restoredDetached);

    if (layout && restored && restored.length > 0) {
      // Cold-start restore: apply saved dockview layout (includes panel arrangement)
      try {
        e.api.fromJSON(layout as SerializedDockview);
        setSelectedId(restored[0]);
      } catch {
        // Layout restore failed — fall back to creating panels manually
        for (const id of restored) {
          e.api.addPanel({ id, component: 'terminal', tabComponent: 'terminal', title: '<unnamed>' });
        }
        setSelectedId(restored[0]);
      }
    } else {
      // Reconnect or fresh start: create panels from IDs
      const paneIds = restored && restored.length > 0
        ? restored
        : [generatePaneId()];
      for (const id of paneIds) {
        e.api.addPanel({ id, component: 'terminal', tabComponent: 'terminal', title: '<unnamed>' });
      }
      setSelectedId(paneIds[0]);
    }

    // Prevent tab stacking on tab-on-tab drops (center drops are handled by onWillDrop as swaps)
    e.api.onWillShowOverlay((event) => {
      if (event.kind === 'tab') {
        event.preventDefault();
      }
    });

    // Intercept center drops at the group level: swap terminal content instead of merging.
    // Must subscribe on each group's model.onWillDrop directly because the component-level
    // onWillDrop re-fires AFTER the group model has already checked defaultPrevented.
    const subscribeGroupDrop = (group: { model: any; activePanel: any }) => {
      return group.model.onWillDrop((event: any) => {
        if (event.position === 'center') {
          const data = event.getData();
          // panelId is null for group drags (one panel per group in tiling mode)
          // — look up the panel from the group instead
          let draggedId = data?.panelId;
          if (!draggedId && data?.groupId) {
            const draggedGroup = e.api.getGroup(data.groupId);
            draggedId = draggedGroup?.activePanel?.id ?? null;
          }
          const targetPanel = group.activePanel;
          if (draggedId && targetPanel && draggedId !== targetPanel.id) {
            swapTerminals(draggedId, targetPanel.id);
            const draggedPanel = e.api.getPanel(draggedId);
            if (draggedPanel) {
              const draggedTitle = draggedPanel.title ?? draggedId;
              const targetTitle = targetPanel.title ?? targetPanel.id;
              draggedPanel.api.setTitle(targetTitle);
              targetPanel.api.setTitle(draggedTitle);
            }
            selectPanel(targetPanel.id);
          }
          event.preventDefault();
        }
      });
    };
    // Subscribe on existing groups and any newly added groups
    for (const group of e.api.groups) {
      subscribeGroupDrop(group);
    }
    e.api.onDidAddGroup((group) => {
      subscribeGroupDrop(group);
    });

    // Sync our selection when dockview activates a panel (e.g. after DnD rearrangement)
    e.api.onDidActivePanelChange((panel) => {
      if (panel) {
        if (modeRef.current === 'passthrough' && selectedIdRef.current !== panel.id) {
          enterTerminalModeRef.current(panel.id);
          return;
        }
        setSelectedId(panel.id);
      }
    });

    // Auto-create a pane when all panes are killed/detached.
    // Note: this fires synchronously from api.removePanel(). During detachPanel,
    // detachedRef is updated AFTER removePanel returns, so detachedRef.current.length
    // is still 0 here — which is correct: we want a new pane when the last visible
    // pane is detached (the door isn't a pane).
    e.api.onDidRemovePanel(() => {
      if (e.api.totalPanels === 0 && detachedRef.current.length === 0) {
        const id = generatePaneId();
        e.api.addPanel({ id, component: 'terminal', tabComponent: 'terminal', title: '<unnamed>' });
        selectPanel(id);
      }
    });

    onApiReady?.(e.api);
  }, [generatePaneId, selectPanel, onApiReady]);

  // --- Session persistence ---
  // Debounced save on layout change + 30s interval, plus immediate flushes on PTY exit
  // and extension shutdown requests.

  useEffect(() => {
    if (!dockviewApi) return;

    const platform = getPlatform();
    const handlePtyExit = (detail: { id: string }) => {
      // Only flush if the exiting PTY belongs to a panel in this instance
      const api = apiRef.current;
      if (!api) return;
      const ownsPane = api.panels.some((p) => p.id === detail.id);
      if (!ownsPane) return;
      void flushSessionSave().catch(() => undefined);
    };
    const handleSessionFlushRequest = (detail: { requestId: string }) => {
      void flushSessionSave()
        .catch(() => undefined)
        .finally(() => {
          platform.notifySessionFlushComplete(detail.requestId);
        });
    };
    const handlePageHide = () => {
      void flushSessionSave().catch(() => undefined);
    };

    const layoutDisposable = dockviewApi.onDidLayoutChange(scheduleSessionSave);
    const addDisposable = dockviewApi.onDidAddPanel(scheduleSessionSave);
    const removeDisposable = dockviewApi.onDidRemovePanel(scheduleSessionSave);
    const interval = setInterval(scheduleSessionSave, 30_000);
    platform.onPtyExit(handlePtyExit);
    platform.onRequestSessionFlush(handleSessionFlushRequest);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current);
        sessionSaveTimerRef.current = null;
      }
      window.removeEventListener('pagehide', handlePageHide);
      platform.offRequestSessionFlush(handleSessionFlushRequest);
      platform.offPtyExit(handlePtyExit);
      layoutDisposable.dispose();
      addDisposable.dispose();
      removeDisposable.dispose();
      clearInterval(interval);
      void persistSessionNow().catch(() => undefined);
    };
  }, [dockviewApi, flushSessionSave, persistSessionNow, scheduleSessionSave]);

  // --- Keyboard handling ---
  // Uses capture phase so we intercept before xterm.js (which has DOM focus in terminal mode)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const currentMode = modeRef.current;

      // --- Mode switch gesture: LCmd → RCmd within 500ms (works in both modes) ---
      if (e.key === 'Meta') {
        const now = Date.now();
        const side = e.location === 1 ? 'left' : 'right';
        if (
          lastCmdSide.current === 'left' &&
          side === 'right' &&
          now - lastCmdTime.current < 500
        ) {
          if (currentMode === 'passthrough') {
            exitTerminalMode();
          }
          lastCmdSide.current = null;
          return;
        }
        lastCmdSide.current = side;
        lastCmdTime.current = now;
        return;
      }

      // In terminal mode, only the Meta gesture above matters — everything else goes to xterm
      if (currentMode === 'passthrough') return;

      // --- Workspace mode shortcuts ---
      const api = apiRef.current;
      if (!api) return;
      const sid = selectedIdRef.current;

      // Don't intercept keys while renaming — let the input handle them
      if (renamingRef.current) return;

      // Handle kill confirmation input (must be first)
      const ck = confirmKillRef.current;
      if (ck) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          setConfirmKill(null);
          return;
        }
        if (e.key.toLowerCase() === ck.char.toLowerCase()) {
          const panel = api.getPanel(ck.id);
          if (panel) {
            destroyTerminal(ck.id);
            api.removePanel(panel);
          }
          // Select next panel
          if (api.panels.length > 0) {
            selectPanel(api.panels[0].id);
          } else {
            setSelectedId(null);
          }
        }
        setConfirmKill(null);
        return;
      }

      // Enter: if door is selected, reattach + passthrough; if pane, enter passthrough
      if (e.key === 'Enter' && sid) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedTypeRef.current === 'door') {
          const item = detachedRef.current.find(d => d.id === sid);
          if (item) handleReattachRef.current(item);
        } else {
          enterTerminalMode(sid);
        }
        return;
      }

      // Horizontal split (or create first pane)
      if (e.key === '"') {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onSplitH(sid, 'keyboard');
        return;
      }

      // Vertical split (or create first pane)
      if (e.key === '%') {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onSplitV(sid, 'keyboard');
        return;
      }

      // Cmd+Arrow: swap terminal content with neighbor (layout unchanged)
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!sid) return;

        const dir = e.key;

        // If pressing opposite of last Cmd+direction, go back to the same target
        const hist = navHistory.current;
        let targetId: string | null = null;
        if (hist && ARROW_OPPOSITES[dir] === hist.direction && api.getPanel(hist.fromId)) {
          targetId = hist.fromId;
        } else {
          targetId = findPanelInDirection(sid, dir as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', api, panelElements);
        }
        if (!targetId) return;

        // Swap terminal content between the two panels, layout stays the same
        swapTerminals(sid, targetId);

        // Also swap dockview titles
        const activePanel = api.getPanel(sid);
        const targetPanel = api.getPanel(targetId);
        if (activePanel && targetPanel) {
          const activeTitle = activePanel.title ?? sid;
          const targetTitle = targetPanel.title ?? targetId;
          activePanel.api.setTitle(targetTitle);
          targetPanel.api.setTitle(activeTitle);
        }

        // Selection follows the terminal that moved
        navHistory.current = { direction: dir, fromId: sid };
        selectPanel(targetId);
        return;
      }

      // Kill with confirmation
      if (e.key === 'x' && sid) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedTypeRef.current === 'door') {
          const item = detachedRef.current.find(d => d.id === sid);
          if (item) handleReattachRef.current(item, { enterPassthrough: false, confirmKill: true });
          return;
        }
        const char = randomKillChar();
        setConfirmKill({ id: sid, char });
        return;
      }

      // Rename pane
      if (e.key === ',' && sid) {
        e.preventDefault();
        e.stopPropagation();
        setRenamingPaneId(sid);
        return;
      }

      // Detach (pane) / Reattach (door) — "d" toggles detach state
      if (e.key === 'd' && sid) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedTypeRef.current === 'door') {
          const item = detachedRef.current.find(d => d.id === sid);
          if (item) handleReattachRef.current(item, { enterPassthrough: false });
        } else {
          detachPanel(sid);
        }
        return;
      }

      if (e.key === 't' && sid && selectedTypeRef.current === 'pane') {
        if (dialogKeyboardActive) return;
        e.preventDefault();
        e.stopPropagation();
        toggleSessionTodo(sid);
        return;
      }

      if (e.key === 'a' && sid && selectedTypeRef.current === 'pane') {
        if (dialogKeyboardActive) return;
        e.preventDefault();
        e.stopPropagation();
        dismissOrToggleAlarm(sid, getSessionState(sid).status);
        return;
      }

      // Fullscreen toggle
      if (e.key === 'z' && sid) {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onZoom(sid);
        return;
      }

      // Arrow key navigation — spatial, with back-navigation + door support
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!sid) return;

        const dir = e.key;
        const currentType = selectedTypeRef.current;
        const currentDetached = detachedRef.current;

        // Navigation from a door
        if (currentType === 'door') {
          if (dir === 'ArrowUp') {
            // Move up from door to nearest pane
            if (api.panels.length > 0) {
              selectPanel(api.panels[api.panels.length - 1].id);
            }
            return;
          }
          // Left/Right between doors
          const doorIdx = currentDetached.findIndex(d => d.id === sid);
          if (dir === 'ArrowLeft' && doorIdx > 0) {
            selectDoor(currentDetached[doorIdx - 1].id);
          } else if (dir === 'ArrowRight' && doorIdx < currentDetached.length - 1) {
            selectDoor(currentDetached[doorIdx + 1].id);
          }
          return;
        }

        // Navigation from a pane
        // If pressing the opposite of the last direction, go back to origin
        const hist = navHistory.current;
        if (hist && ARROW_OPPOSITES[dir] === hist.direction && api.getPanel(hist.fromId)) {
          navHistory.current = { direction: dir, fromId: sid };
          selectPanel(hist.fromId);
          return;
        }

        const targetId = findPanelInDirection(sid, dir as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', api, panelElements);
        if (targetId) {
          navHistory.current = { direction: dir, fromId: sid };
          selectPanel(targetId);
        } else if (dir === 'ArrowDown' && currentDetached.length > 0) {
          // No pane below — move to first door in baseboard
          selectDoor(currentDetached[0].id);
        }
        return;
      }
    };

    // capture: true so we intercept before xterm.js gets the event
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectPanel, selectDoor, enterTerminalMode, exitTerminalMode, detachPanel]);

  // --- Reattach ---

  const handleReattach = useCallback((
    item: DetachedItem,
    options?: { enterPassthrough?: boolean; confirmKill?: boolean },
  ) => {
    const api = apiRef.current;
    if (!api) return;
    const enterPassthrough = options?.enterPassthrough ?? true;
    const confirmKillAfterRestore = options?.confirmKill ?? false;

    const currentLayoutSignature = getLayoutStructureSignature(api.toJSON());
    // Exact restore is only safe when the layout structure matches AND the
    // current panels are the same ones that existed when we detached. If new
    // panels were auto-spawned (e.g. last pane detached → auto-create), the
    // restoreLayout would destroy them.
    const currentPanelIds = api.panels.map(p => p.id).sort();
    const restorePanelIds = item.restoreLayout
      ? Object.keys(item.restoreLayout.panels).filter(id => id !== item.id).sort()
      : [];
    const canRestoreExactLayout =
      !!item.restoreLayout &&
      currentLayoutSignature === item.detachedLayoutSignature &&
      idsMatch(currentPanelIds, restorePanelIds);

    if (canRestoreExactLayout) {
      const currentTitles = new Map(
        api.panels.map(panel => [panel.id, panel.title ?? panel.id] as const),
      );

      // reuseExistingPanels: keep existing panel component instances mounted
      // rather than destroying and recreating them during deserialization.
      api.fromJSON(cloneLayout(item.restoreLayout!), { reuseExistingPanels: true });

      for (const [panelId, title] of currentTitles) {
        if (panelId === item.id) continue;
        api.getPanel(panelId)?.api.setTitle(title);
      }
    } else {
      const currentIds = api.panels.map(p => p.id).sort();
      const layoutUnchanged =
        item.neighborId &&
        api.getPanel(item.neighborId) &&
        idsMatch(currentIds, item.remainingPanelIds);

      if (layoutUnchanged) {
        // Restore to original position next to the same neighbor
        api.addPanel({
          id: item.id,
          component: 'terminal',
          tabComponent: 'terminal',
          title: item.title,
          position: { referencePanel: item.neighborId!, direction: item.direction },
        });
      } else {
        // Layout changed — split an existing panel based on its aspect ratio
        const sid = selectedIdRef.current;
        const refPanel = (sid && api.getPanel(sid)) ?? api.panels[0] ?? null;
        let direction: 'right' | 'below' = 'right';
        if (refPanel) {
          direction = (refPanel.api.width - refPanel.api.height > 0) ? 'right' : 'below';
        }
        api.addPanel({
          id: item.id,
          component: 'terminal',
          tabComponent: 'terminal',
          title: item.title,
          position: refPanel ? { referencePanel: refPanel.id, direction } : undefined,
        });
      }
    }

    const nextDetached = detachedRef.current.filter(p => p.id !== item.id);
    detachedRef.current = nextDetached;
    setDetached(nextDetached);
    selectPanel(item.id);
    if (enterPassthrough) {
      enterTerminalMode(item.id);
    } else {
      modeRef.current = 'command';
      setMode('command');
      requestAnimationFrame(() => {
        // Guard against panel removal between scheduling and execution
        if (!apiRef.current?.getPanel(item.id)) return;
        focusTerminal(item.id, false);
        if (confirmKillAfterRestore) {
          setConfirmKill({ id: item.id, char: randomKillChar() });
        }
      });
    }
  }, [selectPanel, enterTerminalMode]);
  const handleReattachRef = useRef(handleReattach);
  handleReattachRef.current = handleReattach;

  // Listen for external "new terminal" requests (e.g. from the standalone AppBar)
  useEffect(() => {
    const handler = (e: Event) => {
      const api = apiRef.current;
      if (!api) return;
      const detail = (e as CustomEvent).detail;
      const newId = generatePaneId();

      // Store shell options so getOrCreateTerminal picks them up on mount
      if (detail?.shell) {
        setPendingShellOpts(newId, { shell: detail.shell, args: detail.args });
      }

      const active = api.activePanel;
      let direction: 'right' | 'below' = 'right';
      if (active) {
        direction = (active.api.width - active.api.height > 0) ? 'right' : 'below';
      }
      api.addPanel({
        id: newId,
        component: 'terminal',
        tabComponent: 'terminal',
        title: '<unnamed>',
        position: active ? { referencePanel: active.id, direction } : undefined,
      });
      selectPanel(newId);
    };
    window.addEventListener('mouseterm:new-terminal', handler);
    return () => window.removeEventListener('mouseterm:new-terminal', handler);
  }, [generatePaneId, selectPanel]);

  const addSplitPanel = useCallback((
    id: string | null,
    direction: 'right' | 'below',
    splitDirection: 'horizontal' | 'vertical',
    source: 'keyboard' | 'mouse' = 'mouse',
  ) => {
    const api = apiRef.current;
    if (!api) return;
    const newId = generatePaneId();
    const ref = id && api.getPanel(id) ? id : null;
    api.addPanel({
      id: newId,
      component: 'terminal',
      tabComponent: 'terminal',
      title: '<unnamed>',
      position: ref ? { referencePanel: ref, direction } : undefined,
    });
    selectPanel(newId);
    onEventRef.current?.({ type: 'split', direction: splitDirection, source });
  }, [selectPanel]);

  // --- Pond actions (for tab buttons) ---

  const pondActions: PondActions = useMemo(() => ({
    onKill: (id: string) => {
      const char = randomKillChar();
      setConfirmKill({ id, char });
    },
    onAlarmButton: (id: string, displayedStatus: SessionStatus) => {
      return dismissOrToggleAlarm(id, displayedStatus);
    },
    onToggleTodo: (id: string) => {
      toggleSessionTodo(id);
    },
    onDetach: (id: string) => {
      detachPanel(id);
    },
    onSplitH: (id: string | null, source: 'keyboard' | 'mouse' = 'mouse') => {
      addSplitPanel(id, 'right', 'horizontal', source);
    },
    onSplitV: (id: string | null, source: 'keyboard' | 'mouse' = 'mouse') => {
      addSplitPanel(id, 'below', 'vertical', source);
    },
    onZoom: (id: string) => {
      const api = apiRef.current;
      if (!api) return;
      if (api.hasMaximizedGroup()) {
        api.exitMaximizedGroup();
        setZoomed(false);
      } else {
        const panel = api.getPanel(id);
        if (panel) { api.maximizeGroup(panel); setZoomed(true); }
      }
    },
    onClickPanel: (id: string) => {
      enterTerminalMode(id);
    },
    onStartRename: (id: string) => {
      setRenamingPaneId(id);
    },
    onFinishRename: (id: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        apiRef.current?.getPanel(id)?.api.setTitle(trimmed);
      }
      setRenamingPaneId(null);
    },
    onCancelRename: () => {
      setRenamingPaneId(null);
    },
  }), [addSplitPanel, detachPanel, enterTerminalMode]);
  const pondActionsRef = useRef(pondActions);
  pondActionsRef.current = pondActions;

  // --- Render ---

  return (
    <ModeContext.Provider value={mode}>
      <SelectedIdContext.Provider value={selectedId}>
        <PondActionsContext.Provider value={pondActions}>
          <PanelElementsContext.Provider value={{ elements: panelElements, version: panelElementsVersion, bumpVersion: bumpPanelElementsVersion }}>
          <DoorElementsContext.Provider value={{ elements: doorElements, version: doorElementsVersion, bumpVersion: bumpDoorElementsVersion }}>
          <RenamingIdContext.Provider value={renamingPaneId}>
          <ZoomedContext.Provider value={zoomed}>
          <div className="flex-1 min-h-0 flex flex-col bg-surface text-foreground font-sans overflow-hidden">
            {/* Dockview */}
            <div className="flex-1 min-h-0 relative p-1.5">
              <div ref={dockviewContainerRef} className="absolute inset-1.5">
                <DockviewReact
                  components={components}
                  tabComponents={tabComponents}
                  onReady={handleReady}
                  theme={mousetermTheme}
                  singleTabMode="fullwidth"
                />
                <SelectionOverlay apiRef={apiRef} selectedId={selectedId} selectedType={selectedType} mode={mode} />
              </div>
            </div>

            {/* Baseboard — always visible */}
            <Baseboard items={detached} activeId={selectedType === 'door' ? selectedId : null} onReattach={handleReattach} notice={baseboardNotice} />

            {/* Kill confirmation overlay — centered over the pane being killed */}
            {confirmKill && (
              <KillConfirmOverlay
                confirmKill={confirmKill}
                panelElements={panelElements}
                onCancel={() => setConfirmKill(null)}
              />
            )}

          </div>
          </ZoomedContext.Provider>
          </RenamingIdContext.Provider>
          </DoorElementsContext.Provider>
          </PanelElementsContext.Provider>
        </PondActionsContext.Provider>
      </SelectedIdContext.Provider>
    </ModeContext.Provider>
  );
}
