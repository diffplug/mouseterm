import { forwardRef } from "react";

const NAV_LINKS: readonly { href: string; label: string; external?: boolean; hideOnMobile?: boolean }[] = [
  { href: "/playground", label: "Playground", hideOnMobile: true },
  { href: "/#download", label: "Download", hideOnMobile: true },
  { href: "https://github.com/diffplug/mouseterm", label: "GitHub", external: true },
];

interface SiteHeaderProps {
  /** Current path — highlights matching nav link */
  activePath?: string;
  /** Ref for the brand link (used by Home scroll animation) */
  brandRef?: React.Ref<HTMLAnchorElement>;
  /** Whether brand is on a non-home page (visible + grey) vs home (hidden, animated in) */
  brandVisible?: boolean;
  /** Optional header control, used by the playground theme picker. */
  controls?: React.ReactNode;
  /** Use VSCode theme variables instead of the marketing site's palette. */
  themeAware?: boolean;
  /** Extra inline styles for the header element (background, blur, etc.) */
  style?: React.CSSProperties;
}

/**
 * Shared site header. On Home the brand fades in via scroll; on other pages
 * it's always visible. Background/blur are controlled via inline styles on
 * the root element (Home animates them; other pages set them statically).
 */
const SiteHeader = forwardRef<HTMLElement, SiteHeaderProps>(
  function SiteHeader({
    activePath,
    brandRef,
    brandVisible = true,
    controls,
    themeAware = false,
    style,
  }, ref) {
    const headerStyle: React.CSSProperties = themeAware
      ? {
          color: "var(--vscode-editor-foreground, #cccccc)",
          fontFamily:
            "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)",
          backgroundColor:
            "color-mix(in oklab, var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-sideBar-background, #252526)) 92%, transparent)",
          borderColor: "var(--vscode-panel-border, #2b2b2b)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          ...style,
        }
      : { color: "color-mix(in oklab, var(--color-text) 80%, transparent)", ...style };

    return (
      <>
        <div
          className={`fixed top-0 left-0 right-0 z-30 bg-[var(--color-caramel)] text-[var(--color-bg)] text-center text-sm font-display py-1.5${themeAware ? " border-b" : ""}`}
          style={
            themeAware
              ? {
                  backgroundColor: "var(--vscode-badge-background, #007acc)",
                  borderColor: "var(--vscode-panel-border, #2b2b2b)",
                  color: "var(--vscode-badge-foreground, #ffffff)",
                }
              : undefined
          }
        >
          🚧 Under construction — check back soon! 🚧
        </div>
        <header
          ref={ref}
          className={`fixed top-8 left-0 right-0 z-20 flex items-center justify-between gap-3 px-4 md:px-8 font-display text-lg${
            themeAware ? " h-16 border-b py-0 md:h-20" : " py-4 md:py-6"
          }`}
          style={headerStyle}
        >
          <a
            ref={brandRef}
            href="/"
            className={
              brandVisible
                ? `text-xl transition-opacity ${
                    themeAware
                      ? "opacity-80 hover:opacity-100"
                      : "opacity-50 hover:opacity-100 text-[var(--color-caramel)]"
                  }`
                : `text-xl ${
                    themeAware ? "" : "text-[var(--color-caramel)]"
                  }`
            }
            style={
              brandVisible
                ? themeAware
                  ? { color: "var(--vscode-editor-foreground, #cccccc)" }
                  : undefined
                : {
                    color: themeAware
                      ? "var(--vscode-editor-foreground, #cccccc)"
                      : undefined,
                    opacity: 0,
                  }
            }
          >
            MouseTerm
          </a>
          <div className="ml-auto flex min-w-0 items-center gap-3 md:gap-8">
            {controls ? <div className="min-w-0">{controls}</div> : null}
            <nav className="flex shrink-0 items-center gap-5 md:gap-10">
              {NAV_LINKS.map(({ href, label, external, hideOnMobile }) => {
                const isActive = activePath === href;
                return (
                  <a
                    key={href}
                    href={href}
                    className={`transition-colors ${
                      hideOnMobile ? "hidden md:block " : ""
                    }${
                      themeAware
                        ? isActive
                          ? "opacity-100"
                          : "opacity-70 hover:opacity-100"
                        : isActive
                          ? "text-[var(--color-caramel-light)]"
                          : "hover:text-[var(--color-caramel-light)]"
                    }`}
                    style={
                      themeAware && isActive
                        ? {
                            color:
                              "var(--vscode-textLink-foreground, var(--vscode-focusBorder, #3794ff))",
                          }
                        : undefined
                    }
                    {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
          </div>
        </header>
      </>
    );
  },
);

export default SiteHeader;
