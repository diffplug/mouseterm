import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowCounterClockwiseIcon, ArrowLineUpIcon, ArrowSquareOutIcon, BugBeetleIcon, CheckIcon, CircleNotchIcon, CopyIcon, FrameCornersIcon, PauseIcon, SlidersHorizontalIcon, TerminalIcon, WarningIcon, XIcon } from '@phosphor-icons/react';
import { OnOffSwitch, POPUP_SURFACE_CLASS, SUBTLE_ACTION_COLOR_CLASS, SUBTLE_ACTION_INTERACTION_CLASS } from '../design';
import { stepFocus } from '../focus-step';
import { AgentRobotIcon } from './BrowserDisplayIcon';
import type { PortUrlEntry } from './port-url';
import type { HelperStatus } from '../../lib/helper-terminal';

export type PortMode = 'system' | 'iframe' | 'ab-screencast' | 'ab-popout';
export type ContextScan = { status: 'scanning' | 'failed' } | { status: 'loaded'; entries: PortUrlEntry[] };
/** Every action may fail asynchronously; the view reports the failure. */
type Action = () => void | Promise<void>;
export interface TerminalContextViewProps {
  defaultCommand?: string; title: string; surfaceRef: string; cwd: string; helperCwd?: string; mismatch?: boolean;
  titleSources: { source: string; value: string; note?: string }[];
  scan: ContextScan; argv0?: string | null; watching: boolean; todo: boolean;
  notification?: { title: string | null; body: string | null } | null;
  status: HelperStatus; command: string; warning?: string;
  explorerLabel: string; canExplore: boolean; canAgent: boolean; canIframe: boolean;
  children: ReactNode;
  onClose(): void; onCopyRef: Action; onCopyPath: Action; onExplore: Action;
  onWatch(): void; onTodo(): void; onPort(entry: PortUrlEntry, mode: PortMode): void | Promise<void>;
  onModify(command: string): Promise<void>; onReset: Action; onPromote: Action;
  initialDetail?: 'title' | 'modify' | 'reset' | null;
}

export function ContextAction({ children, label, onClick, disabled = false, muted = false }: { children: ReactNode; label: string; onClick?: () => void; disabled?: boolean; muted?: boolean }) {
  return <button type="button" title={label} aria-label={label} disabled={disabled} onClick={onClick}
    className={`inline-flex h-6 shrink-0 items-center justify-center gap-1.5 rounded px-1.5 disabled:opacity-40 ${SUBTLE_ACTION_INTERACTION_CLASS} ${muted ? 'text-muted' : SUBTLE_ACTION_COLOR_CLASS}`}>{children}</button>;
}

