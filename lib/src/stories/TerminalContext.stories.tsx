import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import {
  ArrowCounterClockwiseIcon, ArrowLineUpIcon, ArrowSquareOutIcon,
  BellIcon, BugBeetleIcon, CheckIcon,
  CircleNotchIcon, CopyIcon, FrameCornersIcon, PauseIcon, TerminalIcon,
  SlidersHorizontalIcon, WarningIcon, XIcon,
} from '@phosphor-icons/react';
import { OnOffSwitch, PANE_HEADER_HEIGHT_PX, POPUP_SURFACE_CLASS, SUBTLE_ACTION_COLOR_CLASS as ACTION_COLOR_CLASS, SUBTLE_ACTION_INTERACTION_CLASS as ACTION_INTERACTION_CLASS } from '../components/design';
import { AgentRobotIcon } from '../components/wall/BrowserDisplayIcon';

// Presentation only: no PTYs, platform calls, persistence, or production menu
// wiring. Local state switches fixtures and opens visual detail treatments.
type Scenario = 'fresh' | 'noPorts' | 'running' | 'preserved' | 'editor' | 'differentDirectory' | 'multiplePorts' | 'notification' | 'autorunOff' | 'scanFailed';
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'fresh', label: 'Common case' },
  { id: 'noPorts', label: 'No ports' },
  { id: 'running', label: 'Autorun running' },
  { id: 'preserved', label: 'User input' },
  { id: 'editor', label: 'Editor open' },
  { id: 'differentDirectory', label: 'Different directory' },
  { id: 'multiplePorts', label: 'Multiple ports' },
  { id: 'notification', label: 'Notification' },
  { id: 'autorunOff', label: 'Autorun off' },
  { id: 'scanFailed', label: 'Scan failed' },
];
const PARENT_DIR = '~/projects/dormouse';
const HELPER_DIR = '~/projects/dormouse-fix';

function Action({ children, label, onClick, muted = false }: { children: ReactNode; label: string; onClick?: () => void; muted?: boolean }) {
  return <button type="button" title={label} aria-label={label} onClick={onClick}
    className={`inline-flex h-6 shrink-0 items-center justify-center gap-1.5 rounded px-1.5 ${ACTION_INTERACTION_CLASS} ${muted ? 'text-muted' : ACTION_COLOR_CLASS}`}>
    {children}
  </button>;
}

function Prompt({ children, directory = PARENT_DIR }: { children?: ReactNode; directory?: string }) {
  return <div><span className="text-link">{directory}</span> <span className="text-muted">❯</span> {children}</div>;
}

function GitStatus() {
  return <>
    <Prompt>git status</Prompt>
    <div>On branch new-right-click</div>
    <div>Your branch is up to date with 'origin/new-right-click'.</div>
    <br />
    <div>Changes not staged for commit:</div>
    <div className="text-muted">  (use "git add &lt;file&gt;..." to update what will be committed)</div>
    <div className="text-error">        modified:   lib/src/components/Wall.tsx</div>
    <div className="text-error">        modified:   docs/specs/layout.md</div>
    <br />
    <div>no changes added to commit (use "git add" and/or "git commit -a")</div>
  </>;
}

function Cursor() {
  return <span aria-hidden className="inline-block h-4 w-2 translate-y-0.5 bg-terminal-fg" />;
}

function TerminalOutput({ scenario }: { scenario: Scenario }) {
  if (scenario === 'editor') return <div className="flex h-full flex-col">
    <div className="flex justify-between bg-header-inactive-bg px-2 text-header-inactive-fg"><span>GNU nano 8.3</span><span>notes.md</span><span>Modified</span></div>
    <div className="pt-3"># Context menu ideas</div>
    <br />
    <div>Keep the helper big enough for actual work.</div>
    <div>Make the directory mismatch impossible to miss.<Cursor /></div>
    <div className="mt-auto grid grid-cols-4 gap-x-5 pt-4 text-muted">
      <span>^G Help</span><span>^O Write Out</span><span>^W Where Is</span><span>^K Cut</span>
      <span>^X Exit</span><span>^R Read File</span><span>^\ Replace</span><span>^U Paste</span>
    </div>
  </div>;
  if (scenario === 'running') return <>
    <Prompt>git status</Prompt>
    <div className="text-muted">Refreshing index:  68% (816/1200)</div>
  </>;
  if (scenario === 'autorunOff') return <Prompt><Cursor /></Prompt>;
  if (scenario === 'differentDirectory') return <>
    <Prompt>cd ../dormouse-fix</Prompt>
    <Prompt directory={HELPER_DIR}>git log -3 --oneline</Prompt>
    <div><span className="text-link">a8d21f0</span> Fix pane focus after splitting</div>
    <div><span className="text-link">56b302e</span> Keep terminal titles stable</div>
    <div><span className="text-link">3c119a4</span> Update layout spec</div>
    <br />
    <Prompt directory={HELPER_DIR}><Cursor /></Prompt>
  </>;
  return <>
    <GitStatus />
    <br />
    {scenario === 'preserved' && <>
      <Prompt>cat .node-version</Prompt>
      <div>24.18.0</div>
      <Prompt>echo "check focus after split"</Prompt>
      <div>check focus after split</div>
      <br />
    </>}
    <Prompt>{scenario === 'preserved' && 'git diff --'}<Cursor /></Prompt>
  </>;
}

