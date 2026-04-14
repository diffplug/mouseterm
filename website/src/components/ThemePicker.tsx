import { useState, useEffect, useCallback } from "react";
import {
  getAllThemes,
  getActiveThemeId,
  setActiveThemeId,
  getTheme,
  applyTheme,
} from "mouseterm-lib/lib/themes";
import { ThemeStore } from "./ThemeStore";

export function ThemePicker() {
  const [themes, setThemes] = useState(getAllThemes);
  const [activeId, setActiveId] = useState(getActiveThemeId);
  const [storeOpen, setStoreOpen] = useState(false);

  // Restore persisted theme on mount
  useEffect(() => {
    const theme = getTheme(activeId);
    if (theme) applyTheme(theme);
  }, []);

  const refreshThemes = useCallback(() => {
    setThemes(getAllThemes());
  }, []);

  const select = (id: string) => {
    const theme = getTheme(id);
    if (!theme) return;
    setActiveId(id);
    setActiveThemeId(id);
    applyTheme(theme);
  };

  return (
    <div className="flex w-full min-w-0 items-center justify-center gap-2">
      <span
        className="shrink-0 text-[11px] font-medium tracking-wide uppercase"
        style={{ color: "rgba(255, 255, 255, 0.35)" }}
      >
        Theme
      </span>
      <div className="flex min-w-0 items-center gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {themes.map((theme) => {
          const isActive = theme.id === activeId;
          return (
            <button
              key={theme.id}
              onClick={() => select(theme.id)}
              title={theme.label}
              className="group relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105"
              style={{
                outline: isActive
                  ? `2px solid ${theme.accent}`
                  : "2px solid transparent",
                outlineOffset: 1,
              }}
            >
              {/* Swatch circle */}
              <span
                className="block rounded-full"
                style={{
                  width: 16,
                  height: 16,
                  backgroundColor: theme.swatch,
                  boxShadow: `inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.08)`,
                }}
              />
              {/* Accent dot */}
              <span
                className="absolute bottom-0 right-0 block rounded-full"
                style={{
                  width: 7,
                  height: 7,
                  backgroundColor: theme.accent,
                }}
              />
            </button>
          );
        })}

        {/* Add theme button */}
        <button
          onClick={() => setStoreOpen(true)}
          title="Install theme from OpenVSX"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] transition-colors hover:bg-white/5"
          style={{ color: "rgba(255, 255, 255, 0.25)", border: "1px dashed rgba(255, 255, 255, 0.15)" }}
        >
          +
        </button>
      </div>

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
