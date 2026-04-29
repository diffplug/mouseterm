import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { DockviewApi } from 'dockview-react';
import type { ConfirmKill } from '../KillConfirm';
import type { DooredItem, WallMode, WallSelectionKind } from './wall-types';
import type { WallActions } from './wall-context';
import { handleDualTap } from './keyboard/handle-dual-tap';
import { handleMouseSelectionKeys } from './keyboard/handle-mouse-selection-keys';
import { handleKillConfirm } from './keyboard/handle-kill-confirm';
import { handlePaneShortcuts } from './keyboard/handle-pane-shortcuts';
import { handlePaneNavigation } from './keyboard/handle-pane-navigation';
import type { NavHistoryRef, WallKeyboardCtx } from './keyboard/types';

export function useWallKeyboard(ctx: {
  apiRef: RefObject<DockviewApi | null>;
  modeRef: RefObject<WallMode>;
  selectedIdRef: RefObject<string | null>;
  selectedTypeRef: RefObject<WallSelectionKind>;
  doorsRef: RefObject<DooredItem[]>;
  confirmKillRef: RefObject<ConfirmKill | null>;
  renamingRef: RefObject<string | null>;
  dialogKeyboardActiveRef: RefObject<boolean>;
  paneElements: Map<string, HTMLElement>;
  killInProgressRef: RefObject<boolean>;
  overlayElRef: RefObject<HTMLDivElement | null>;
  wallActionsRef: RefObject<WallActions>;
  handleReattachRef: RefObject<(item: DooredItem, options?: { enterPassthrough?: boolean; confirmKill?: boolean }) => void>;
  selectPane: (id: string) => void;
  selectDoor: (id: string) => void;
  enterTerminalMode: (id: string) => void;
  exitTerminalMode: () => void;
  minimizePane: (id: string) => void;
  acceptKill: (onExit: () => void) => void;
  rejectKill: () => void;
  setConfirmKill: Dispatch<SetStateAction<ConfirmKill | null>>;
  setRenamingPaneId: Dispatch<SetStateAction<string | null>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
}): void {
  const lastCmdSide = useRef<'left' | 'right' | null>(null);
  const lastCmdTime = useRef(0);
  const lastShiftSide = useRef<'left' | 'right' | null>(null);
  const lastShiftTime = useRef(0);
  const navHistory = useRef<NavHistoryRef['current']>(null);

  // Refs are stable across renders, so the handler can close over `ctx` once
  // and never re-subscribe. Stuffing every prop into deps would re-bind the
  // listener on every Wall render and break dual-tap timing.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    const dualTapState = { lastCmdSide, lastCmdTime, lastShiftSide, lastShiftTime };

    const handler = (e: KeyboardEvent) => {
      const c = ctxRef.current as WallKeyboardCtx;

      if (handleDualTap(e, c, dualTapState)) return;
      if (handleMouseSelectionKeys(e, c)) return;
      if (c.modeRef.current === 'passthrough') return;
      if (!c.apiRef.current) return;
      if (c.renamingRef.current) return;
      if (handleKillConfirm(e, c)) return;
      if (handlePaneShortcuts(e, c, navHistory)) return;
      handlePaneNavigation(e, c, navHistory);
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);
}