export function TerminalContextView(p: TerminalContextViewProps) {
  const detailRoot = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState(p.initialDetail ?? null);
  useEffect(() => {
    if (!detail) return;
    const previous = document.activeElement as HTMLElement | null;
    detailRoot.current?.querySelector<HTMLElement>('input,button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [detail]);
  const [port, setPort] = useState<number | null>(null);
  const [command, setCommand] = useState(p.command);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const entries = p.scan.status === 'loaded' ? p.scan.entries : [];
  const selected = entries.find(entry => entry.port === port) ?? entries[0];
  const preserved = p.status === 'preserved';
  const attempt = async (action: Action) => { setError(''); try { await action(); return true; } catch (e) { setError(String(e instanceof Error ? e.message : e)); return false; } };
  /** A detail-dialog action: closes the dialog on success and holds the buttons meanwhile. */
  const submit = async (action: Action) => { setBusy(true); if (await attempt(action)) setDetail(null); setBusy(false); };
  const status = p.status === 'waiting' ? 'Waiting for shell…' : p.status === 'off' ? 'Autorun off' : p.status === 'unsupported' ? 'Autorun skipped: shell readiness unavailable' : p.status === 'exited' ? 'Helper exited' : preserved ? 'Skipping autorun to preserve user keystrokes' : p.status === 'running' ? `Running ${p.command}…` : `${p.command} autoran`;
  return <section aria-label="Terminal context" data-terminal-context tabIndex={-1}
    className={`${POPUP_SURFACE_CLASS} absolute bottom-8 left-0 right-8 top-0 flex flex-col overflow-hidden text-sm`}
    onKeyDown={event => {
      if ((event.target as HTMLElement).closest('[data-helper-terminal]') && !detail) return;
      if (detail && event.key === 'Tab') {
        event.preventDefault();
        stepFocus(Array.from(detailRoot.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select') ?? []), event.shiftKey ? -1 : 1);
      }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (detail) setDetail(null); else p.onClose(); }
    }}>
    <div className="shrink-0 px-3 py-2">
      <div className="grid grid-cols-[4rem_1fr] items-center gap-y-1">
        <span className="text-muted">Title</span>
        <div className="flex h-6 min-w-0 items-center gap-1.5">
          <span className="truncate">{p.title}</span><ContextAction label="Explain this title" onClick={() => setDetail('title')}><BugBeetleIcon size={15} />Explain</ContextAction>
          <div className="ml-auto flex shrink-0 items-center gap-2 text-muted"><ContextAction label="Copy surface identifier" onClick={() => void attempt(p.onCopyRef)}><span className="text-muted">{p.surfaceRef}</span><CopyIcon size={12} /></ContextAction><ContextAction label="Close terminal context" onClick={p.onClose} muted><XIcon size={15} /></ContextAction></div>
        </div>
        <span className="text-muted">Dir</span>
        <div className="flex min-h-6 min-w-0 flex-wrap items-center gap-1.5"><span className="truncate" title={p.cwd}>{p.cwd}</span><ContextAction label={p.canExplore ? p.explorerLabel : 'Directory unavailable on this host'} disabled={!p.canExplore} onClick={() => void attempt(p.onExplore)}><ArrowSquareOutIcon size={15} />{p.explorerLabel}</ContextAction><ContextAction label="Copy absolute path" onClick={() => void attempt(p.onCopyPath)}><CopyIcon size={14} />Copy path</ContextAction></div>
        <span className="text-muted">Ports</span>
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          {p.scan.status === 'scanning' ? <span className="text-muted">Scanning ports…</span> : p.scan.status === 'failed' ? <span className="text-error">Port scan failed · Reopen to try again</span> : !selected ? <span className="text-muted">No listening ports</span> : <>
            {entries.length > 1 ? <div className="inline-flex shrink-0 items-center gap-2"><select aria-label="Port" value={selected.port} onChange={e => setPort(Number(e.target.value))} className="h-6 rounded border border-input-border bg-input-bg px-1 text-foreground">{entries.map(entry => <option key={entry.port} value={entry.port}>{entry.host}:{entry.port}{entry.processName ? ` · ${entry.processName}` : ''}</option>)}</select><span className="text-muted">{entries.length} ports</span></div> : <><span>{selected.host}:{selected.port}</span><span className="text-muted">{selected.processName}</span></>}
            <div className="ml-1 inline-flex shrink-0 items-center gap-1 border-l border-border pl-2">
              <ContextAction label="Open in system browser" onClick={() => void attempt(() => p.onPort(selected, 'system'))}><ArrowSquareOutIcon size={15} />System browser</ContextAction>
              <ContextAction label={p.canIframe ? 'Open in iframe embed' : 'Iframe unavailable on this host'} disabled={!p.canIframe} onClick={() => void attempt(() => p.onPort(selected, 'iframe'))}><FrameCornersIcon size={15} />Iframe</ContextAction>
              <ContextAction label={p.canAgent ? 'Open in agent-browser screencast' : 'Agent browser unavailable on this host'} disabled={!p.canAgent} onClick={() => void attempt(() => p.onPort(selected, 'ab-screencast'))}><AgentRobotIcon size={17} />Agent browser</ContextAction>
              <ContextAction label={p.canAgent ? 'Open in agent-browser popout' : 'Popout unavailable on this host'} disabled={!p.canAgent} onClick={() => void attempt(() => p.onPort(selected, 'ab-popout'))}><AgentRobotIcon size={17} /><ArrowSquareOutIcon size={13} />Popout</ContextAction>
            </div>
          </>}
        </div>
        <span className="text-muted">Alerts</span><div className="flex h-6 items-center gap-2"><span>{p.argv0 ? `Watch all ${p.argv0} commands` : 'No command running'}</span>{p.argv0 && <OnOffSwitch on={p.watching} onEnable={p.onWatch} onDisable={p.onWatch} label={`Watch all ${p.argv0} commands`} />}<span className="mx-1 h-3 border-l border-border" /><span>TODO</span><OnOffSwitch on={p.todo} onEnable={p.onTodo} onDisable={p.onTodo} label="TODO" /></div>
      </div>
      {p.notification && <div className="ml-16 mt-2 border-l-2 border-border py-1 pl-3"><div>{p.notification.title}</div><div className="whitespace-pre-wrap text-muted">{p.notification.body}</div></div>}
    </div>
    <div className="@container flex min-h-0 flex-1 flex-col border-t border-border">
      <div aria-label="Helper terminal status" className="flex h-9 shrink-0 items-center gap-3 whitespace-nowrap px-3">
        <span className="hidden shrink-0 items-center gap-2 font-semibold @[48rem]:flex"><TerminalIcon size={15} />Helper terminal</span>
        <div className="flex min-w-0 items-center gap-2 text-muted">{p.status === 'running' || p.status === 'waiting' ? <CircleNotchIcon size={13} className="shrink-0 animate-spin" /> : preserved || p.status === 'off' || p.status === 'unsupported' ? <PauseIcon size={13} className="shrink-0" /> : <CheckIcon size={13} className="shrink-0" />}<span className="truncate" title={status}>{status}</span>
          {preserved || p.status === 'exited' ? <ContextAction label="Reset helper terminal" onClick={() => setDetail('reset')}><ArrowCounterClockwiseIcon size={13} />Reset…</ContextAction> : <ContextAction label="Modify autorun command" onClick={() => { setCommand(p.defaultCommand ?? p.command); setDetail('modify'); }}><SlidersHorizontalIcon size={15} />Modify</ContextAction>}
        </div>
        <div className="ml-auto shrink-0"><ContextAction label="Move this terminal into a new pane" disabled={busy} onClick={() => void submit(p.onPromote)}><ArrowLineUpIcon size={15} />Promote</ContextAction></div>
      </div>
      {p.mismatch && <div role="alert" className="mx-3 mb-2 flex shrink-0 items-start gap-2 border-l-4 border-error bg-error/10 px-3 py-2"><WarningIcon size={18} weight="fill" className="shrink-0 text-error" /><div><div className="font-semibold">Helper directory differs from parent</div><div className="mt-1 grid grid-cols-[4rem_1fr] gap-x-2"><span className="text-muted">Helper</span><strong>{p.helperCwd}</strong><span className="text-muted">Parent</span><span>{p.cwd}</span></div></div></div>}
      {(p.warning || (!detail && error)) && <div role="alert" className="mx-3 mb-2 border-l-4 border-error bg-error/10 px-3 py-2">{p.warning || error}</div>}
      <div className="min-h-0 flex-1 bg-terminal-bg text-terminal-fg">{p.children}</div>
    </div>
    {detail && <div className="absolute inset-0 z-10 bg-app-bg/35" onClick={() => setDetail(null)}><div ref={detailRoot} role="dialog" aria-modal="true" aria-label={detail === 'title' ? 'Title sources' : detail === 'modify' ? 'Default helper autorun command' : 'Reset helper terminal'} className={`${POPUP_SURFACE_CLASS} absolute left-3 right-3 top-9 p-4`} onClick={e => e.stopPropagation()}>
      <div className="mb-3 flex items-center justify-between font-semibold"><span>{detail === 'title' ? 'Why this title?' : detail === 'modify' ? 'Default helper autorun command' : 'Reset helper terminal?'}</span><ContextAction label="Close details" onClick={() => setDetail(null)} muted><XIcon size={14} /></ContextAction></div>
      {detail === 'title' ? <div className="grid grid-cols-[8rem_1fr_auto] gap-x-3 gap-y-2">{p.titleSources.map((source, index) => <div className="contents" key={index}><span className="text-muted">{source.source}</span><span>{source.value}</span><span className="text-muted">{source.note}</span></div>)}</div> : detail === 'modify' ? <><input autoFocus aria-label="Default helper autorun command" value={command} onChange={e => setCommand(e.target.value)} maxLength={4096} placeholder="Leave empty to turn autorun off" className="w-full border-b border-input-border bg-input-bg px-2 py-1.5 outline-focus-ring" /><p className="mb-4 mt-2 text-muted">Global default. Applies to new and reset helpers. Leave empty to turn autorun off.</p><div className="flex justify-end gap-2"><ContextAction label="Reset helper terminal" onClick={() => setDetail('reset')}>Reset helper…</ContextAction><ContextAction label="Save default" disabled={busy} onClick={() => void submit(() => p.onModify(command))}>Save default</ContextAction></div></> : <><p>Discard this helper, including scrollback, unfinished input, and any running program? Unsaved edits will be lost.</p><p className="mb-4 mt-2 text-muted">A fresh helper starts in the parent's current directory using the global autorun default.</p><div className="flex justify-end gap-2"><ContextAction label="Keep helper" onClick={() => setDetail(null)}>Keep helper</ContextAction><ContextAction label="Discard and reset" disabled={busy} onClick={() => void submit(p.onReset)}>Discard and reset</ContextAction></div></>}
      {error && <p role="alert" className="mt-2 text-error">{error}</p>}
    </div></div>}
  </section>;
}