function ContextPrototype({ scenario, initialDetail = null, paneWidth }: { scenario: Scenario; initialDetail?: 'title' | 'modify' | 'reset' | null; paneWidth: number }) {
  const [detail, setDetail] = useState(initialDetail);
  const [port, setPort] = useState('5173');
  const [watching, setWatching] = useState(false);
  const [todo, setTodo] = useState(scenario === 'notification');
  const preserved = ['preserved', 'editor', 'differentDirectory'].includes(scenario);
  const mismatch = scenario === 'differentDirectory';
  const notification = scenario === 'notification';
  return <div className="relative h-[680px] overflow-hidden rounded-lg bg-terminal-bg font-mono text-sm text-terminal-fg" style={{ width: paneWidth }}>
    <div className="flex items-center gap-2 bg-header-active-bg px-2.5 text-header-active-fg" style={{ height: PANE_HEADER_HEIGHT_PX }}>
      <span>pnpm dev</span><BellIcon size={13} /><span className="ml-auto flex items-center gap-3"><FrameCornersIcon size={13} /><XIcon size={13} /></span>
    </div>
    <pre className="m-0 p-3 leading-6 text-muted">{'~/projects/dormouse ❯ pnpm dev\n\n  VITE v8.0.14  ready in 182 ms\n\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose\n\n12:04:31 [vite] (client) hmr update /src/App.tsx'}</pre>
    <section aria-label="Terminal context" className={`${POPUP_SURFACE_CLASS} absolute bottom-8 left-0 right-8 flex flex-col overflow-hidden`} style={{ top: PANE_HEADER_HEIGHT_PX }}>
      <div className="shrink-0 px-3 py-2">
        <div className="grid grid-cols-[4rem_1fr] items-center gap-y-1">
          <span className="text-muted">Title</span>
          <div className="flex h-6 min-w-0 items-center gap-1.5">
            <span className="truncate">pnpm dev</span>
            <Action label="Explain this title" onClick={() => setDetail(detail === 'title' ? null : 'title')}><BugBeetleIcon size={15} />Explain</Action>
            <div className="ml-auto flex shrink-0 items-center gap-2 text-muted">
              <Action label="Copy surface identifier"><span className="text-muted">surface:3</span><CopyIcon size={12} /></Action>
              <Action label="Close terminal context" muted><XIcon size={15} /></Action>
            </div>
          </div>
          <span className="text-muted">Dir</span>
          <div className="flex h-6 items-center gap-1.5"><span title="/Users/ntwigg/projects/dormouse">{PARENT_DIR}</span><Action label="Open directory in Finder"><ArrowSquareOutIcon size={15} />Open in Finder</Action><Action label="Copy absolute path: /Users/ntwigg/projects/dormouse"><CopyIcon size={14} />Copy path</Action></div>
          <span className="text-muted">Ports</span>
          <div className="flex min-h-7 flex-wrap items-center gap-2">
            {scenario === 'noPorts' ? <span className="text-muted">No listening ports</span>
              : scenario === 'scanFailed' ? <span className="flex items-center gap-1.5 text-error"><WarningIcon size={14} />Port scan failed <span className="text-muted">· Reopen to try again</span></span>
              : <>
                {scenario === 'multiplePorts' ? <div className="inline-flex shrink-0 items-center gap-2"><select aria-label="Port" value={port} onChange={event => setPort(event.target.value)} className="h-6 w-52 rounded border border-input-border bg-input-bg px-1 text-foreground">
                  <option value="5173">localhost:5173 · vite</option><option value="6006">localhost:6006 · storybook</option><option value="9229">localhost:9229 · node inspector</option>
                </select><span className="text-muted">3 ports</span></div> : <><span>localhost:5173</span><span className="text-muted">vite</span></>}
                <div className="ml-1 inline-flex shrink-0 items-center gap-1 border-l border-border pl-2">
                  <Action label="Open in system browser"><ArrowSquareOutIcon size={15} />System browser</Action>
                  <Action label="Open in iframe embed"><FrameCornersIcon size={15} />Iframe</Action>
                  <Action label="Open in agent-browser screencast"><AgentRobotIcon size={17} />Agent browser</Action>
                  <Action label="Open in agent-browser popout"><AgentRobotIcon size={17} /><ArrowSquareOutIcon size={13} />Popout</Action>
                </div>
              </>}
          </div>
          <span className="text-muted">Alerts</span>
          <div className="flex h-6 items-center gap-2">
            <span>{notification ? 'Tests complete' : 'Watch all pnpm commands'}</span>
            {!notification && <OnOffSwitch on={watching} onEnable={() => setWatching(true)} onDisable={() => setWatching(false)} label="Watch all pnpm commands" />}
            <span className="mx-1 h-3 border-l border-border" />
            <span>TODO</span><OnOffSwitch on={todo} onEnable={() => setTodo(true)} onDisable={() => setTodo(false)} label="TODO" />
          </div>
        </div>
        {notification && <div className="ml-16 mt-2 border-l-2 border-border py-1 pl-3">
          <div>341 passed, 0 failed</div><div className="mt-1 text-muted">pnpm test · OSC 777 · 12:04:38</div>
        </div>}
      </div>

      <div className="@container flex min-h-0 flex-1 flex-col border-t border-border">
        {/* The name yields before status/actions; use helper width, not viewport width. */}
        <div aria-label="Helper terminal status" className="flex h-9 shrink-0 items-center gap-3 whitespace-nowrap px-3">
          <span className="hidden shrink-0 items-center gap-2 font-semibold @[48rem]:flex"><TerminalIcon size={15} />Helper terminal</span>
          <div className="flex min-w-0 items-center gap-2 text-muted">
          {preserved ? <><PauseIcon size={13} className="shrink-0" /><span className="truncate">Autorun paused to preserve your session</span><button type="button" onClick={() => setDetail('reset')} className={`inline-flex shrink-0 items-center gap-1 hover:underline ${ACTION_COLOR_CLASS}`}><ArrowCounterClockwiseIcon size={12} />Reset…</button></>
            : <>
              {scenario === 'running' ? <CircleNotchIcon size={13} className="shrink-0" /> : scenario === 'autorunOff' ? <PauseIcon size={13} className="shrink-0" /> : <CheckIcon size={13} className="shrink-0" />}
              <span className="truncate">{scenario === 'autorunOff' ? 'Autorun off' : scenario === 'running' ? <>Running <span className="text-foreground">git status</span> automatically</> : <>Automatically ran <span className="text-foreground">git status</span></>}</span>
              <Action label="Modify autorun command" onClick={() => setDetail('modify')}><SlidersHorizontalIcon size={15} />Modify</Action>
            </>}
          </div>
          <div className="ml-auto shrink-0"><Action label="Move this terminal into a new pane"><ArrowLineUpIcon size={15} />Promote</Action></div>
        </div>
        {mismatch && <div role="alert" className="mx-3 mb-2 flex shrink-0 items-start gap-2 border-l-4 border-error bg-error/10 px-3 py-2">
          <WarningIcon size={18} weight="fill" className="mt-0.5 shrink-0 text-error" />
          <div><div className="font-semibold">Helper directory differs from parent</div><div className="mt-1 grid grid-cols-[4rem_1fr] gap-x-2"><span className="text-muted">Helper</span><span className="font-semibold">{HELPER_DIR}</span><span className="text-muted">Parent</span><span>{PARENT_DIR}</span></div></div>
        </div>}
        <div aria-label="Helper terminal output (static preview)" className="min-h-0 flex-1 overflow-auto bg-terminal-bg px-3 py-2 text-terminal-fg" style={{ fontSize: 13, lineHeight: '20px', whiteSpace: 'pre-wrap' }}><TerminalOutput scenario={scenario} /></div>
      </div>

      {detail && <div className="absolute inset-0 z-10 bg-app-bg/35" onClick={() => setDetail(null)}>
        <div role="dialog" aria-label={detail === 'title' ? 'Title sources' : detail === 'modify' ? 'Default helper autorun command' : 'Reset helper terminal'} className={`${POPUP_SURFACE_CLASS} absolute left-3 right-3 ${detail === 'title' ? 'top-9' : 'top-40'} p-4`} onClick={event => event.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between font-semibold"><span>{detail === 'title' ? 'Why this title?' : detail === 'modify' ? 'Default helper autorun command' : 'Reset helper terminal?'}</span><Action label="Close details" muted onClick={() => setDetail(null)}><XIcon size={14} /></Action></div>
          {detail === 'title' ? <>
            <div className="mb-3 text-muted">Current title: <span className="text-foreground">pnpm dev</span></div>
            <div className="grid grid-cols-[8rem_1fr_7rem] gap-x-3 gap-y-2">
              <span className="text-muted">User override</span><span className="text-muted">Not set</span><span />
              <span>OSC 2</span><span className="font-semibold">pnpm dev</span><span className="flex items-center gap-1 text-link"><CheckIcon size={12} />Used</span>
              <span className="text-muted">OSC 0</span><span>zsh</span><span className="text-muted">Ignored</span>
              <span className="text-muted">Command</span><span>pnpm dev</span><span className="text-muted">Fallback</span>
              <span className="text-muted">OSC 777</span><span>Tests complete</span><span className="text-muted">Diagnostic</span>
            </div>
            <div className="mt-4 text-muted">OSC 2 is the latest eligible title from the running command.</div>
          </> : detail === 'modify' ? <>
            <input aria-label="Default helper autorun command" defaultValue={scenario === 'autorunOff' ? '' : 'git status'} placeholder="Leave empty to turn autorun off" className="w-full border-b border-input-border bg-input-bg px-2 py-1.5 outline-focus-ring" />
            <p className="mb-4 mt-2 text-muted">Global default. Applies to new and reset helpers. Leave empty to turn autorun off.</p>
            <div className="flex justify-end gap-2"><Action label="Cancel" onClick={() => setDetail(null)}>Cancel</Action><Action label="Save default (prototype only)" onClick={() => setDetail(null)}>Save default</Action></div>
          </> : <>
            <p>Discard this helper session and rerun <strong>git status</strong> in <strong>{PARENT_DIR}</strong>?</p>
            <p className="mb-4 mt-2 text-muted">{scenario === 'editor' ? 'nano is still running. Unsaved edits will be lost.' : 'Its scrollback and any unfinished input will be lost.'}</p>
            <div className="flex justify-end gap-2"><Action label="Keep helper" onClick={() => setDetail(null)}>Keep helper</Action><button type="button" onClick={() => setDetail(null)} className="rounded bg-error px-2 py-1 text-terminal-bg">Discard and reset</button></div>
          </>}
        </div>
      </div>}
    </section>
  </div>;
}

function TerminalContextStory({ initialScenario = 'fresh', initialDetail = null, paneWidth = 900 }: { initialScenario?: Scenario; initialDetail?: 'title' | 'modify' | 'reset' | null; paneWidth?: number }) {
  const [scenario, setScenario] = useState(initialScenario);
  return <main className="min-h-screen bg-app-bg p-5 font-mono text-sm text-foreground">
    <div className="mb-3 w-[900px]">
      <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Terminal context / layout prototype</span><span className="text-muted">Static terminal · actions are previews</span></div>
      <div className="flex flex-wrap gap-1" aria-label="Preview states">
        {SCENARIOS.map(item => <button key={item.id} type="button" aria-pressed={scenario === item.id} onClick={() => setScenario(item.id)} className={`rounded px-2 py-1 ${scenario === item.id ? 'bg-header-active-bg text-header-active-fg' : 'text-muted hover:bg-foreground/10'}`}>{item.label}</button>)}
      </div>
    </div>
    <ContextPrototype key={scenario} scenario={scenario} initialDetail={initialDetail} paneWidth={paneWidth} />
  </main>;
}

const meta = {
  title: 'Prototypes/Terminal context',
  component: TerminalContextStory,
  parameters: { layout: 'fullscreen' },
  args: { initialScenario: 'fresh' },
} satisfies Meta<typeof TerminalContextStory>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CommonCase: Story = {};
export const NarrowHelperHeader: Story = { args: { initialScenario: 'preserved', paneWidth: 660 } };
export const NoPorts: Story = { args: { initialScenario: 'noPorts' } };
export const AutorunRunning: Story = { args: { initialScenario: 'running' } };
export const PreservedSession: Story = { args: { initialScenario: 'preserved' } };
export const EditorOpen: Story = { args: { initialScenario: 'editor' } };
export const DifferentDirectory: Story = { args: { initialScenario: 'differentDirectory' } };
export const MultiplePorts: Story = { args: { initialScenario: 'multiplePorts' } };
export const Notification: Story = { args: { initialScenario: 'notification' } };
export const AutorunOff: Story = { args: { initialScenario: 'autorunOff' } };
export const PortScanFailed: Story = { args: { initialScenario: 'scanFailed' } };
export const TitleSources: Story = { args: { initialDetail: 'title' } };
export const ModifyAutorun: Story = { args: { initialDetail: 'modify' } };
export const ResetConfirmation: Story = { args: { initialScenario: 'editor', initialDetail: 'reset' } };
