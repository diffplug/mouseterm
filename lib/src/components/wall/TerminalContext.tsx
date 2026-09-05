import { useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { TerminalPane } from '../TerminalPane';
import { TerminalContextView, type ContextScan } from './TerminalContextView';
import { TerminalContextContext, WallActionsContext } from './wall-context';
import { abbreviatedDirectory, disposeHelper, getHelper, helperRevision, openHelper, subscribeHelpers } from '../../lib/helper-terminal';
import { getPlatform, IS_MAC, IS_WINDOWS } from '../../lib/platform';
import { buildAppTitleResolver, commandArgv0, createTerminalPaneState, deriveSurfaceLabel, explainTerminalTitle } from '../../lib/terminal-state';
import { focusSession, getActivitySnapshot, getTerminalPaneStateSnapshot, isCommandWatched, setCommandWatched, subscribeToActivity, subscribeToTerminalPaneState, subscribeToWatchedCommands, getWatchedCommandsSnapshot, toggleSessionTodo } from '../../lib/terminal-registry';
import { writeTextToClipboard } from '../../lib/clipboard';
import { listenerUrlsByPort } from './port-url';
import { registry } from '../../lib/terminal-store';

export function TerminalContext({ id, title }: { id: string; title?: string }) {
  const context = useContext(TerminalContextContext);
  const actions = useContext(WallActionsContext);
  const states = useSyncExternalStore(subscribeToTerminalPaneState, getTerminalPaneStateSnapshot);
  const activities = useSyncExternalStore(subscribeToActivity, getActivitySnapshot);
  useSyncExternalStore(subscribeHelpers, helperRevision);
  useSyncExternalStore(subscribeToWatchedCommands, getWatchedCommandsSnapshot);
  const [scan, setScan] = useState<ContextScan>({ status: 'scanning' });
  const [home, setHome] = useState('');
  const [defaultCommand, setDefaultCommand] = useState('git status');
  const [error, setError] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const platform = getPlatform();
  const helper = getHelper(id);
  const state = states.get(id) ?? createTerminalPaneState();
  const helperState = helper ? states.get(helper.id) : undefined;
  const cwd = state.cwd?.path ?? '';
  const helperCwd = helperState?.cwd?.path;
  const argv0 = state.currentCommand?.rawCommandLine ? commandArgv0(state.currentCommand.rawCommandLine) : null;
  const appTitleForPane = buildAppTitleResolver(states, activities);
  const run = (operation: Promise<unknown>) => { setError(''); void operation.catch(e => setError(e instanceof Error ? e.message : String(e))); };
  useEffect(() => {
    let cancelled = false;
    void openHelper(id).catch(e => { if (!cancelled) setError(String(e instanceof Error ? e.message : e)); });
    void platform.terminalContext?.({ op: 'settings' }).then(info => { if (!cancelled) { setHome(info.home); setDefaultCommand(info.command); } }).catch(() => {});
    void platform.getOpenPorts(id).then(ports => { if (!cancelled) setScan({ status: 'loaded', entries: listenerUrlsByPort(ports) }); }, () => { if (!cancelled) setScan({ status: 'failed' }); });
    wrapper.current?.querySelector<HTMLElement>('[data-terminal-context]')?.focus({ preventScroll: true });
    return () => { cancelled = true; };
  }, [id, platform]);
  useEffect(() => {
    const outside = (e: PointerEvent) => { if (!wrapper.current?.contains(e.target as Node)) context.close(); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [context]);
  const copy = async (value: string) => { if (!await writeTextToClipboard(value)) throw new Error('Could not copy to clipboard'); };
  return <div ref={wrapper} onMouseDown={e => e.stopPropagation()}>
    <TerminalContextView title={deriveSurfaceLabel(state, appTitleForPane, title ?? id)} surfaceRef={actions.resolveSurfaceRef(id)}
      titleSources={explainTerminalTitle(state, { appTitleForPane })} cwd={abbreviatedDirectory(cwd, home) || 'Directory unknown'} helperCwd={helperCwd ? abbreviatedDirectory(helperCwd, home) : 'Directory unknown'}
      mismatch={!!helper && !!cwd && !!helperCwd && (cwd !== helperCwd || state.cwd?.isRemote !== helperState?.cwd?.isRemote || (state.cwd?.isRemote && state.cwd.host !== helperState?.cwd?.host))}
      scan={scan} argv0={argv0} watching={!!argv0 && isCommandWatched(argv0)} todo={activities.get(id)?.todo === true} notification={activities.get(id)?.notification}
      status={helper && registry.get(helper.id)?.exited ? 'exited' : helper && !registry.get(helper.id)?.untouched ? 'preserved' : helper?.status ?? 'waiting'} command={helper?.command ?? defaultCommand} defaultCommand={defaultCommand} error={error} warning={context.warning ?? (helper && helper.status !== 'waiting' && (!cwd || !helperCwd) ? 'Directory comparison unavailable: a terminal has not reported its directory.' : undefined)}
      explorerLabel={IS_MAC ? 'Open in Finder' : IS_WINDOWS ? 'Open in Explorer' : 'Open folder'} canExplore={!!platform.terminalContext && !!cwd && !state.cwd?.isRemote}
      canAgent={!!platform.agentBrowserOpen} canPopout={!!platform.agentBrowserPopOut} canIframe={!!platform.createIframeProxyUrl}
      onClose={() => { context.close(); focusSession(id, true); }} onCopyRef={() => run(copy(actions.resolveSurfaceRef(id)))} onCopyPath={() => run(copy(cwd))}
      onExplore={() => { if (platform.terminalContext) run(platform.terminalContext({ op: 'openDirectory', id, path: cwd })); }}
      onWatch={() => { if (argv0) setCommandWatched(argv0, !isCommandWatched(argv0)); }} onTodo={() => toggleSessionTodo(id)}
      onPort={(entry, mode) => run(context.openPort(id, entry, mode))}
      onModify={async command => { await platform.terminalContext?.({ op: 'settings', command }); setDefaultCommand(command); }}
      onReset={async () => { disposeHelper(id); await openHelper(id); }} onPromote={() => context.promote(id)}>
      {helper && <div data-helper-terminal={helper.id} className="h-full px-3 py-2" onMouseDown={() => focusSession(helper.id, true)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }}><TerminalPane key={helper.id} id={helper.id} isFocused={false} /></div>}
    </TerminalContextView>
  </div>;
}
