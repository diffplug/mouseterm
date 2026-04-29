import { findPanelInDirection } from '../../../lib/spatial-nav';
import { ARROW_OPPOSITES, type NavHistoryRef, type PondKeyboardCtx } from './types';

/**
 * Plain arrow navigation: across panes (in dockview), or across doors (in
 * the baseboard), with backtracking via the NavHistoryRef.
 */
export function handlePaneNavigation(
  e: KeyboardEvent,
  ctx: PondKeyboardCtx,
  navHistory: NavHistoryRef,
): boolean {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || e.metaKey) {
    return false;
  }
  e.preventDefault();
  e.stopPropagation();

  const api = ctx.apiRef.current;
  const sid = ctx.selectedIdRef.current;
  if (!api || !sid) return true;

  const dir = e.key;
  const currentType = ctx.selectedTypeRef.current;
  const currentDoors = ctx.doorsRef.current;

  if (currentType === 'door') {
    if (dir === 'ArrowUp') {
      if (api.panels.length > 0) ctx.selectPanel(api.panels[api.panels.length - 1].id);
      return true;
    }
    const doorIdx = currentDoors.findIndex((d) => d.id === sid);
    if (dir === 'ArrowLeft' && doorIdx > 0) ctx.selectDoor(currentDoors[doorIdx - 1].id);
    else if (dir === 'ArrowRight' && doorIdx < currentDoors.length - 1) ctx.selectDoor(currentDoors[doorIdx + 1].id);
    return true;
  }

  const hist = navHistory.current;
  if (hist && ARROW_OPPOSITES[dir] === hist.direction && api.getPanel(hist.fromId)) {
    navHistory.current = { direction: dir, fromId: sid };
    ctx.selectPanel(hist.fromId);
    return true;
  }

  const targetId = findPanelInDirection(sid, dir as 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown', api, ctx.panelElements);
  if (targetId) {
    navHistory.current = { direction: dir, fromId: sid };
    ctx.selectPanel(targetId);
  } else if (dir === 'ArrowDown' && currentDoors.length > 0) {
    ctx.selectDoor(currentDoors[0].id);
  }
  return true;
}
