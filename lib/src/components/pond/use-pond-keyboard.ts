import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { DockviewApi } from 'dockview-react';
import { copyRaw, copyRewrapped, doPaste } from '../../lib/clipboard';
import { IS_MAC } from '../../lib/platform';
import {
  extendSelectionToToken,
  flashCopy,
  getMouseSelectionState,
  setSelection as setMouseSelection,
} from '../../lib/mouse-selection';
import {
  dismissOrToggleAlert,
  getActivity,
  toggleSessionTodo,
  swapTerminals,
} from '../../lib/terminal-registry';
import { findPanelInDirection } from '../../lib/spatial-nav';
import { orchestrateKill, randomKillChar, type ConfirmKill } from '../KillConfirm';
import type { DooredItem, PondMode, PondSelectionKind } from './pond-types';
import type { PondActions } from './pond-context';

const ARROW_OPPOSITES: Record<string, string> = {
  ArrowLeft: 'ArrowRight', ArrowRight: 'ArrowLeft',
  ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp',
};

function findAlertButtonForSession(id: string): HTMLButtonElement | null {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-alert-button-for]'))
    .find((button) => button.dataset.alertButtonFor === id) ?? null;
}

export function usePondKeyboard({
  apiRef,
  modeRef,
  selectedIdRef,
  selectedTypeRef,
  doorsRef,
  confirmKillRef,
  renamingRef,
  dialogKeyboardActiveRef,
  panelElements,
  killInProgressRef,
  overlayElRef,
  pondActionsRef,
  handleReattachRef,
  selectPanel,
  selectDoor,
  enterTerminalMode,
  exitTerminalMode,
  minimizePane,
  acceptKill,
  rejectKill,
  setConfirmKill,
  setRenamingPaneId,
  setSelectedId,
}: {
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
  const navHistory = useRef<{ direction: string; fromId: string } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const currentMode = modeRef.current;

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

      const selectedSessionId = selectedIdRef.current;
      if (selectedSessionId) {
        const mouseState = getMouseSelectionState(selectedSessionId);
        const sel = mouseState.selection;

        if (sel?.dragging) {
          if (e.key === 'e' && mouseState.hintToken) {
            e.preventDefault();
            e.stopImmediatePropagation();
            extendSelectionToToken(selectedSessionId, mouseState.hintToken);
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            setMouseSelection(selectedSessionId, null);
            return;
          }
          if (e.key !== 'Alt') {
            e.preventDefault();
            e.stopImmediatePropagation();
          }
          return;
        }

        const keyLower = e.key.toLowerCase();
        const mod = IS_MAC ? e.metaKey : e.ctrlKey;
        if (sel && !sel.dragging && mod && keyLower === 'c') {
          e.preventDefault();
          e.stopImmediatePropagation();
          const rewrapped = e.shiftKey;
          void (rewrapped ? copyRewrapped(selectedSessionId) : copyRaw(selectedSessionId)).then(() => {
            flashCopy(selectedSessionId, rewrapped ? 'rewrapped' : 'raw');
          });
          return;
        }
        if (mod && keyLower === 'v') {
          e.preventDefault();
          e.stopImmediatePropagation();
          void doPaste(selectedSessionId);
          return;
        }
      }

      if (currentMode === 'passthrough') return;

      const api = apiRef.current;
      if (!api) return;
      const sid = selectedIdRef.current;

      if (renamingRef.current) return;

      const ck = confirmKillRef.current;
      if (ck) {
        e.preventDefault();
        e.stopPropagation();
        if (ck.exit) return;
        if (e.key.toLowerCase() === ck.char.toLowerCase()) {
          acceptKill(() => orchestrateKill(api, ck.id, selectPanel, setSelectedId, killInProgressRef, overlayElRef));
          return;
        }
        rejectKill();
        return;
      }

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

      if (e.key === '|' || e.key === '%') {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onSplitH(sid, 'keyboard');
        return;
      }

      if (e.key === '-' || e.key === '"') {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onSplitV(sid, 'keyboard');
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!sid) return;

        const dir = e.key;
        const hist = navHistory.current;
        let targetId: string | null = null;
        if (hist && ARROW_OPPOSITES[dir] === hist.direction && api.getPanel(hist.fromId)) {
          targetId = hist.fromId;
        } else {
          targetId = findPanelInDirection(sid, dir as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', api, panelElements);
        }
        if (!targetId) return;

        swapTerminals(sid, targetId);

        const activePanel = api.getPanel(sid);
        const targetPanel = api.getPanel(targetId);
        if (activePanel && targetPanel) {
          const activeTitle = activePanel.title ?? sid;
          const targetTitle = targetPanel.title ?? targetId;
          activePanel.api.setTitle(targetTitle);
          targetPanel.api.setTitle(activeTitle);
        }

        navHistory.current = { direction: dir, fromId: sid };
        selectPanel(targetId);
        return;
      }

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

      if (e.key === ',' && sid) {
        e.preventDefault();
        e.stopPropagation();
        setRenamingPaneId(sid);
        return;
      }

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
        const alertButton = findAlertButtonForSession(sid);
        if (alertButton) {
          alertButton.click();
        } else {
          dismissOrToggleAlert(sid, getActivity(sid).status);
        }
        return;
      }

      if (e.key === 'z' && sid) {
        e.preventDefault();
        e.stopPropagation();
        pondActionsRef.current.onZoom(sid);
        return;
      }

      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!sid) return;

        const dir = e.key;
        const currentType = selectedTypeRef.current;
        const currentDoors = doorsRef.current;

        if (currentType === 'door') {
          if (dir === 'ArrowUp') {
            if (api.panels.length > 0) {
              selectPanel(api.panels[api.panels.length - 1].id);
            }
            return;
          }
          const doorIdx = currentDoors.findIndex(d => d.id === sid);
          if (dir === 'ArrowLeft' && doorIdx > 0) {
            selectDoor(currentDoors[doorIdx - 1].id);
          } else if (dir === 'ArrowRight' && doorIdx < currentDoors.length - 1) {
            selectDoor(currentDoors[doorIdx + 1].id);
          }
          return;
        }

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
          selectDoor(currentDoors[0].id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [
    acceptKill,
    apiRef,
    confirmKillRef,
    dialogKeyboardActiveRef,
    doorsRef,
    enterTerminalMode,
    exitTerminalMode,
    handleReattachRef,
    killInProgressRef,
    minimizePane,
    modeRef,
    overlayElRef,
    panelElements,
    pondActionsRef,
    rejectKill,
    renamingRef,
    selectDoor,
    selectPanel,
    selectedIdRef,
    selectedTypeRef,
    setConfirmKill,
    setRenamingPaneId,
    setSelectedId,
  ]);
}
