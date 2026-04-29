import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { DockviewApi } from 'dockview-react';
import type { ConfirmKill } from '../KillConfirm';
import type { DooredItem, PondMode, PondSelectionKind } from './pond-types';
import type { PondActions } from './pond-context';
import { handleDualTap } from './keyboard/handle-dual-tap';
import { handleMouseSelectionKeys } from './keyboard/handle-mouse-selection-keys';
import { handleKillConfirm } from './keyboard/handle-kill-confirm';
import { handlePaneShortcuts } from './keyboard/handle-pane-shortcuts';
import { handlePaneNavigation } from './keyboard/handle-pane-navigation';
import type { NavHistoryRef, PondKeyboardCtx } from './keyboard/types';

export function usePondKeyboard(ctx: {
  apiRef: RefObject<DockviewApi | null>;
  modeRef: RefObject<PondMode>;
  selectedIdRef: RefObject<string | null>;
  selectedTypeRef: RefObject<PondSelectionKind>;
  doorsRef: RefObject<DooredItem[]>;
  confirmKillRef: RefObject<ConfirmKill | null>;
  renamingRef: RefObject<string | null>;
  dialogKeyboardActiveRef: RefObject<boolean>;
  panelElements: Map<string, HTMLElement>;
  killInProgressRef: RefObject<boolean>;
  overlayElRef: RefObject<HTMLDivElement | null>;
  pondActionsRef: RefObject<PondActions>;
  handleReattachRef: RefObject<(item: DooredItem, options?: { enterPassthrough?: boolean; confirmKill?: boolean }) => void>;
  selectPanel: (id: string) => void;
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
  // listener on every Pond render and break dual-tap timing.
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    const dualTapState = { lastCmdSide, lastCmdTime, lastShiftSide, lastShiftTime };

    const handler = (e: KeyboardEvent) => {
      const c = ctxRef.current as PondKeyboardCtx;

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
