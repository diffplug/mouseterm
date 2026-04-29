import { useCallback, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { DockviewApi, DockviewReadyEvent, SerializedDockview } from 'dockview-react';
import { getDefaultShellOpts, setPendingShellOpts, swapTerminals } from '../../lib/terminal-registry';
import type { DooredItem, WallMode, WallSelectionKind, SpawnDirection } from './wall-types';

export function useDockviewReady({
  apiRef,
  initialPaneIdsRef,
  restoredLayoutRef,
  initialDoorsRef,
  doorsRef,
  freshlySpawnedRef,
  killInProgressRef,
  selectedIdRef,
  selectedTypeRef,
  modeRef,
  enterTerminalModeRef,
  generatePaneId,
  selectPane,
  setDockviewApi,
  setDoors,
  setSelectedId,
  onApiReady,
}: {
  apiRef: RefObject<DockviewApi | null>;
  initialPaneIdsRef: RefObject<string[] | undefined>;
  restoredLayoutRef: RefObject<unknown>;
  initialDoorsRef: RefObject<DooredItem[]>;
  doorsRef: RefObject<DooredItem[]>;
  freshlySpawnedRef: RefObject<Map<string, SpawnDirection>>;
  killInProgressRef: RefObject<boolean>;
  selectedIdRef: RefObject<string | null>;
  selectedTypeRef: RefObject<WallSelectionKind>;
  modeRef: RefObject<WallMode>;
  enterTerminalModeRef: RefObject<(id: string) => void>;
  generatePaneId: () => string;
  selectPane: (id: string) => void;
  setDockviewApi: Dispatch<SetStateAction<DockviewApi | null>>;
  setDoors: Dispatch<SetStateAction<DooredItem[]>>;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  onApiReady?: (api: DockviewApi) => void;
}): (event: DockviewReadyEvent) => void {
  return useCallback((e: DockviewReadyEvent) => {
    apiRef.current = e.api;
    setDockviewApi(e.api);

    const restored = initialPaneIdsRef.current;
    const layout = restoredLayoutRef.current;
    const restoredDoors = initialDoorsRef.current;
    initialPaneIdsRef.current = undefined;
    restoredLayoutRef.current = undefined;
    initialDoorsRef.current = [];
    doorsRef.current = restoredDoors;
    setDoors(restoredDoors);

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
      try {
        e.api.fromJSON(layout as SerializedDockview);
        setSelectedId(restored[0]);
      } catch {
        for (const id of restored) {
          addTerminalPanel(id);
        }
        setSelectedId(restored[0]);
      }
    } else {
      const paneIds = restored && restored.length > 0
        ? restored
        : [generatePaneId()];
      for (const id of paneIds) {
        addTerminalPanel(id);
      }
      setSelectedId(paneIds[0]);
    }

    e.api.onWillShowOverlay((event) => {
      if (event.kind === 'tab') {
        event.preventDefault();
      }
    });

    const subscribeGroupDrop = (group: { model: any; activePanel: any }) => {
      return group.model.onWillDrop((event: any) => {
        if (event.position === 'center') {
          const data = event.getData();
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
            selectPane(targetPanel.id);
          }
          event.preventDefault();
        }
      });
    };
    for (const group of e.api.groups) {
      subscribeGroupDrop(group);
    }
    e.api.onDidAddGroup((group) => {
      subscribeGroupDrop(group);
    });

    e.api.onDidActivePanelChange((panel) => {
      if (panel) {
        if (selectedTypeRef.current === 'door') return;
        if (modeRef.current === 'passthrough' && selectedIdRef.current !== panel.id) {
          enterTerminalModeRef.current(panel.id);
          return;
        }
        setSelectedId(panel.id);
      }
    });

    e.api.onDidRemovePanel(() => {
      if (e.api.totalPanels !== 0) return;
      const reduceMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      const delay = (reduceMotion || killInProgressRef.current) ? 0 : 440;
      const spawn = () => {
        if (e.api.totalPanels > 0) return;
        const id = generatePaneId();
        freshlySpawnedRef.current.set(id, 'top-left');
        e.api.addPanel({ id, component: 'terminal', tabComponent: 'terminal', title: '<unnamed>' });
        if (selectedIdRef.current === null) {
          selectPane(id);
        }
      };
      setTimeout(spawn, delay);
    });

    onApiReady?.(e.api);
  }, [
    apiRef,
    doorsRef,
    enterTerminalModeRef,
    freshlySpawnedRef,
    generatePaneId,
    initialDoorsRef,
    initialPaneIdsRef,
    killInProgressRef,
    modeRef,
    onApiReady,
    restoredLayoutRef,
    selectPane,
    selectedIdRef,
    selectedTypeRef,
    setDockviewApi,
    setDoors,
    setSelectedId,
  ]);
}
