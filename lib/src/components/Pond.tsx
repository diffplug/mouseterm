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
import { PopupButtonRow, popupButton } from './design';
import { HeaderActionButton } from './HeaderActionButton';
import { TodoAlertDialog } from './TodoAlertDialog';
import { KILL_CONFIRM_MS, KILL_SHAKE_MS, KillConfirmOverlay, orchestrateKill, randomKillChar, type ConfirmKill } from './KillConfirm';
import { BellIcon, BellSlashIcon, SplitHorizontalIcon, SplitVerticalIcon, ArrowsOutIcon, ArrowsInIcon, ArrowLineDownIcon, XIcon, CursorClickIcon, SelectionSlashIcon } from '@phosphor-icons/react';
import {
  DEFAULT_MOUSE_SELECTION_STATE,
  extendSelectionToToken,
  flashCopy,
  getMouseSelectionSnapshot,
  getMouseSelectionState,
  setOverride as setMouseOverride,
  setSelection as setMouseSelection,
  subscribeToMouseSelection,
} from '../lib/mouse-selection';
import { copyRaw, copyRewrapped, doPaste, pasteFilePaths } from '../lib/clipboard';
import { IS_MAC } from '../lib/platform';
import {
  type AlertButtonActionResult,
  clearSessionAttention,
  clearSessionTodo,
  DEFAULT_ACTIVITY_STATE,
  dismissOrToggleAlert,
  focusSession,
  getActivity,
  getActivitySnapshot,
  markSessionAttention,
  subscribeToActivity,
  toggleSessionTodo,
  swapTerminals,
  setPendingShellOpts,
  getDefaultShellOpts,
  type SessionStatus,
} from '../lib/terminal-registry';
import { resolvePanelElement, findPanelInDirection, findReattachNeighbor } from '../lib/spatial-nav';
import { cloneLayout, getLayoutStructureSignature } from '../lib/layout-snapshot';
import { getPlatform } from '../lib/platform';
import { saveSession } from '../lib/session-save';
import type { PersistedDoor } from '../lib/session-types';
import { cfg } from '../cfg';
import { bellIconClass } from './bell-icon-class';
import { useTodoPillContent } from './TodoPillBody';

// --- Theme ---

const mousetermTheme: DockviewTheme = {
  ...themeAbyss,
  name: 'mouseterm',
  gap: 6,
  dndOverlayMounting: 'absolute',
  dndPanelOverlay: 'group',
};

// --- Types ---

export type DooredItem = Omit<PersistedDoor, 'layoutAtMinimize'> & {
  layoutAtMinimize: SerializedDockview | null;
};

export type PondMode = 'command' | 'passthrough';

export type PondSelectionKind = 'pane' | 'door';

export type PondEvent =
  | { type: 'modeChange'; mode: PondMode }
  | { type: 'zoomChange'; zoomed: boolean }
  | { type: 'minimizeChange'; count: number }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; source: 'keyboard' | 'mouse' }
  | { type: 'selectionChange'; id: string | null; kind: PondSelectionKind };

// --- Variants ---

const tabVariant = tv({
  base: 'flex h-full w-full cursor-grab items-center gap-1.5 rounded-t pl-2 pr-[5px] text-sm leading-none font-mono tracking-normal select-none active:cursor-grabbing',
  variants: {
    state: {
      active: 'bg-header-active-bg text-header-active-fg',
      inactive: 'bg-header-inactive-bg text-header-inactive-fg',
    },
  },
});

// --- Alert context menu (right-click on bell) ---

/**
 * Portal banner shown while a temporary mouse-capture override is active.
 * Positioned below a given anchor element (the No-Mouse icon) and kept in
 * sync with scroll/resize. Spec §2.1 / §2.4: mouse-only, no keyboard.
 */
