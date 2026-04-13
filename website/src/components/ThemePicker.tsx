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
    <div className="flex items-center gap-3">
      <span
        className="text-[11px] font-medium tracking-wide uppercase"
        style={{ color: "rgba(255, 255, 255, 0.35)" }}
      >
        Theme
      </span>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {themes.map((theme) => {
          const isActive = theme.id === activeId;
          return (
            <button
              key={theme.id}
              onClick={() => select(theme.id)}
              title={theme.label}
              className="group relative flex shrink-0 items-center justify-center rounded-full transition-transform hover:scale-110"
              style={{
                width: 22,
                height: 22,
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
                  width: 14,
                  height: 14,
                  backgroundColor: theme.swatch,
                  boxShadow: `inset -2px -2px 4px rgba(0,0,0,0.3), inset 2px 2px 4px rgba(255,255,255,0.08)`,
                }}
              />
              {/* Accent dot */}
              <span
                className="absolute bottom-0 right-0 block rounded-full"
                style={{
                  width: 6,
                  height: 6,
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
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[12px] transition-colors"
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
