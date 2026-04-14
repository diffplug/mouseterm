import { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CaretDownIcon, MinusIcon, CornersOutIcon, CornersInIcon, XIcon, TerminalWindowIcon, PlusIcon } from '@phosphor-icons/react';

export interface ShellEntry {
  name: string;
  path: string;
  args?: string[];
}

interface AppBarProps {
  projectDir: string;
  homeDir: string;
  shells: ShellEntry[];
}

const IS_MAC = typeof (navigator as any).userAgentData?.platform === 'string'
  ? (navigator as any).userAgentData.platform === 'macOS'
  : /Mac/.test(navigator.platform);
const appWindow = getCurrentWindow();

function abbreviateHome(dir: string, home: string): string {
  if (dir === home) return '~';
  if (dir.startsWith(home + '/')) return '~' + dir.slice(home.length);
  if (dir.startsWith(home + '\\')) return '~' + dir.slice(home.length);
  return dir;
}

// ── Tooltip wrapper ────────────────────────────────────────────────────────

function Tip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="group relative flex items-stretch">
      {children}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-surface-raised px-2 py-1 text-[10px] text-foreground opacity-0 shadow-md border border-border transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </div>
  );
}

// ── Windows/Linux window buttons ───────────────────────────────────────────

function WinControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    appWindow.isMaximized().then(setMaximized);
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  return (
    <div className="flex items-stretch self-stretch">
      <Tip label="Minimize">
        <button
          className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          onClick={() => appWindow.minimize()}
          aria-label="Minimize"
        >
          <MinusIcon size={12} weight="bold" />
        </button>
      </Tip>
      <Tip label={maximized ? 'Restore' : 'Maximize'}>
        <button
          className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          onClick={() => { appWindow.toggleMaximize(); }}
          aria-label={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized
            ? <CornersInIcon size={12} weight="bold" />
            : <CornersOutIcon size={12} weight="bold" />}
        </button>
      </Tip>
      <Tip label="Close">
        <button
          className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-error/90 hover:text-white"
          onClick={() => appWindow.close()}
          aria-label="Close"
        >
          <XIcon size={12} weight="bold" />
        </button>
      </Tip>
    </div>
  );
}

// ── Shell dropdown ─────────────────────────────────────────────────────────

function ShellDropdown({ shells }: { shells: ShellEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const defaultShell = shells[0];

  const handleSelect = useCallback((shell: ShellEntry) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('mouseterm:new-terminal', { detail: { shell: shell.path, args: shell.args } }));
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative flex items-center">
      {/* Primary action: click to open a new terminal with the default shell */}
      <Tip label="New terminal">
        <button
          className="flex h-6 items-center gap-1.5 rounded-l px-2 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          onClick={() => defaultShell && handleSelect(defaultShell)}
          aria-label={`New ${defaultShell?.name ?? 'terminal'}`}
        >
          <PlusIcon size={12} weight="bold" />
          <span className="font-mono text-[11px]">{defaultShell?.name ?? 'shell'}</span>
        </button>
      </Tip>
      {/* Dropdown caret: pick a different shell type */}
      <Tip label="Choose shell">
        <button
          className="flex h-6 items-center rounded-r px-1 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <CaretDownIcon size={10} weight="bold" />
        </button>
      </Tip>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-border bg-surface-raised py-1 shadow-md" role="menu">
          {shells.map((shell) => (
            <button
              key={shell.path}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-surface-alt"
              onClick={() => handleSelect(shell)}
            >
              <TerminalWindowIcon size={14} />
              {shell.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AppBar ─────────────────────────────────────────────────────────────────

function projectName(dir: string): string {
  const sep = dir.includes('\\') ? '\\' : '/';
  const parts = dir.split(sep).filter(Boolean);
  return parts[parts.length - 1] ?? dir;
}

export function AppBar({ projectDir, homeDir, shells }: AppBarProps) {
  const displayDir = abbreviateHome(projectDir, homeDir);
  const name = projectName(projectDir);
  // Show just the directory name when it's the home dir (avoids bare "~")
  const isHome = projectDir === homeDir;

  return (
    <div
      data-tauri-drag-region
      className={`flex h-[30px] shrink-0 select-none items-center border-b border-border bg-surface-alt text-xs ${
        IS_MAC ? 'pl-[78px]' : ''
      }`}
    >
      {/* On macOS, native traffic lights are shown by titleBarStyle "Overlay" —
          we just leave padding on the left (pl-[78px]) to avoid overlapping them.
          On Windows/Linux, shell dropdown goes on the left. */}
      {!IS_MAC && (
        <div className="pl-2">
          <ShellDropdown shells={shells} />
        </div>
      )}

      {/* Project directory — centered */}
      <Tip label={displayDir}>
        <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-4">
          <span data-tauri-drag-region className="truncate font-medium text-foreground/70">
            {isHome ? '~' : name}
          </span>
          {!isHome && (
            <span data-tauri-drag-region className="hidden truncate text-muted sm:inline">
              {displayDir}
            </span>
          )}
        </div>
      </Tip>

      {/* Shell dropdown on the right (macOS) or window controls (Windows/Linux) */}
      {IS_MAC ? (
        <div className="pr-2">
          <ShellDropdown shells={shells} />
        </div>
      ) : (
        <WinControls />
      )}
    </div>
  );
}
