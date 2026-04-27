import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import type { MouseTermTheme, OpenVSXExtension } from '../lib/themes';
import {
  addInstalledTheme,
  applyTheme,
  fetchExtensionThemes,
  getAllThemes,
  getInstalledThemes,
  getTheme,
  removeInstalledTheme,
  restoreActiveTheme,
  searchThemes,
  setActiveThemeId,
} from '../lib/themes';
import { ThemeDebuggerDialog } from './ThemeDebugger';

export type ThemePickerVariant = 'playground-header' | 'standalone-appbar';

export interface ThemePickerProps {
  variant: ThemePickerVariant;
  className?: string;
}

const styles = {
  muted: { color: 'var(--vscode-descriptionForeground, #858585)' },
  foreground: { color: 'var(--vscode-editor-foreground, #cccccc)' },
  trigger: (open: boolean) => ({
    backgroundColor: 'var(--vscode-input-background, #3c3c3c)',
    borderColor: open ? 'var(--vscode-focusBorder, #007fd4)' : 'var(--vscode-input-border, #3c3c3c)',
    color: 'var(--vscode-editor-foreground, #cccccc)',
  }),
  panel: {
    backgroundColor: 'var(--vscode-editorWidget-background, #252526)',
    borderColor: 'var(--vscode-panel-border, #2b2b2b)',
    color: 'var(--vscode-editor-foreground, #cccccc)',
    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
  },
  border: { borderColor: 'var(--vscode-panel-border, #2b2b2b)' },
  activeRow: {
    backgroundColor: 'var(--vscode-list-activeSelectionBackground, #094771)',
    color: 'var(--vscode-list-activeSelectionForeground, #ffffff)',
  },
  link: { color: 'var(--vscode-textLink-foreground, var(--vscode-focusBorder, #3794ff))' },
  error: { color: 'var(--vscode-errorForeground, #f48771)' },
  button: {
    backgroundColor: 'var(--vscode-button-background, #0e639c)',
    color: 'var(--vscode-button-foreground, #ffffff)',
  },
};


function ThemeSwatch({ theme, size }: { theme: MouseTermTheme; size: 'sm' | 'md' }) {
  const swatchClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span className={`relative flex shrink-0 items-center justify-center ${swatchClass}`}>
      <span
        className={`block rounded-full border ${swatchClass}`}
        style={{ ...styles.border, backgroundColor: theme.swatch }}
      />
      <span
        className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: theme.accent }}
      />
    </span>
  );
}

function useCloseOnOutsideAndEscape(open: boolean, ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('pointerdown', closeOnPointerDown, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open, ref, onClose]);
}

