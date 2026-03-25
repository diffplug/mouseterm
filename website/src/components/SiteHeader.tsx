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
  /** Extra inline styles for the header element (background, blur, etc.) */
  style?: React.CSSProperties;
}

/**
 * Shared site header. On Home the brand fades in via scroll; on other pages
 * it's always visible. Background/blur are controlled via inline styles on
 * the root element (Home animates them; other pages set them statically).
 */
const SiteHeader = forwardRef<HTMLElement, SiteHeaderProps>(
  function SiteHeader({ activePath, brandRef, brandVisible = true, style }, ref) {
    return (
      <header
        ref={ref}
        className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between px-4 md:px-8 py-4 md:py-6 font-display text-lg font-medium"
        style={{ color: "color-mix(in oklab, var(--color-text) 80%, transparent)", ...style }}
      >
        <a
          ref={brandRef}
          href="/"
          className={
            brandVisible
              ? "text-xl font-semibold tracking-tight opacity-50 hover:opacity-100 text-[var(--color-caramel)] transition-opacity"
              : "text-xl font-semibold tracking-tight text-[var(--color-caramel)]"
          }
          style={brandVisible ? undefined : { opacity: 0 }}
        >
          MouseTerm
        </a>
        <nav className="flex items-center gap-10">
          {NAV_LINKS.map(({ href, label, external, hideOnMobile }) => {
            const isActive = activePath === href;
            return (
              <a
                key={href}
                href={href}
                className={`transition-colors ${
                  hideOnMobile ? "hidden md:block " : ""
                }${
                  isActive
                    ? "text-[var(--color-caramel-light)]"
                    : "hover:text-[var(--color-caramel-light)]"
                }`}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {label}
              </a>
            );
          })}
        </nav>
      </header>
    );
  },
);

export default SiteHeader;