function MouseOverrideBanner({
  anchor,
  onMakePermanent,
  onCancel,
}: {
  anchor: HTMLElement;
  onMakePermanent: () => void;
  onCancel: () => void;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [flashed, setFlashed] = useState<'sticky' | 'cancel' | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const r = anchor.getBoundingClientRect();
      setPos({ x: r.left, y: r.bottom + 4 });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  useEffect(() => {
    if (!flashed) return;
    const id = window.setTimeout(() => {
      if (flashed === 'sticky') onMakePermanent();
      else onCancel();
    }, 260);
    return () => window.clearTimeout(id);
  }, [flashed, onMakePermanent, onCancel]);

  if (!pos) return null;

  return createPortal(
    <PopupButtonRow
      className="z-[9999]"
      style={clampOverlayPosition({ left: pos.x, top: pos.y, width: 340, height: 32 })}
      onMouseDown={(e) => e.stopPropagation()}
      role="status"
    >
      <span className="px-1.5 py-0.5">Temporary mouse override until mouse-up.</span>
      <button
        type="button"
        className={popupButton({ tone: 'muted', flashed: flashed === 'sticky' })}
        onClick={() => !flashed && setFlashed('sticky')}
      >Make sticky</button>
      <button
        type="button"
        className={popupButton({ tone: 'muted', flashed: flashed === 'cancel' })}
        onClick={() => !flashed && setFlashed('cancel')}
      >Cancel</button>
    </PopupButtonRow>,
    document.body,
  );
}

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

function findAlertButtonForSession(id: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-alert-button-for]'))
    .find((button) => button.dataset.alertButtonFor === id) ?? null;
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
  onMinimize: (id: string) => void;
  onAlertButton: (id: string, displayedStatus: SessionStatus) => AlertButtonActionResult;
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
  onMinimize: () => {},
  onAlertButton: () => 'noop',
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
export const WindowFocusedContext = createContext(true);

// Lets TodoAlertDialog notify Pond's command-mode keyboard handler to stand
// down while the dialog is open (both listen on window capture, Pond first).
export const DialogKeyboardContext = createContext<(active: boolean) => void>(() => {});

// Transient map of pane ids that were just created → their spawn direction.
// TerminalPanel consumes (and removes) its id on first mount to trigger a directional spawn animation.
//   'left'     — born from horizontal split (new pane appeared to the right of the source)
//   'top'      — born from vertical split (new pane appeared below the source)
//   'top-left' — auto-spawned after last-pane kill (diagonal counterpoint to the killed pane's crush to bottom-right)
export type SpawnDirection = 'left' | 'top' | 'top-left';
export const FreshlySpawnedContext = createContext<Map<string, SpawnDirection>>(new Map());

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

// --- Panel content component ---

function TerminalPanel({ api }: IDockviewPanelProps) {
  const mode = useContext(ModeContext);
  const selectedId = useContext(SelectedIdContext);
  const actions = useContext(PondActionsContext);
  const { elements: panelElements, bumpVersion } = useContext(PanelElementsContext);
  const freshlySpawned = useContext(FreshlySpawnedContext);
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

  // Freshly spawned: animate the whole dockview group (header + body) as one unit
  // via a directional clip-path reveal. We target api.group.element instead of elRef
  // so the tab header animates too. clip-path (not transform) is deliberate —
  // transforms affect getBoundingClientRect, which would make the selection overlay
  // lag the pane until the animation ends.
  useLayoutEffect(() => {
    const direction = freshlySpawned.get(api.id);
    if (!direction) return;
    freshlySpawned.delete(api.id);
    const groupEl = api.group?.element;
    if (!groupEl) return;
    const className = `pane-spawning-from-${direction}`;
    const animationName = `pane-spawn-from-${direction}`;
    groupEl.classList.add(className);
    const onEnd = (ev: AnimationEvent) => {
      if (ev.animationName !== animationName) return;
      groupEl.classList.remove(className);
      groupEl.removeEventListener('animationend', onEnd);
    };
    groupEl.addEventListener('animationend', onEnd);
    return () => {
      groupEl.removeEventListener('animationend', onEnd);
      groupEl.classList.remove(className);
    };
  }, [api, freshlySpawned]);

  return (
    <div ref={elRef} className="h-full w-full overflow-hidden rounded-b-lg bg-terminal-bg" onMouseDown={() => actions.onClickPanel(api.id)}>
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
  const windowFocused = useContext(WindowFocusedContext);
  const setDialogKeyboardActive = useContext(DialogKeyboardContext);
  const activityStates = useSyncExternalStore(subscribeToActivity, getActivitySnapshot);
  const mouseStates = useSyncExternalStore(subscribeToMouseSelection, getMouseSelectionSnapshot);
  const actions = useContext(PondActionsContext);
  const activity = activityStates.get(api.id) ?? DEFAULT_ACTIVITY_STATE;
  const mouseState = mouseStates.get(api.id) ?? DEFAULT_MOUSE_SELECTION_STATE;
  const showMouseIcon = mouseState.mouseReporting !== 'none';
  const inOverride = mouseState.override !== 'off';
  const mouseIconTooltip = inOverride
    ? "You're overriding the TUI's mouse capture. Click to restore."
    : 'TUI is intercepting mouse commands. Click to override.';
  const mouseIconAriaLabel = inOverride ? 'Restore mouse capture' : 'Override mouse capture';
  const isSelected = selectedId === api.id;
  const isActiveHeader = mode === 'passthrough' && isSelected && windowFocused;
  const isRenaming = renamingId === api.id;
  const tabRef = useRef<HTMLDivElement>(null);
  const [mouseIconAnchor, setMouseIconAnchor] = useState<HTMLDivElement | null>(null);
  const suppressAlertClickRef = useRef(false);
  const [tier, setTier] = useState<HeaderTier>('full');
  const [dialogTriggerRect, setDialogTriggerRect] = useState<DOMRect | null>(null);
  const todoPill = useTodoPillContent(activity.todo);
  const showTodoPill = todoPill.visible && tier !== 'minimal';
  const alertButtonAriaLabel = activity.status === 'ALERT_RINGING'
    ? 'Alert ringing'
    : activity.status === 'ALERT_DISABLED'
      ? 'Enable alert'
      : 'Disable alert';
  const alertButtonTooltip = activity.status === 'ALERT_RINGING'
    ? 'Alert ringing'
    : activity.status === 'ALERT_DISABLED'
      ? 'Enable [a]lert'
      : 'Disable [a]lert';
  const alertButtonTooltipDetail = activity.status === 'ALERT_RINGING'
    ? 'Click to dismiss and show options'
    : 'Right-click for options';

  const closeDialog = useCallback(() => setDialogTriggerRect(null), []);

  const triggerAlertButtonAction = useCallback((displayedStatus: SessionStatus, button: HTMLButtonElement) => {
    const result = actions.onAlertButton(api.id, displayedStatus);
    if (result === 'dismissed') {
      setDialogTriggerRect(button.getBoundingClientRect());
    }
  }, [actions, api.id]);

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
      className={tabVariant({ state: isActiveHeader ? 'active' : 'inactive' })}
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
            'flex h-5 min-w-5 items-center justify-center rounded transition-colors shrink-0 hover:bg-current/10',
            activity.status === 'ALERT_RINGING' ? 'text-warning' : '',
          ].join(' ')}
          onMouseDownCapture={(e) => {
            if (e.button !== 0) return;
            suppressAlertClickRef.current = true;
            e.preventDefault();
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation?.();
            triggerAlertButtonAction(activity.status, e.currentTarget);
          }}
          onClick={(e) => {
            if (suppressAlertClickRef.current) {
              suppressAlertClickRef.current = false;
              return;
            }
            triggerAlertButtonAction(activity.status, e.currentTarget);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setDialogTriggerRect(e.currentTarget.getBoundingClientRect());
          }}
          ariaLabel={alertButtonAriaLabel}
          tooltip={alertButtonTooltip}
          tooltipDetail={alertButtonTooltipDetail}
          tooltipAlign="left"
          dataAlertButtonFor={api.id}
        >
          <span className="flex items-center justify-center">
            {activity.status === 'ALERT_DISABLED' ? (
              <BellSlashIcon size={14} />
            ) : (
              <BellIcon size={14} weight="fill" className={bellIconClass(activity.status)} />
            )}
          </span>
        </HeaderActionButton>
        {showTodoPill && (
          <button
            type="button"
            data-session-todo-for={api.id}
            data-flourishing={todoPill.flourishing ? 'true' : 'false'}
            className="todo-pill-shell shrink-0 rounded border border-current px-1.5 py-px text-xs font-semibold tracking-[0.08em] transition-colors hover:bg-current/10"
            aria-label="Dismiss TODO"
            aria-hidden={todoPill.flourishing ? true : undefined}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              clearSessionTodo(api.id);
            }}
          >
            {todoPill.body}
          </button>
        )}
      </div>
      {!isRenaming && (
        <>
          {showMouseIcon && (
            <div ref={setMouseIconAnchor} className="ml-1 shrink-0">
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded transition-colors shrink-0 hover:bg-current/10"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setMouseOverride(api.id, inOverride ? 'off' : 'temporary');
                }}
                ariaLabel={mouseIconAriaLabel}
                tooltip={mouseIconTooltip}
              >
                <span className="relative flex items-center justify-center">
                  {inOverride ? (
                    <SelectionSlashIcon size={14} />
                  ) : (
                    <CursorClickIcon size={14} />
                  )}
                </span>
              </HeaderActionButton>
            </div>
          )}
          {mouseIconAnchor && mouseState.override === 'temporary' && (
            <MouseOverrideBanner
              anchor={mouseIconAnchor}
              onMakePermanent={() => setMouseOverride(api.id, 'permanent')}
              onCancel={() => setMouseOverride(api.id, 'off')}
            />
          )}
          {/* Split/Zoom controls — hidden at compact and minimal tiers */}
          {tier === 'full' && (
            <div className="ml-1 flex shrink-0 items-center gap-0.5">
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded transition-colors hover:bg-current/10"
                onClick={(e) => { e.stopPropagation(); actions.onSplitH(api.id); }}
                ariaLabel="Split left/right"
                tooltip='Split left/right [|] or [%]'
              ><SplitHorizontalIcon size={14} /></HeaderActionButton>
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded transition-colors hover:bg-current/10"
                onClick={(e) => { e.stopPropagation(); actions.onSplitV(api.id); }}
                ariaLabel="Split top/bottom"
                tooltip='Split top/bottom [-] or ["]'
              ><SplitVerticalIcon size={14} /></HeaderActionButton>
              <HeaderActionButton
                className="flex h-5 min-w-5 items-center justify-center rounded transition-colors hover:bg-current/10"
                onClick={(e) => { e.stopPropagation(); actions.onZoom(api.id); }}
                ariaLabel={zoomed ? 'Unzoom' : 'Zoom'}
                tooltip={zoomed ? 'Unzoom [z]' : 'Zoom [z]'}
              >{zoomed ? <ArrowsInIcon size={14} /> : <ArrowsOutIcon size={14} />}</HeaderActionButton>
            </div>
          )}
          {/* Minimize / Kill controls — always visible */}
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <HeaderActionButton
              className="flex h-5 min-w-5 items-center justify-center rounded transition-colors hover:bg-current/10"
              onClick={(e) => { e.stopPropagation(); actions.onMinimize(api.id); }}
              ariaLabel="Minimize"
              tooltip="Minimize [m] or [d]"
            ><ArrowLineDownIcon size={14} /></HeaderActionButton>
            <HeaderActionButton
              className="flex h-5 min-w-5 items-center justify-center rounded transition-colors hover:bg-error/10 hover:text-error"
              onClick={(e) => { e.stopPropagation(); actions.onKill(api.id); }}
              ariaLabel="Kill"
              tooltip="Kill [k] or [x]"
            ><XIcon size={14} /></HeaderActionButton>
          </div>
        </>
      )}
      {dialogTriggerRect && (
        <TodoAlertDialog
          triggerRect={dialogTriggerRect}
          sessionId={api.id}
          onClose={closeDialog}
          onKeyboardActiveChange={setDialogKeyboardActive}
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
  // Read from body so we pick up theme overrides declared on `body.vscode-light`
  // (reading from documentElement would always return the :root/dark value).
  return getComputedStyle(document.body).getPropertyValue('--color-header-active-bg').trim();
}

function useSelectionColor() {
  const [color, setColor] = useState(readSelectionColor);

  useEffect(() => {
    const mo = new MutationObserver(() => setColor(readSelectionColor()));
    mo.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
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

function SelectionOverlay({ apiRef, selectedId, selectedType, mode, overlayElRef }: {
  apiRef: React.RefObject<DockviewApi | null>;
  selectedId: string | null;
  selectedType: PondSelectionKind;
  mode: PondMode;
  overlayElRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const { elements: panelElements, version: panelVersion } = useContext(PanelElementsContext);
  const { elements: doorElements, version: doorVersion } = useContext(DoorElementsContext);
  const selectionColor = useSelectionColor();
  const windowFocused = useContext(WindowFocusedContext);
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
      // minimize → door transition) so the overlay stays mounted and can animate.
      if (!targetEl) return;

      const targetRect = targetEl.getBoundingClientRect();
      const inflate = selectedType === 'door' ? 0 : INFLATE;
      const dockviewRect = selectedType === 'pane'
        ? targetEl.closest('.dv-dockview')?.getBoundingClientRect()
        : null;
      const bottom = Math.min(targetRect.bottom + inflate, dockviewRect?.bottom ?? Infinity);
      setRect({
        top: targetRect.top - inflate,
        left: targetRect.left - inflate,
        width: targetRect.width + inflate * 2,
        height: bottom - (targetRect.top - inflate),
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
    return <div ref={overlayElRef} style={style} />;
  }

  return (
    <div ref={overlayElRef} style={style}>
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



// --- Main component ---

export function Pond({
  initialPaneIds,
  restoredLayout,
  initialDoors,
  onApiReady,
  onEvent,
  baseboardNotice,
}: {
  initialPaneIds?: string[];
  restoredLayout?: unknown;
  initialDoors?: PersistedDoor[];
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

  // Ids of panes that were just spawned, keyed by id with the direction the spawn
  // should reveal from. TerminalPanel consumes its id on first mount to play the
  // matching directional entrance animation.
  const freshlySpawnedRef = useRef(new Map<string, SpawnDirection>());

  // True only across the api.removePanel() call inside orchestrateKill. Lets
  // onDidRemovePanel know the kill path already paid the animation delay (via
  // the in-place fade) so the auto-spawn shouldn't re-delay another 440ms.
  const killInProgressRef = useRef(false);

  // Ref to the SelectionOverlay's root element. orchestrateKill uses it to
  // animate the focus ring in sync with the killed pane's shrink (last-pane case).
  const overlayElRef = useRef<HTMLDivElement | null>(null);

  const dialogKeyboardActiveRef = useRef(false);
  const setDialogKeyboardActive = useCallback((active: boolean) => {
    dialogKeyboardActiveRef.current = active;
  }, []);

  // Consumed once in handleReady to restore existing sessions
  const initialPaneIdsRef = useRef(initialPaneIds);
  const restoredLayoutRef = useRef(restoredLayout);
  const initialDoorsRef = useRef((initialDoors ?? []) as DooredItem[]);

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
  const [selectedType, setSelectedType] = useState<PondSelectionKind>('pane');

  const windowFocused = useWindowFocused();

  // UI state
  const [confirmKill, setConfirmKill] = useState<ConfirmKill | null>(null);
  useEffect(() => { if (!confirmKill) { clearTimeout(shakeTimerRef.current!); } }, [confirmKill]);

  // Drive the kill-dialog exit animation before unmount. Rejection paths
  // (Esc, cancel button, wrong letter) share the shake gesture; the correct
  // letter runs the confirm flash and fires orchestrateKill concurrently so
  // the pane fade begins while the letter flash is still playing.
  const rejectKill = useCallback(() => {
    const ck = confirmKillRef.current;
    if (!ck || ck.shaking || ck.confirming) return;
    setConfirmKill({ ...ck, shaking: true });
    shakeTimerRef.current = setTimeout(() => setConfirmKill(null), KILL_SHAKE_MS);
  }, []);
  const acceptKill = useCallback((onExit: () => void) => {
    const ck = confirmKillRef.current;
    if (!ck || ck.confirming) return;
    setConfirmKill({ ...ck, confirming: true });
    onExit();
    setTimeout(() => setConfirmKill(null), KILL_CONFIRM_MS);
  }, []);
  const [renamingPaneId, setRenamingPaneId] = useState<string | null>(null);
  const [doors, setDoors] = useState<DooredItem[]>(() => (initialDoors ?? []) as DooredItem[]);
  const [zoomed, setZoomed] = useState(false);

  // Refs for mode-switch gesture (Left Cmd → Right Cmd, or Left Shift → Right Shift, within 500ms)
  const lastCmdSide = useRef<'left' | 'right' | null>(null);
  const lastCmdTime = useRef(0);
  const lastShiftSide = useRef<'left' | 'right' | null>(null);
  const lastShiftTime = useRef(0);

  // Navigation breadcrumb: remember last direction + origin for back-navigation
  const navHistory = useRef<{ direction: string; fromId: string } | null>(null);

  // Use refs so the capture-phase listener always sees latest state without re-registering
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const selectedTypeRef = useRef(selectedType);
  selectedTypeRef.current = selectedType;
  const doorsRef = useRef(doors);
  doorsRef.current = doors;
  const confirmKillRef = useRef(confirmKill);
  confirmKillRef.current = confirmKill;
  const renamingRef = useRef(renamingPaneId);
  renamingRef.current = renamingPaneId;
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionSavePromiseRef = useRef<Promise<void> | null>(null);

  // --- External event notifications ---
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => { onEventRef.current?.({ type: 'modeChange', mode }); }, [mode]);
  useEffect(() => { onEventRef.current?.({ type: 'zoomChange', zoomed }); }, [zoomed]);
  useEffect(() => { onEventRef.current?.({ type: 'minimizeChange', count: doors.length }); }, [doors]);
  useEffect(() => { onEventRef.current?.({ type: 'selectionChange', id: selectedId, kind: selectedType }); }, [selectedId, selectedType]);

  // --- Helpers ---

  const pendingSaveNeededRef = useRef(false);

  const doSave = useCallback((): Promise<void> => {
    const api = apiRef.current;
    if (!api) return Promise.resolve();

    const panes = api.panels.map((p) => ({ id: p.id, title: p.title ?? '<unnamed>' }));
    return saveSession(getPlatform(), api.toJSON(), panes, doorsRef.current);
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
    requestAnimationFrame(() => focusSession(id, true));
    const panel = apiRef.current?.getPanel(id);
    if (panel) panel.api.setActive();
  }, []);
  const enterTerminalModeRef = useRef(enterTerminalMode);
  enterTerminalModeRef.current = enterTerminalMode;

  /** Minimize a pane: capture neighbor context, remove from dockview, add to doors state */
  const minimizePane = useCallback((id: string) => {
    const api = apiRef.current;
    if (!api) return;
    const panel = api.getPanel(id);
    if (!panel) return;
    const title = panel.title ?? id;
    const layoutAtMinimize = cloneLayout(api.toJSON());

    // Capture the nearest adjacent pane and our actual relative position
    // so immediate restore can reconstruct the original split precisely.
    const { neighborId, direction } = findReattachNeighbor(id, api, panelElements);

    const remainingPaneIds = api.panels
      .filter(p => p.id !== id)
      .map(p => p.id)
      .sort();

    api.removePanel(panel);
    clearSessionAttention(id);
    const layoutAtMinimizeSignature = getLayoutStructureSignature(api.toJSON());
    const nextDoors = [...doorsRef.current, {
      id,
      title,
      neighborId,
      direction,
      remainingPaneIds,
      layoutAtMinimize,
      layoutAtMinimizeSignature,
    }];
    doorsRef.current = nextDoors;
    setDoors(nextDoors);

    // Keep the minimized session selected as a door so the user can track where it went.
    modeRef.current = 'command';
    setMode('command');
    selectDoor(id);
  }, [selectDoor]);

  /** Exit terminal mode */
  const exitTerminalMode = useCallback(() => {
    modeRef.current = 'command';
    setMode('command');
    const id = selectedIdRef.current;
    if (id) focusSession(id, false);
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
    const restoredDoors = initialDoorsRef.current;
    initialPaneIdsRef.current = undefined; // consume once
    restoredLayoutRef.current = undefined;
    initialDoorsRef.current = [];
    doorsRef.current = restoredDoors;
    setDoors(restoredDoors);

    // Apply the currently-selected shell to a freshly-added pane. Panes
    // that are resuming over an existing PTY already have a running shell,
    // so their pendingShellOpts are never consumed — only first-time spawns
    // use this.
    const addTerminalPanel = (id: string) => {
      const defaults = getDefaultShellOpts();
      if (defaults?.shell) {
        setPendingShellOpts(id, { shell: defaults.shell, args: defaults.args });
      }
      const referencePanel = e.api.panels[e.api.panels.length - 1] ?? null;
      const direction = referencePanel && referencePanel.api.width - referencePanel.api.height > 0 ? 'right' : 'below';
      e.api.addPanel({
        id,
        component: 'terminal',
        tabComponent: 'terminal',
        title: '<unnamed>',
        position: referencePanel ? { referencePanel: referencePanel.id, direction } : undefined,
      });
    };

    if (layout && restored && restored.length > 0) {
      // Cold-start restore: apply saved dockview layout (includes panel arrangement)
      try {
        e.api.fromJSON(layout as SerializedDockview);
        setSelectedId(restored[0]);
      } catch {
        // Layout restore failed — fall back to creating panels manually
        for (const id of restored) {
          addTerminalPanel(id);
        }
        setSelectedId(restored[0]);
      }
    } else {
      // Resume/restore or fresh start: create panels from IDs
      const paneIds = restored && restored.length > 0
        ? restored
        : [generatePaneId()];
      for (const id of paneIds) {
        addTerminalPanel(id);
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
        // Dockview auto-activates a panel on addPanel. Don't let that steal
        // selection away from a currently-selected door (happens when the last
        // pane is minimized: selectDoor runs, then the delayed auto-spawn's
        // addPanel would otherwise flip selectedId to the new pane's id while
        // selectedType is still 'door', desyncing the door's highlight).
        if (selectedTypeRef.current === 'door') return;
        if (modeRef.current === 'passthrough' && selectedIdRef.current !== panel.id) {
          enterTerminalModeRef.current(panel.id);
          return;
        }
        setSelectedId(panel.id);
      }
    });

    // Always keep one pane visible: when the last visible pane is removed (killed
    // or minimized), spawn a fresh one — regardless of whether doors exist.
    //
    // Delay the spawn by the kill/minimize animation duration so the two animations
    // don't overlap — the outgoing pane crushes/fades first, then the new pane
    // reveals from the top-left. If anything restores a pane in the meantime
    // (e.g. door reattach), the delayed spawn becomes a no-op.
    e.api.onDidRemovePanel(() => {
      if (e.api.totalPanels !== 0) return;
      const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      // Kill path already waited during the in-place fade; no extra delay.
      const delay = (reduceMotion || killInProgressRef.current) ? 0 : 440;
      const spawn = () => {
        if (e.api.totalPanels > 0) return;
        const id = generatePaneId();
        freshlySpawnedRef.current.set(id, 'top-left');
        e.api.addPanel({ id, component: 'terminal', tabComponent: 'terminal', title: '<unnamed>' });
        // Only steal focus if nothing is selected (i.e., the kill path, which
        // clears selection). On minimize the new door is selected and we
        // must not override that — the door retains focus per the minimize UX.
        if (selectedIdRef.current === null) {
          selectPanel(id);
        }
      };
      // Always defer via setTimeout — even when delay is 0 — so api.addPanel is
      // not called re-entrantly from inside the onDidRemovePanel handler (dockview
      // silently drops the spawn in that case).
      setTimeout(spawn, delay);
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

    const unsubFilesDropped = platform.onFilesDropped?.((paths) => {
      if (paths.length === 0) return;
      const sid = selectedTypeRef.current === 'pane' ? selectedIdRef.current : null;
      if (!sid) return;
      const api = apiRef.current;
      if (!api || !api.panels.some((p) => p.id === sid)) return;
      pasteFilePaths(sid, paths);
    });

    return () => {
      if (sessionSaveTimerRef.current) {
        clearTimeout(sessionSaveTimerRef.current);
        sessionSaveTimerRef.current = null;
      }
      window.removeEventListener('pagehide', handlePageHide);
      unsubFilesDropped?.();
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

      // --- Mode switch gesture: LCmd → RCmd (or LShift → RShift) within 500ms
      // (works in both modes) ---
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
      if (e.key === 'Shift') {
        const now = Date.now();
        const side = e.location === 1 ? 'left' : 'right';
        if (
          lastShiftSide.current === 'left' &&
          side === 'right' &&
          now - lastShiftTime.current < 500
        ) {
          if (currentMode === 'passthrough') {
            exitTerminalMode();
          }
          lastShiftSide.current = null;
          return;
        }
        lastShiftSide.current = side;
        lastShiftTime.current = now;
        return;
      }

      // Mid-drag keystrokes and copy/paste shortcuts. Spec §5.3, §3.6, §4.2, §8.2.
      {
        const sid = selectedIdRef.current;
        if (sid) {
          const mouseState = getMouseSelectionState(sid);
          const sel = mouseState.selection;

          // During a terminal-owned drag, `e` extends to the detected token
          // and Esc cancels. Per spec §3.6, ALL keystrokes are consumed
          // during a drag so they don't reach the inside program. Alt is
          // allowed to propagate because terminal-registry's onAltChange
          // listener uses it for block-selection shape toggling (§3.2).
          if (sel?.dragging) {
            if (e.key === 'e' && mouseState.hintToken) {
              e.preventDefault();
              e.stopImmediatePropagation();
              extendSelectionToToken(sid, mouseState.hintToken);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopImmediatePropagation();
              setMouseSelection(sid, null);
              return;
            }
            // Let Alt propagate for block-selection toggling; consume
            // everything else.
            if (e.key !== 'Alt') {
              e.preventDefault();
              e.stopImmediatePropagation();
            }
            return;
          }

          // Copy is narrow: only when the terminal has a finalized selection.
          // Paste is broad: always intercepted on the platform's paste chord.
          //   macOS: Cmd+V, Cmd+Shift+V. Ctrl+V passes through to the program.
          //   Other: Ctrl+V, Ctrl+Shift+V. Both always intercepted.
          const keyLower = e.key.toLowerCase();
          const mod = IS_MAC ? e.metaKey : e.ctrlKey;
          if (sel && !sel.dragging && mod && keyLower === 'c') {
            e.preventDefault();
            e.stopImmediatePropagation();
            const rewrapped = e.shiftKey;
            void (rewrapped ? copyRewrapped(sid) : copyRaw(sid)).then(() => {
              flashCopy(sid, rewrapped ? 'rewrapped' : 'raw');
            });
            return;
          }
          if (mod && keyLower === 'v') {
            e.preventDefault();
            e.stopImmediatePropagation();
            void doPaste(sid);
            return;
          }
        }
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
        // Already exiting — swallow further input so a second key doesn't
        // stack dismissals or fire orchestrateKill twice.
        if (ck.confirming || ck.shaking) return;
        if (e.key.toLowerCase() === ck.char.toLowerCase()) {
          acceptKill(() => orchestrateKill(api, ck.id, selectPanel, setSelectedId, killInProgressRef, overlayElRef));
          return;
        }
        // Escape and wrong letter both reject via the shake gesture.
        rejectKill();
        return;
      }

      // Enter: if door is selected, reattach + passthrough; if pane, enter passthrough
      if (e.key === 'Enter' && sid) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedTypeRef.current === 'door') {
          const item = doorsRef.current.find(d => d.id === sid);
          if (item) handleReattachRef.current(item);
        } else {
          enterTerminalMode(sid);
        }
        return;
      }

      // Horizontal split (or create first pane)
      if (e.key === '|' || e.key === '%') {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onSplitH(sid, 'keyboard');
        return;
      }

      // Vertical split (or create first pane)
      if (e.key === '-' || e.key === '"') {
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
      if ((e.key === 'k' || e.key === 'x') && sid) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedTypeRef.current === 'door') {
          const item = doorsRef.current.find(d => d.id === sid);
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

      // Minimize (pane) / Reattach (door) — "m" or "d" toggles View state
      if ((e.key === 'm' || e.key === 'd') && sid) {
        e.preventDefault();
        e.stopPropagation();
        if (selectedTypeRef.current === 'door') {
          const item = doorsRef.current.find(d => d.id === sid);
          if (item) handleReattachRef.current(item, { enterPassthrough: false });
        } else {
          minimizePane(sid);
        }
        return;
      }

      if (e.key === 't' && sid && selectedTypeRef.current === 'pane') {
        if (dialogKeyboardActiveRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        toggleSessionTodo(sid);
        return;
      }

      if (e.key === 'a' && sid && selectedTypeRef.current === 'pane') {
        if (dialogKeyboardActiveRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        // Go through the real button so that a dismiss opens the dialog. The
        // fallback handles the edge case where the header isn't mounted yet.
        const alertButton = findAlertButtonForSession(sid);
        if (alertButton) {
          alertButton.click();
        } else {
          dismissOrToggleAlert(sid, getActivity(sid).status);
        }
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
        const currentDoors = doorsRef.current;

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
          const doorIdx = currentDoors.findIndex(d => d.id === sid);
          if (dir === 'ArrowLeft' && doorIdx > 0) {
            selectDoor(currentDoors[doorIdx - 1].id);
          } else if (dir === 'ArrowRight' && doorIdx < currentDoors.length - 1) {
            selectDoor(currentDoors[doorIdx + 1].id);
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
        } else if (dir === 'ArrowDown' && currentDoors.length > 0) {
          // No pane below — move to first door in baseboard
          selectDoor(currentDoors[0].id);
        }
        return;
      }
    };

    // capture: true so we intercept before xterm.js gets the event
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectPanel, selectDoor, enterTerminalMode, exitTerminalMode, minimizePane]);

  // --- Reattach ---

  const handleReattach = useCallback((
    item: DooredItem,
    options?: { enterPassthrough?: boolean; confirmKill?: boolean },
  ) => {
    const api = apiRef.current;
    if (!api) return;
    const enterPassthrough = options?.enterPassthrough ?? true;
    const confirmKillAfterRestore = options?.confirmKill ?? false;

    const currentLayoutSignature = getLayoutStructureSignature(api.toJSON());
    // Exact reattach is only safe when the layout structure matches AND the
    // current panes are the same ones that existed when we minimized. If new
    // panes were auto-spawned (e.g. last pane minimized → auto-create), the
    // layoutAtMinimize would destroy them.
    const currentPaneIds = api.panels.map(p => p.id).sort();
    const reattachPaneIds = item.layoutAtMinimize
      ? Object.keys(item.layoutAtMinimize.panels).filter(id => id !== item.id).sort()
      : [];
    const canReattachExactLayout =
      !!item.layoutAtMinimize &&
      currentLayoutSignature === item.layoutAtMinimizeSignature &&
      idsMatch(currentPaneIds, reattachPaneIds);

    if (canReattachExactLayout) {
      const currentTitles = new Map(
        api.panels.map(panel => [panel.id, panel.title ?? panel.id] as const),
      );

      // reuseExistingPanels: keep existing panel component instances mounted
      // rather than destroying and recreating them during deserialization.
      api.fromJSON(cloneLayout(item.layoutAtMinimize!), { reuseExistingPanels: true });

      for (const [panelId, title] of currentTitles) {
        if (panelId === item.id) continue;
        api.getPanel(panelId)?.api.setTitle(title);
      }
    } else {
      const currentIds = api.panels.map(p => p.id).sort();
      const layoutUnchanged =
        item.neighborId &&
        api.getPanel(item.neighborId) &&
        idsMatch(currentIds, item.remainingPaneIds);

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

    const nextDoors = doorsRef.current.filter(p => p.id !== item.id);
    doorsRef.current = nextDoors;
    setDoors(nextDoors);
    selectPanel(item.id);
    if (enterPassthrough) {
      enterTerminalMode(item.id);
    } else {
      modeRef.current = 'command';
      setMode('command');
      requestAnimationFrame(() => {
        // Guard against panel removal between scheduling and execution
        if (!apiRef.current?.getPanel(item.id)) return;
        focusSession(item.id, false);
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
    // Carry the currently-selected shell into the split, same as [+].
    const defaults = getDefaultShellOpts();
    if (defaults?.shell) {
      setPendingShellOpts(newId, { shell: defaults.shell, args: defaults.args });
    }
    // Horizontal split places the new pane to the right → reveal from its left edge.
    // Vertical split places it below → reveal from its top edge.
    freshlySpawnedRef.current.set(newId, direction === 'right' ? 'left' : 'top');
    api.addPanel({
      id: newId,
      component: 'terminal',
      tabComponent: 'terminal',
      title: '<unnamed>',
      position: ref ? { referencePanel: ref, direction } : undefined,
    });
    selectPanel(newId);
    onEventRef.current?.({ type: 'split', direction: splitDirection, source });
  }, [selectPanel, generatePaneId]);

  // --- Pond actions (for tab buttons) ---

  const pondActions: PondActions = useMemo(() => ({
    onKill: (id: string) => {
      exitTerminalMode();
      const char = randomKillChar();
      setConfirmKill({ id, char });
    },
    onAlertButton: (id: string, displayedStatus: SessionStatus) => {
      return dismissOrToggleAlert(id, displayedStatus);
    },
    onToggleTodo: (id: string) => {
      toggleSessionTodo(id);
    },
    onMinimize: (id: string) => {
      minimizePane(id);
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
      setConfirmKill(null);
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
  }), [addSplitPanel, minimizePane, enterTerminalMode, exitTerminalMode]);
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
          <WindowFocusedContext.Provider value={windowFocused}>
          <FreshlySpawnedContext.Provider value={freshlySpawnedRef.current}>
          <DialogKeyboardContext.Provider value={setDialogKeyboardActive}>
          <div className="flex-1 min-h-0 flex flex-col bg-surface text-foreground font-sans overflow-hidden">
            {/* Dockview — no bottom padding so the last row of panes meets
                the baseboard flush. */}
            <div className="flex-1 min-h-0 relative px-1.5 pt-1.5">
              <div ref={dockviewContainerRef} className="absolute inset-x-1.5 top-1.5 bottom-0">
                <DockviewReact
                  components={components}
                  tabComponents={tabComponents}
                  onReady={handleReady}
                  theme={mousetermTheme}
                  singleTabMode="fullwidth"
                />
                <SelectionOverlay apiRef={apiRef} selectedId={selectedId} selectedType={selectedType} mode={mode} overlayElRef={overlayElRef} />
              </div>
            </div>

            {/* Baseboard — always visible */}
            <Baseboard items={doors} onReattach={handleReattach} notice={baseboardNotice} />

            {/* Kill confirmation overlay — centered over the pane being killed */}
            {confirmKill && (
              <KillConfirmOverlay
                confirmKill={confirmKill}
                panelElements={panelElements}
                onCancel={() => rejectKill()}
              />
            )}

          </div>
          </DialogKeyboardContext.Provider>
          </FreshlySpawnedContext.Provider>
          </WindowFocusedContext.Provider>
          </ZoomedContext.Provider>
          </RenamingIdContext.Provider>
          </DoorElementsContext.Provider>
          </PanelElementsContext.Provider>
        </PondActionsContext.Provider>
      </SelectedIdContext.Provider>
    </ModeContext.Provider>
  );
}
