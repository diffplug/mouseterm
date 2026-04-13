import { useState, useEffect, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CaretDownIcon, MinusIcon, CornersOutIcon, CornersInIcon, XIcon, TerminalWindowIcon, PlusIcon } from '@phosphor-icons/react';

export interface ShellEntry {
  name: string;
  path: string;
}

interface AppBarProps {
  projectDir: string;
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
      <button
        className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        onClick={() => appWindow.minimize()}
        aria-label="Minimize"
      >
        <MinusIcon size={12} weight="bold" />
      </button>
      <button
        className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        onClick={() => { appWindow.toggleMaximize(); }}
        aria-label={maximized ? 'Restore' : 'Maximize'}
      >
        {maximized
          ? <CornersInIcon size={12} weight="bold" />
          : <CornersOutIcon size={12} weight="bold" />}
      </button>
      <button
        className="flex w-11 items-center justify-center text-muted transition-colors hover:bg-error/90 hover:text-white"
        onClick={() => appWindow.close()}
        aria-label="Close"
      >
        <XIcon size={12} weight="bold" />
      </button>
    </div>
  );
}

// ── Shell dropdown ─────────────────────────────────────────────────────────

function ShellDropdown({ shells }: { shells: ShellEntry[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleSelect = useCallback((shell: ShellEntry) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent('mouseterm:new-terminal', { detail: { shell: shell.path } }));
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
    <div ref={ref} className="relative">
      <button
        className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <PlusIcon size={12} weight="bold" />
        <CaretDownIcon size={10} weight="bold" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-border bg-surface-raised py-1 shadow-lg">
          {shells.map((shell) => (
            <button
              key={shell.path}
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

export function AppBar({ projectDir, shells }: AppBarProps) {
  const homeDir = projectDir;
  const displayDir = abbreviateHome(projectDir, homeDir);

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

      {/* Project directory — centered fill */}
      <div data-tauri-drag-region className="flex min-w-0 flex-1 items-center justify-center">
        <span data-tauri-drag-region className="truncate px-4 text-muted">
          {displayDir}
        </span>
      </div>

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
