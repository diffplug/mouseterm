import type { DockviewApi, IDockviewPanel } from 'dockview-react';

/** Pick the split direction (right vs below) based on the reference panel's
 *  aspect ratio — wider than tall splits horizontally, taller than wide
 *  splits vertically. */
export function pickSplitDirection(panel: IDockviewPanel | null): 'right' | 'below' {
  if (!panel) return 'right';
  return panel.api.width - panel.api.height > 0 ? 'right' : 'below';
}

/** swapTerminals only swaps registry entries; dockview tracks titles
 *  independently, so titles must be swapped on the panels too. */
export function swapPanelTitles(api: DockviewApi, idA: string, idB: string): void {
  const a = api.getPanel(idA);
  const b = api.getPanel(idB);
  if (!a || !b) return;
  const titleA = a.title ?? idA;
  const titleB = b.title ?? idB;
  a.api.setTitle(titleB);
  b.api.setTitle(titleA);
}
