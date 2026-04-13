import { useState, useCallback, useRef, useEffect } from "react";
import type { OpenVSXExtension } from "mouseterm-lib/lib/themes";
import {
  searchThemes,
  fetchExtensionThemes,
  addInstalledTheme,
  removeInstalledTheme,
  getInstalledThemes,
  applyTheme,
  setActiveThemeId,
} from "mouseterm-lib/lib/themes";

interface ThemeStoreProps {
  open: boolean;
  onClose: () => void;
  /** Called after themes change so the picker can refresh */
  onThemesChanged: () => void;
}

export function ThemeStore({ open, onClose, onThemesChanged }: ThemeStoreProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenVSXExtension[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Manage dialog open/close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchThemes(q, 0, 20);
      setResults(res.extensions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  };

  const handleInstall = async (ext: OpenVSXExtension) => {
    const key = `${ext.namespace}/${ext.name}`;
    setInstalling(key);
    setError(null);
    try {
      const themes = await fetchExtensionThemes(ext.namespace, ext.name);
      for (const theme of themes) {
        addInstalledTheme(theme);
      }
      // Apply the first variant
      if (themes[0]) {
        applyTheme(themes[0]);
        setActiveThemeId(themes[0].id);
      }
      onThemesChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Install failed");
    } finally {
      setInstalling(null);
    }
  };

  const handleRemove = (extensionId: string) => {
    const installed = getInstalledThemes();
    for (const theme of installed) {
      if (theme.origin.kind === "installed" && theme.origin.extensionId === extensionId) {
        removeInstalledTheme(theme.id);
      }
    }
    onThemesChanged();
  };

  const isInstalled = (ext: OpenVSXExtension) => {
    const key = `${ext.namespace}/${ext.name}`;
    return getInstalledThemes().some(
      (t) => t.origin.kind === "installed" && t.origin.extensionId === key,
    );
  };

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 z-50 m-auto h-[420px] w-[380px] rounded-lg border border-white/10 bg-[#1e1e1e] p-0 text-[#cccccc] shadow-2xl backdrop:bg-black/50"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-sm font-medium">Install Theme from OpenVSX</span>
          <button
            onClick={onClose}
            className="text-[#858585] transition-colors hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Search themes..."
            autoFocus
            className="w-full rounded border border-white/10 bg-[#3c3c3c] px-3 py-1.5 text-xs text-[#cccccc] outline-none placeholder:text-[#858585] focus:border-[#007fd4]"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-4 pb-3">
          {error && (
            <div className="rounded bg-red-900/30 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          {loading && (
            <div className="py-8 text-center text-xs text-[#858585]">Searching...</div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="py-8 text-center text-xs text-[#858585]">No themes found</div>
          )}
          {!loading && !query.trim() && (
            <div className="py-8 text-center text-xs text-[#858585]">
              Search for a VSCode theme to install
            </div>
          )}
          {results.map((ext) => {
            const key = `${ext.namespace}/${ext.name}`;
            const installed = isInstalled(ext);
            const isInstallingThis = installing === key;
            return (
              <div
                key={key}
                className="flex items-center gap-3 rounded px-2 py-2 transition-colors hover:bg-white/5"
              >
                {/* Icon */}
                {ext.files?.icon ? (
                  <img src={ext.files.icon} alt="" className="h-8 w-8 shrink-0 rounded" />
                ) : (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-white/10 text-xs text-[#858585]">
                    🎨
                  </div>
                )}

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">
                    {ext.displayName || ext.name}
                  </div>
                  <div className="truncate text-[10px] text-[#858585]">
                    {ext.namespace} · {ext.downloadCount.toLocaleString()} downloads
                  </div>
                </div>

                {/* Action */}
                {installed ? (
                  <button
                    onClick={() => handleRemove(key)}
                    className="shrink-0 rounded px-2 py-1 text-[10px] text-[#858585] transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    onClick={() => handleInstall(ext)}
                    disabled={isInstallingThis}
                    className="shrink-0 rounded bg-[#0e639c] px-2 py-1 text-[10px] text-white transition-colors hover:bg-[#1177bb] disabled:opacity-50"
                  >
                    {isInstallingThis ? "Installing..." : "Install"}
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
