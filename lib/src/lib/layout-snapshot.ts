import { type SerializedDockview } from 'dockview-react';

export function cloneLayout(layout: SerializedDockview): SerializedDockview {
  return structuredClone(layout);
}

/** Strip size data from the grid tree so we only compare structure. */
function stripSizes(node: any): any {
  const { size, ...rest } = node;
  if (rest.data) return rest;
  if (rest.children) {
    return { ...rest, children: rest.children.map(stripSizes) };
  }
  return rest;
}

/** Structural fingerprint of a layout — ignores sizes/proportions so resizing
 *  doesn't invalidate a snapshot. Only compares tree shape and panel membership. */
export function getLayoutStructureSignature(layout: SerializedDockview): string {
  return JSON.stringify({
    root: stripSizes(layout.grid.root),
    orientation: layout.grid.orientation,
    panels: Object.keys(layout.panels).sort(),
  });
}
