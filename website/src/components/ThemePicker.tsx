import { useState, useEffect, useCallback, useRef } from "react";
import {
  getAllThemes,
  getActiveThemeId,
  setActiveThemeId,
  getTheme,
  applyTheme,
  removeInstalledTheme,
} from "mouseterm-lib/lib/themes";
import type { MouseTermTheme } from "mouseterm-lib/lib/themes";
import { ThemeStore } from "./ThemeStore";

export function ThemePicker() {
  const [themes, setThemes] = useState(getAllThemes);
  const [activeId, setActiveId] = useState(() => getAllThemes()[0]?.id ?? "");
  const [open, setOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Restore persisted theme on mount.
  useEffect(() => {
    const allThemes = getAllThemes();
    const theme = getTheme(getActiveThemeId()) ?? allThemes[0];
    setThemes(allThemes);
    if (!theme) return;
    setActiveId(theme.id);
    setActiveThemeId(theme.id);
    applyTheme(theme);
  }, []);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", closeOnPointerDown, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointerDown, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const refreshThemes = useCallback(() => {
    const allThemes = getAllThemes();
    setThemes(allThemes);

    const current = allThemes.find((theme) => theme.id === getActiveThemeId());
    if (current) {
      setActiveId(current.id);
      return;
    }

    const fallback = allThemes[0];
    if (!fallback) return;
    setActiveId(fallback.id);
    setActiveThemeId(fallback.id);
    applyTheme(fallback);
  }, []);

  const select = (id: string) => {
    const theme = getTheme(id);
    if (!theme) return;
    setActiveId(id);
    setActiveThemeId(id);
    applyTheme(theme);
    setOpen(false);
  };

  const deleteTheme = (theme: MouseTermTheme) => {
    if (theme.origin.kind !== "installed") return;
    const confirmed = window.confirm(`Delete "${theme.label}"?`);
    if (!confirmed) return;

    removeInstalledTheme(theme.id);
    const allThemes = getAllThemes();
    setThemes(allThemes);

    if (activeId !== theme.id) return;
    const fallback = allThemes[0];
    if (!fallback) return;
    setActiveId(fallback.id);
    setActiveThemeId(fallback.id);
    applyTheme(fallback);
  };

  const openStore = () => {
    setOpen(false);
    setStoreOpen(true);
  };

  const activeTheme = themes.find((theme) => theme.id === activeId) ?? themes[0];

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center gap-1.5 text-xs">
      <span
        id="theme-picker-label"
        className="shrink-0 text-[11px] font-medium"
        style={{ color: "var(--vscode-descriptionForeground, #858585)" }}
      >
        Theme:
      </span>

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-labelledby="theme-picker-label theme-picker-current"
        onClick={() => setOpen((value) => !value)}
        className="flex h-8 w-[116px] min-w-0 items-center gap-2 rounded border px-2 text-left text-[12px] transition-colors sm:w-40 md:w-56"
        style={{
          backgroundColor: "var(--vscode-input-background, #3c3c3c)",
          borderColor: open
            ? "var(--vscode-focusBorder, #007fd4)"
            : "var(--vscode-input-border, #3c3c3c)",
          color: "var(--vscode-editor-foreground, #cccccc)",
        }}
      >
        {activeTheme ? (
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <span
              className="block h-4 w-4 rounded-full border"
              style={{
                backgroundColor: activeTheme.swatch,
                borderColor: "var(--vscode-panel-border, #2b2b2b)",
              }}
            />
            <span
              className="absolute -right-0.5 -bottom-0.5 h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: activeTheme.accent }}
            />
          </span>
        ) : null}
        <span id="theme-picker-current" className="min-w-0 flex-1 truncate">
          {activeTheme?.label ?? "Select theme"}
        </span>
        <span className="shrink-0 opacity-60" aria-hidden="true">
          v
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-labelledby="theme-picker-label"
          className="fixed top-16 right-4 left-4 z-50 overflow-hidden rounded border shadow-2xl md:absolute md:top-full md:right-0 md:left-auto md:mt-2 md:w-[22rem]"
          style={{
            backgroundColor: "var(--vscode-editorWidget-background, #252526)",
            borderColor: "var(--vscode-panel-border, #2b2b2b)",
            color: "var(--vscode-editor-foreground, #cccccc)",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
          }}
        >
          <div
            className="overflow-y-auto py-1"
            style={{ maxHeight: "min(24rem, calc(100vh - 9rem))" }}
          >
            {themes.map((theme) => {
              const isActive = theme.id === activeId;
              const isInstalled = theme.origin.kind === "installed";
              return (
                <div
                  key={theme.id}
                  className="flex items-center transition-colors"
                  style={{
                    backgroundColor: isActive
                      ? "var(--vscode-list-activeSelectionBackground, #094771)"
                      : "transparent",
                    color: isActive
                      ? "var(--vscode-list-activeSelectionForeground, #ffffff)"
                      : "var(--vscode-editor-foreground, #cccccc)",
                  }}
                >
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => select(theme.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-xs"
                    style={{ color: "inherit" }}
                  >
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      <span
                        className="block h-4 w-4 rounded-full border"
                        style={{
                          backgroundColor: theme.swatch,
                          borderColor: "var(--vscode-panel-border, #2b2b2b)",
                        }}
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
                      aria-label={`Delete ${theme.label}`}
                      title={`Delete ${theme.label}`}
                      className="mr-2 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] opacity-55 transition-opacity hover:opacity-100 focus:opacity-100"
                      style={{ color: "inherit" }}
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

          <div
            className="border-t p-1"
            style={{ borderColor: "var(--vscode-panel-border, #2b2b2b)" }}
          >
            <button
              type="button"
              onClick={openStore}
              className="w-full rounded px-3 py-2 text-left text-xs font-medium transition-colors"
              style={{
                color: "var(--vscode-textLink-foreground, var(--vscode-focusBorder, #3794ff))",
              }}
            >
              Install theme from OpenVSX
            </button>
          </div>
        </div>
      ) : null}

      <ThemeStore
        open={storeOpen}
        onClose={() => setStoreOpen(false)}
        onThemesChanged={() => {
          refreshThemes();
          // Sync active ID in case install auto-selected a theme
          setActiveId(getActiveThemeId());
        }}
      />
    </div>
  );
}