function ThemeStoreDialog({
  open,
  onClose,
  onThemesChanged,
}: {
  open: boolean;
  onClose: () => void;
  onThemesChanged: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<OpenVSXExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const doSearch = useCallback(async (value: string) => {
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await searchThemes(value, 0, 20);
      setResults(response.extensions);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleInstall = async (extension: OpenVSXExtension) => {
    const key = `${extension.namespace}/${extension.name}`;
    setInstalling(key);
    setError(null);
    try {
      const themes = await fetchExtensionThemes(extension.namespace, extension.name);
      for (const theme of themes) addInstalledTheme(theme);
      if (themes[0]) {
        setActiveThemeId(themes[0].id);
        applyTheme(themes[0]);
      }
      onThemesChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Install failed');
    } finally {
      setInstalling(null);
    }
  };

  const handleRemoveExtension = (extensionId: string) => {
    const confirmed = window.confirm(`Remove installed themes from ${extensionId}?`);
    if (!confirmed) return;

    for (const theme of getInstalledThemes()) {
      if (theme.origin.kind === 'installed' && theme.origin.extensionId === extensionId) {
        removeInstalledTheme(theme.id);
      }
    }
    restoreActiveTheme();
    onThemesChanged();
  };

  const isInstalled = (extension: OpenVSXExtension) => {
    const key = `${extension.namespace}/${extension.name}`;
    return getInstalledThemes().some(
      (theme) => theme.origin.kind === 'installed' && theme.origin.extensionId === key,
    );
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 z-50 m-auto h-[420px] w-[min(380px,calc(100vw-2rem))] rounded border p-0 font-mono shadow-2xl backdrop:bg-black/50"
      style={styles.panel}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b px-4 py-3" style={styles.border}>
          <span className="text-sm font-medium">Install theme from OpenVSX</span>
          <button
            type="button"
            onClick={onClose}
            className="text-sm transition-opacity hover:opacity-100"
            style={styles.muted}
            aria-label="Close theme store"
          >
            X
          </button>
        </div>

        <div className="px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(event) => handleInput(event.target.value)}
            placeholder="Search themes..."
            autoFocus
            className="w-full rounded border px-3 py-1.5 text-sm outline-none placeholder:opacity-65"
            style={styles.trigger(false)}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {error ? (
            <div className="rounded px-3 py-2 text-sm" style={styles.error}>
              {error}
            </div>
          ) : null}
          {loading ? <div className="py-8 text-center text-sm" style={styles.muted}>Searching...</div> : null}
          {!loading && results.length === 0 && query.trim() ? (
            <div className="py-8 text-center text-sm" style={styles.muted}>No themes found</div>
          ) : null}
          {!loading && !query.trim() ? (
            <div className="py-8 text-center text-sm" style={styles.muted}>
              Search for a VS Code theme to install
            </div>
          ) : null}
          {results.map((extension) => {
            const key = `${extension.namespace}/${extension.name}`;
            const installed = isInstalled(extension);
            const isInstallingThis = installing === key;
            return (
              <div key={key} className="flex items-center gap-3 rounded px-2 py-2 transition-colors hover:opacity-85">
                {extension.files?.icon ? (
                  <img src={extension.files.icon} alt="" className="h-8 w-8 shrink-0 rounded" />
                ) : (
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-sm"
                    style={{ ...styles.trigger(false), ...styles.muted }}
                  >
                    VS
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{extension.displayName || extension.name}</div>
                  <div className="truncate text-sm" style={styles.muted}>
                    {extension.namespace} - {extension.downloadCount.toLocaleString()} downloads
                  </div>
                </div>
                {installed ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveExtension(key)}
                    className="shrink-0 rounded px-2 py-1 text-sm transition-opacity hover:opacity-100"
                    style={styles.muted}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleInstall(extension)}
                    disabled={isInstallingThis}
                    className="shrink-0 rounded px-2 py-1 text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={styles.button}
                  >
                    {isInstallingThis ? 'Installing...' : 'Install'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}

export function ThemePicker({ variant, className = '' }: ThemePickerProps) {
  const labelId = useId();
  const currentId = useId();
  // Apply the persisted theme during render initialization, before commit, so
  // the first paint already has --vscode-* on body — eliminates the flash of
  // unstyled chrome on the website playground where ThemePicker mounts before
  // any other entry point has a chance to apply a theme.
  const [themes, setThemes] = useState(() => {
    restoreActiveTheme();
    return getAllThemes();
  });
  const [activeId, setActiveId] = useState(() => restoreActiveTheme()?.id ?? getAllThemes()[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [debuggerOpen, setDebuggerOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const isPlayground = variant === 'playground-header';
  const activeTheme = themes.find((theme) => theme.id === activeId) ?? themes[0];

  const closeDropdown = useCallback(() => setOpen(false), []);
  useCloseOnOutsideAndEscape(open, rootRef, closeDropdown);

  const refreshThemes = useCallback(() => {
    setThemes(getAllThemes());
    const theme = restoreActiveTheme();
    if (theme) setActiveId(theme.id);
  }, []);

  const selectTheme = (id: string) => {
    const theme = getTheme(id);
    if (!theme) return;
    setActiveThemeId(id);
    setActiveId(id);
    applyTheme(theme);
    setOpen(false);
  };

  const deleteTheme = (theme: MouseTermTheme) => {
    if (theme.origin.kind !== 'installed') return;
    const confirmed = window.confirm(`Delete "${theme.label}"?`);
    if (!confirmed) return;

    removeInstalledTheme(theme.id);
    setThemes(getAllThemes());

    if (theme.id === activeId) {
      const fallback = restoreActiveTheme();
      if (fallback) setActiveId(fallback.id);
    }
  };

  const rootClass = isPlayground
    ? 'relative flex min-w-0 items-center gap-1.5 text-sm'
    : 'relative flex items-center';
  const triggerClass = isPlayground
    ? 'flex h-8 w-[116px] min-w-0 items-center gap-2 rounded border px-2 text-left text-sm transition-colors sm:w-40 md:w-56'
    : 'flex h-6 max-w-[190px] items-center gap-1.5 rounded border border-transparent px-2 text-sm transition-colors hover:opacity-85';
  const menuClass = isPlayground
    ? 'fixed top-16 right-4 left-4 z-50 overflow-hidden rounded border font-mono shadow-2xl md:absolute md:top-full md:right-0 md:left-auto md:mt-2 md:w-[22rem]'
    : 'absolute right-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded border font-mono shadow-2xl';
  const rowButtonClass = isPlayground
    ? 'flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm'
    : 'flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-sm';
  const swatchSize = isPlayground ? 'md' : 'sm';

  return (
    <div ref={rootRef} className={`${rootClass} ${className}`}>
      {isPlayground ? (
        <span id={labelId} className="shrink-0 text-sm font-medium" style={styles.muted}>
          Theme:
        </span>
      ) : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-labelledby={isPlayground ? `${labelId} ${currentId}` : undefined}
        aria-label={!isPlayground ? `Theme: ${activeTheme?.label ?? 'Select theme'}` : undefined}
        onClick={() => setOpen((value) => !value)}
        className={triggerClass}
        style={styles.trigger(open)}
      >
        {activeTheme ? <ThemeSwatch theme={activeTheme} size={swatchSize} /> : null}
        {!isPlayground ? <span className="hidden text-sm sm:inline">Theme:</span> : null}
        <span id={currentId} className={`min-w-0 truncate ${isPlayground ? 'flex-1' : 'font-mono text-sm'}`}>
          {activeTheme?.label ?? 'Select theme'}
        </span>
        <CaretDownIcon size={10} weight="bold" className="shrink-0 opacity-65" aria-hidden="true" />
      </button>

      {open ? (
        <div role="menu" aria-labelledby={isPlayground ? labelId : undefined} className={menuClass} style={styles.panel}>
          <div className="overflow-y-auto py-1" style={{ maxHeight: isPlayground ? 'min(24rem, calc(100vh - 9rem))' : 320 }}>
            {themes.map((theme) => {
              const isActive = theme.id === activeId;
              const isInstalled = theme.origin.kind === 'installed';
              return (
                <div
                  key={theme.id}
                  className="flex items-center transition-colors"
                  style={isActive ? styles.activeRow : styles.foreground}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => selectTheme(theme.id)}
                    className={rowButtonClass}
                    style={{ color: 'inherit' }}
                  >
                    <ThemeSwatch theme={theme} size={swatchSize} />
                    <span className="min-w-0 flex-1 truncate">{theme.label}</span>
                  </button>
                  {isInstalled ? (
                    <button
                      type="button"
                      aria-label={`Delete ${theme.label}`}
                      title={`Delete ${theme.label}`}
                      className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-sm opacity-60 transition-opacity hover:opacity-100 focus:opacity-100"
                      style={{ color: 'inherit' }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        deleteTheme(theme);
                      }}
                    >
                      X
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="border-t p-1" style={styles.border}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setDebuggerOpen(true);
              }}
              className={`w-full rounded text-left text-sm font-medium transition-opacity hover:opacity-85 ${
                isPlayground ? 'px-3 py-2' : 'px-3 py-1.5'
              }`}
              style={styles.foreground}
            >
              Debug current theme
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStoreOpen(true);
              }}
              className={`w-full rounded text-left text-sm font-medium transition-opacity hover:opacity-85 ${
                isPlayground ? 'px-3 py-2' : 'px-3 py-1.5'
              }`}
              style={styles.link}
            >
              Install theme from OpenVSX
            </button>
          </div>
        </div>
      ) : null}

      <ThemeStoreDialog open={storeOpen} onClose={() => setStoreOpen(false)} onThemesChanged={refreshThemes} />
      <ThemeDebuggerDialog open={debuggerOpen} onClose={() => setDebuggerOpen(false)} />
    </div>
  );
}
