import { getPlatform } from './platform';
import { registry } from './terminal-store';
import { disposeSession, getOrCreateTerminal, setPendingShellOpts, unmountElement } from './terminal-lifecycle';
import { getDefaultShellOpts } from './shell-defaults';
import { getTerminalPaneState, isPaneOscDriven, seedLaunchedCommand } from './terminal-state-store';
import type { HelperIdentity } from './terminal-context-types';

export type HelperStatus = 'waiting' | 'running' | 'completed' | 'preserved' | 'off' | 'unsupported' | 'exited';
export interface HelperTerminal extends HelperIdentity { id: string; status: HelperStatus; promoting?: boolean; timer?: ReturnType<typeof setInterval> }
const helpers = new Map<string, HelperTerminal>();
const pending = new Map<string, Promise<HelperTerminal>>();
const listeners = new Set<() => void>();
let revision = 0;
export function notifyHelpers(): void { revision++; for (const listener of listeners) listener(); }
export const subscribeHelpers = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const helperRevision = () => revision;
export const getHelper = (parentId: string) => helpers.get(parentId);

export function restoreHelper(id: string, identity: HelperIdentity): void {
  // Replays do not prove absence of user input. Recovery always disarms autorun.
  const helper: HelperTerminal = { ...identity, id, status: 'preserved' };
  helpers.set(identity.parentId, helper);
  let inspecting = false;
  helper.timer = setInterval(() => {
    const entry = registry.get(id);
    if (!entry || entry.exited || helpers.get(identity.parentId) !== helper) { clearInterval(helper.timer); return; }
    if (inspecting) return;
    inspecting = true;
    void helperHasWork(helper).catch(() => { entry.helperBusy = true; }).finally(() => { inspecting = false; });
  }, 2000);
  unmountElement(id);
  notifyHelpers();
}

export async function helperHasWork(helper: HelperTerminal): Promise<boolean> {
  const entry = registry.get(helper.id);
  if (helper.promoting) return true;
  if (!entry || entry.exited) return false;
  if (getTerminalPaneState(helper.id).currentCommand) { entry.helperBusy = true; return true; }
  const inputVersion = entry.inputVersion;
  const info = await getPlatform().terminalContext?.({ op: 'info', id: helper.id });
  entry.helperBusy = info?.busy !== false || entry.inputVersion !== inputVersion || Boolean(helper.promoting) || !!getTerminalPaneState(helper.id).currentCommand;
  return entry.helperBusy;
}

export function forgetHelper(parentId: string): void {
  const helper = helpers.get(parentId);
  if (!helper) return;
  clearInterval(helper.timer);
  helpers.delete(parentId);
  notifyHelpers();
}

export function disposeHelper(parentId: string): void {
  const helper = helpers.get(parentId);
  if (!helper) return;
  forgetHelper(parentId);
  disposeSession(helper.id);
}

export async function openHelper(parentId: string): Promise<HelperTerminal> {
  const inFlight = pending.get(parentId);
  if (inFlight) return inFlight;
  const operation = (async () => {
    if (helpers.has(parentId) && !registry.has(helpers.get(parentId)!.id)) forgetHelper(parentId);
    const previous = helpers.get(parentId);
    if (previous) {
      const entry = registry.get(previous.id);
      if (!entry?.untouched || (previous.status !== 'completed' && previous.status !== 'off') || await helperHasWork(previous)) return previous;
      // Input or ownership can change during process inspection.
      if (helpers.get(parentId) !== previous || !entry.untouched) return helpers.get(parentId) ?? previous;
      disposeHelper(parentId);
    }
    const platform = getPlatform();
    if (!platform.terminalContext) throw new Error('Helper terminals are unavailable on this host');
    const settings = await platform.terminalContext({ op: 'settings' });
    if (!registry.has(parentId)) throw new Error('The parent terminal has closed');
    const id = `helper-${crypto.randomUUID()}`;
    const cwd = getTerminalPaneState(parentId).cwd;
    const command = settings.command;
    const helper: HelperTerminal = { id, parentId, command, status: command ? 'waiting' : 'off' };
    helpers.set(parentId, helper);
    setPendingShellOpts(id, { ...getDefaultShellOpts(), cwd: cwd && !cwd.isRemote ? cwd.path : undefined, helper: { parentId, command } });
    getOrCreateTerminal(id);
    unmountElement(id);
    notifyHelpers();
    const started = Date.now();
    let lastInspection = 0;
    let inspecting = false;
    helper.timer = setInterval(() => {
      const entry = registry.get(id);
      if (!entry || helpers.get(parentId) !== helper) { clearInterval(helper.timer); return; }
      let status = helper.status;
      if (entry.exited) status = 'exited';
      else if (!entry.untouched) status = 'preserved';
      else if (helper.status === 'waiting') {
        if (isPaneOscDriven(id) && ['prompt', 'editing'].includes(getTerminalPaneState(id).activity.kind) && !getTerminalPaneState(id).currentCommand) {
          status = 'running';
          seedLaunchedCommand(id, command, cwd?.path);
          platform.writePty(id, `${command}\r`);
        } else if (Date.now() - started >= 8000) status = 'unsupported';
      } else if (helper.status === 'running' && ['prompt', 'editing'].includes(getTerminalPaneState(id).activity.kind) && !getTerminalPaneState(id).currentCommand) status = 'completed';
      if (status !== helper.status) { helper.status = status; notifyHelpers(); }
      if (status === 'completed' || status === 'off' || status === 'preserved' || status === 'unsupported') {
        if (Date.now() - lastInspection >= 2000 && !inspecting) {
          inspecting = true; lastInspection = Date.now();
          void helperHasWork(helper).catch(() => { entry.helperBusy = true; }).finally(() => { inspecting = false; });
        }
      }
      if (status === 'exited') clearInterval(helper.timer);
    }, 100);
    return helper;
  })();
  pending.set(parentId, operation);
  try { return await operation; } finally { pending.delete(parentId); }
}

export function abbreviatedDirectory(path: string, home: string): string {
  if (!home) return path;
  const windows = /^[a-z]:[\\/]/i.test(home);
  const normalize = (value: string) => windows ? value.replace(/\\/g, '/').toLowerCase() : value;
  const base = normalize(home).replace(/\/$/, '');
  const candidate = normalize(path);
  return candidate === base || candidate.startsWith(`${base}/`) ? `~${path.slice(base.length)}` : path;
}
