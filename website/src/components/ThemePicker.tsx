import { useState } from "react";
import { THEMES, applyTheme } from "../lib/playground-themes";

export function ThemePicker() {
  const [activeTheme, setActiveTheme] = useState(THEMES[0].name);

  return (
    <div className="flex items-center gap-3">
      <span
        className="text-[11px] font-medium tracking-wide uppercase"
        style={{ color: "rgba(255, 255, 255, 0.35)" }}
      >
        Theme
      </span>
      <div className="flex items-center gap-1.5">
        {THEMES.map((theme) => {
          const isActive = theme.name === activeTheme;
          return (
            <button
              key={theme.name}
              onClick={() => {
                setActiveTheme(theme.name);
                applyTheme(theme.name);
              }}
              title={theme.label}
              className="group relative flex items-center justify-center rounded-full transition-transform hover:scale-110"
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
      </div>
    </div>
  );
}
