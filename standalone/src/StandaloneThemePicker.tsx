import { useCallback, useEffect, useRef, useState } from 'react';
import { CaretDownIcon } from '@phosphor-icons/react';
import type { MouseTermTheme, OpenVSXExtension } from 'mouseterm-lib/lib/themes';
import {
  addInstalledTheme,
  applyTheme,
  fetchExtensionThemes,
  getActiveThemeId,
  getAllThemes,
  getInstalledThemes,
  getTheme,
  removeInstalledTheme,
  searchThemes,
  setActiveThemeId,
} from 'mouseterm-lib/lib/themes';

function applyActiveThemeFallback(): MouseTermTheme | null {
  const allThemes = getAllThemes();
  const theme = getTheme(getActiveThemeId()) ?? allThemes[0];
  if (!theme) return null;
  setActiveThemeId(theme.id);
  applyTheme(theme);
  return theme;
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

  const handleQueryChange = (value: string) => {
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
    applyActiveThemeFallback();
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
      className="fixed inset-0 z-50 m-auto h-[420px] w-[380px] rounded border border-border bg-surface-raised p-0 text-foreground shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Install theme from OpenVSX</span>
          <button
            type="button"
            onClick={onClose}
            className="text-muted transition-colors hover:text-foreground"
            aria-label="Close theme store"
          >
            X
          </button>
        </div>

        <div className="px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="Search themes..."
            autoFocus
            className="w-full rounded border border-input-border bg-input-bg px-3 py-1.5 text-xs text-foreground outline-none placeholder:text-muted focus:border-accent"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {error ? (
            <div className="rounded bg-error/20 px-3 py-2 text-xs text-error">{error}</div>
          ) : null}
          {loading ? (
            <div className="py-8 text-center text-xs text-muted">Searching...</div>
          ) : null}
          {!loading && results.length === 0 && query.trim() ? (
            <div className="py-8 text-center text-xs text-muted">No themes found</div>
          ) : null}
          {!loading && !query.trim() ? (
            <div className="py-8 text-center text-xs text-muted">
              Search for a VS Code theme to install
            </div>
          ) : null}
          {results.map((extension) => {
            const key = `${extension.namespace}/${extension.name}`;
            const installed = isInstalled(extension);
            const isInstallingThis = installing === key;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded px-2 py-2 transition-colors hover:bg-surface-alt"
              >
                {extension.files?.icon ? (
                  <img src={extension.files.icon} alt="" className="h-8 w-8 shrink-0 rounded" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-surface-alt text-xs text-muted">
                    VS
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {extension.displayName || extension.name}
                  </div>
                  <div className="truncate text-[10px] text-muted">
                    {extension.namespace} - {extension.downloadCount.toLocaleString()} downloads
                  </div>
                </div>
                {installed ? (
                  <button
                    type="button"
                    onClick={() => handleRemoveExtension(key)}
                    className="shrink-0 rounded px-2 py-1 text-[10px] text-muted transition-colors hover:bg-surface hover:text-foreground"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleInstall(extension)}
                    disabled={isInstallingThis}
                    className="shrink-0 rounded bg-button-bg px-2 py-1 text-[10px] text-button-fg transition-colors hover:bg-button-hover-bg disabled:opacity-50"
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

export function StandaloneThemePicker() {
  const [themes, setThemes] = useState(getAllThemes);
  const [activeId, setActiveId] = useState(() => getAllThemes()[0]?.id ?? '');
  const [open, setOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const theme = applyActiveThemeFallback();
    if (theme) setActiveId(theme.id);
    setThemes(getAllThemes());
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', closeOnPointerDown, true);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown, true);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const refreshThemes = useCallback(() => {
    setThemes(getAllThemes());
    const theme = applyActiveThemeFallback();
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
      const fallback = applyActiveThemeFallback();
      if (fallback) setActiveId(fallback.id);
    }
  };

  const activeTheme = themes.find((theme) => theme.id === activeId) ?? themes[0];

  return (
    <div ref={ref} className="relative flex items-center">
      <button
        type="button"
        className="flex h-6 max-w-[190px] items-center gap-1.5 rounded px-2 text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${activeTheme?.label ?? 'Select theme'}`}
      >
        {activeTheme ? (
          <span className="relative h-3.5 w-3.5 shrink-0">
            <span
              className="block h-3.5 w-3.5 rounded-full border border-border"
              style={{ backgroundColor: activeTheme.swatch }}
            />
            <span
              className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: activeTheme.accent }}
            />
          </span>
        ) : null}
        <span className="hidden text-[11px] sm:inline">Theme:</span>
        <span className="min-w-0 truncate font-mono text-[11px]">
          {activeTheme?.label ?? 'theme'}
        </span>
        <CaretDownIcon size={10} weight="bold" className="shrink-0" />
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-[280px] overflow-hidden rounded border border-border bg-surface-raised py-1 shadow-md"
          role="menu"
        >
          <div className="max-h-[320px] overflow-y-auto">
            {themes.map((theme) => {
              const isActive = theme.id === activeId;
              const isInstalled = theme.origin.kind === 'installed';
              return (
                <div
                  key={theme.id}
                  className={`flex items-center ${
                    isActive ? 'bg-tab-selected-bg text-tab-selected-fg' : 'text-foreground'
                  }`}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left text-xs"
                    onClick={() => selectTheme(theme.id)}
                  >
                    <span className="relative h-3.5 w-3.5 shrink-0">
                      <span
                        className="block h-3.5 w-3.5 rounded-full border border-border"
                        style={{ backgroundColor: theme.swatch }}
                      />
                      <span
                        className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: theme.accent }}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{theme.label}</span>
                  </button>
                  {isInstalled ? (
                    <button
                      type="button"
                      className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] opacity-60 transition-opacity hover:opacity-100"
                      aria-label={`Delete ${theme.label}`}
                      onClick={(event) => {
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
          <div className="border-t border-border p-1">
            <button
              type="button"
              className="w-full rounded px-3 py-1.5 text-left text-xs text-accent transition-colors hover:bg-surface-alt"
              onClick={() => {
                setOpen(false);
                setStoreOpen(true);
              }}
            >
              Install theme from OpenVSX
            </button>
          </div>
        </div>
      ) : null}

      <ThemeStoreDialog open={storeOpen} onClose={() => setStoreOpen(false)} onThemesChanged={refreshThemes} />
    </div>
  );
}
