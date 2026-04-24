/**
 * Tutorial step detection — watches Dockview and Pond events
 * to detect when users complete each tutorial step.
 */

import type { TutorialShell } from './tutorial-shell';

type DockviewApi = any;
type PondEvent = import('mouseterm-lib/components/Pond').PondEvent;
type PondMode = import('mouseterm-lib/components/Pond').PondMode;

const RESIZE_RATIO_DELTA = 0.08;

interface SerializedGridLeaf {
  type: 'leaf';
  data?: { id?: string };
  size?: number;
}

interface SerializedGridBranch {
  type: 'branch';
  data: SerializedGridNode[];
  size?: number;
}

type SerializedGridNode = SerializedGridLeaf | SerializedGridBranch;

interface ResizeSnapshot {
  branchRatios: Map<string, number[]>;
  structureSignature: string;
}

export class TutorialDetector {
  private shell: TutorialShell;
  private api: DockviewApi | null = null;
  private disposables: (() => void)[] = [];

  // Tracking state
  private initialPanelCount = 0;
  private currentMode: PondMode = 'command';
  private hasZoomed = false;
  private hasMinimized = false;
  private focusedPanelIds = new Set<string>();
  private pendingResizeBaselineReset = false;
  private resizeBaseline: ResizeSnapshot | null = null;

  constructor(shell: TutorialShell) {
    this.shell = shell;
  }

  /** Connect to the DockviewApi and start detecting. */
  attach(api: DockviewApi): void {
    this.api = api;
    this.initialPanelCount = api.totalPanels;
    this.resizeBaseline = this.captureResizeSnapshot();

    // Step 1: Split detection — panel count increases
    const addDisposable = api.onDidAddPanel(() => {
      if (api.totalPanels > this.initialPanelCount) {
        if (!this.shell.isStepComplete(1)) {
          // Adding a panel changes the layout, but it shouldn't count as a resize.
          this.pendingResizeBaselineReset = true;
        }
        this.shell.markStepComplete(0); // Step 1
      }
    });
    this.disposables.push(() => addDisposable.dispose());

    // Step 2: Resize detection — watch layout changes for ratio shifts
    const layoutDisposable = api.onDidLayoutChange(() => {
      if (!this.shell.isStepComplete(1) && this.shell.isStepComplete(0)) {
        if (this.pendingResizeBaselineReset) {
          this.resizeBaseline = this.captureResizeSnapshot();
          this.pendingResizeBaselineReset = false;
          return;
        }
        this.checkResize();
      }
    });
    this.disposables.push(() => layoutDisposable.dispose());

    // Step 5: Track panel focus changes in command mode
    const activePanelDisposable = api.onDidActivePanelChange((panel: any) => {
      if (panel && this.currentMode === 'command') {
        this.focusedPanelIds.add(panel.id);
        if (this.focusedPanelIds.size >= 2 && this.shell.isStepComplete(3)) {
          this.shell.markStepComplete(4); // Step 5
        }
      }
    });
    this.disposables.push(() => activePanelDisposable.dispose());
  }

  /** Handle Pond state change events. */
  handlePondEvent(event: PondEvent): void {
    switch (event.type) {
      case 'modeChange':
        if (event.mode === 'command' && this.currentMode !== 'command') {
          // Reset focus tracking when entering command mode
          this.focusedPanelIds.clear();
          // Add the currently active panel
          if (this.api) {
            const activePanel = this.api.activePanel;
            if (activePanel) this.focusedPanelIds.add(activePanel.id);
          }
        }
        this.currentMode = event.mode;
        break;

      case 'zoomChange':
        if (event.zoomed) {
          this.hasZoomed = true;
        } else if (this.hasZoomed && this.shell.isStepComplete(1)) {
          // Unzoomed after having zoomed — Step 3 complete
          this.shell.markStepComplete(2);
          this.hasZoomed = false;
        }
        break;

      case 'minimizeChange':
        if (event.count > 0) {
          this.hasMinimized = true;
        } else if (this.hasMinimized && this.shell.isStepComplete(2)) {
          // Reattached (count back to 0 after minimize) — Step 4 complete
          this.shell.markStepComplete(3);
          this.hasMinimized = false;
        }
        break;

      case 'split':
        if (event.source === 'keyboard' && this.currentMode === 'command' && this.shell.isStepComplete(4)) {
          this.shell.markStepComplete(5); // Step 6
        }
        break;
    }
  }

  private checkResize(): void {
    const snapshot = this.captureResizeSnapshot();
    if (!snapshot) return;

    if (!this.resizeBaseline) {
      this.resizeBaseline = snapshot;
      return;
    }

    if (
      snapshot.structureSignature !== this.resizeBaseline.structureSignature
      || snapshot.branchRatios.size !== this.resizeBaseline.branchRatios.size
    ) {
      this.resizeBaseline = snapshot;
      return;
    }

    for (const [path, ratios] of snapshot.branchRatios) {
      const baselineRatios = this.resizeBaseline.branchRatios.get(path);
      if (!baselineRatios || baselineRatios.length !== ratios.length) {
        this.resizeBaseline = snapshot;
        return;
      }

      for (let i = 0; i < ratios.length; i++) {
        if (Math.abs(ratios[i] - baselineRatios[i]) >= RESIZE_RATIO_DELTA) {
          this.shell.markStepComplete(1); // Step 2
          return;
        }
      }
    }
  }

  private captureResizeSnapshot(): ResizeSnapshot | null {
    const root = this.api?.toJSON?.()?.grid?.root as SerializedGridNode | undefined;
    if (!root) return null;

    const branchRatios = new Map<string, number[]>();
    const structureSignature = this.collectResizeSnapshot(root, 'root', branchRatios);
    return { branchRatios, structureSignature };
  }

  private collectResizeSnapshot(
    node: SerializedGridNode,
    path: string,
    branchRatios: Map<string, number[]>,
  ): string {
    if (node.type === 'leaf') {
      return `leaf:${node.data?.id ?? path}`;
    }

    const children = node.data;
    const totalSize = children.reduce((sum, child) => sum + (child.size ?? 0), 0);
    if (children.length >= 2 && totalSize > 0) {
      branchRatios.set(path, children.map((child) => (child.size ?? 0) / totalSize));
    }

    const childSignatures = children.map((child, index) =>
      this.collectResizeSnapshot(child, `${path}.${index}`, branchRatios),
    );
    return `branch(${childSignatures.join(',')})`;
  }

  dispose(): void {
    for (const dispose of this.disposables) {
      dispose();
    }
    this.disposables = [];
  }
}
