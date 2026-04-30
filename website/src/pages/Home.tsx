import {
  AppleLogoIcon,
  CheckCircleIcon,
  CubeIcon,
  DesktopIcon,
  DotsThreeOutlineIcon,
  LinuxLogoIcon,
  StorefrontIcon,
  TerminalIcon,
  WindowsLogoIcon,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";
import SiteHeader from "../components/SiteHeader";
import posterUrl from "../assets/video-climb-blink-and-stare.webp";
import videoUrl from "../assets/video-climb-blink-and-stare.mp4";
import visualStudioIconUrl from "../assets/visual-studio-icon.svg";
import tinyIconUrl from "../../assets/icon-tiny-dark.png";
import standaloneLatest from "@standalone-latest";

export { Home as Component };

/** Scroll runway length in viewport heights. Larger = slower reveal. */
const RUNWAY_VH = 300;

/** Scroll thresholds within the pinned runway (0–1) */
const ICON_INITIAL_HIDE_FRAC = 0.67; // Fraction of icon's rendered height hidden at load — leaves top third visible
const HOOK_FADE_REMAINING = 0.10;    // Hook begins fading when bottom 10% of icon enters viewport
const WORD_THRESHOLDS = [0.25, 0.40, 0.55] as const;
const ASTERISK_THRESHOLD = 0.65;
const HEADER_REVEAL_LEAD = 0.04;

/** Fraction of runway where the hero text unpins and scrolls away (0–1).
 *  The video keeps scrubbing underneath. */
const UNPIN_THRESHOLD = 0.8;

/** Clamp a value to 0–1. */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const downloadAccentStyle = {
  "--download-accent": "oklch(72% 0.15 72)",
  "--download-accent-strong": "oklch(77% 0.16 72)",
  "--download-border": "color-mix(in oklch, var(--download-accent) 58%, transparent)",
  "--download-primary": "color-mix(in oklch, var(--download-accent) 72%, var(--color-bg))",
  "--download-primary-hover": "color-mix(in oklch, var(--download-accent-strong) 82%, var(--color-bg))",
  "--download-panel": "color-mix(in oklch, var(--color-surface) 82%, var(--color-bg))",
  "--download-panel-hover": "color-mix(in oklch, var(--download-accent) 12%, var(--download-panel))",
} as CSSProperties;

const DOWNLOAD_BUTTON_BASE =
  "relative z-10 inline-flex min-w-0 items-center justify-start rounded-md border font-display leading-none transition duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform motion-reduce:transition-none motion-reduce:group-hover:rotate-0 motion-reduce:group-focus-visible:rotate-0";

const DOWNLOAD_BUTTON_VARIANTS = {
  primary:
    "min-h-14 w-full gap-4 px-6 py-3 text-lg sm:w-auto border-[var(--download-accent)] bg-[var(--download-primary)] text-[var(--color-text)] shadow-[0_0_18px_color-mix(in_oklch,var(--download-accent)_18%,transparent)] hover:border-[var(--download-accent-strong)] hover:bg-[var(--download-primary-hover)]",
  wide:
    "min-h-12 w-full gap-3 px-5 py-3 text-base sm:w-auto sm:text-lg border-[var(--download-border)] bg-[var(--download-panel)] text-[var(--download-accent)] hover:border-[var(--download-accent)] hover:bg-[var(--download-panel-hover)]",
  compact:
    "min-h-12 w-full gap-3 px-5 py-3 text-base sm:w-auto sm:text-lg border-[var(--download-border)] bg-[var(--download-panel)] text-[var(--download-accent)] hover:border-[var(--download-accent)] hover:bg-[var(--download-panel-hover)]",
} as const;

const DOWNLOAD_MOUSE_BASE =
  "pointer-events-none absolute z-0 size-6 transition-transform duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0 motion-reduce:group-focus-visible:translate-y-0";

const PEEK_ROTATION_DEGREES = {
  playground: -1.5,
  marketplace: 2.0,
  openVsx: 2.5,
  mac: 3.75,
  windows: -3.75,
  linux: -3.75,
  other: 3.75,
} as const;

const PEEK_MOTIONS = {
  playground: {
    faceClass: "origin-top-right",
    mouseClass: "left-3 top-1.5 -rotate-6 group-hover:-translate-y-4 group-hover:-rotate-12 group-focus-visible:-translate-y-4 group-focus-visible:-rotate-12 motion-reduce:group-hover:-rotate-6 motion-reduce:group-focus-visible:-rotate-6",
  },
  marketplace: {
    faceClass: "origin-top-left",
    mouseClass: "right-3 top-1.5 rotate-6 group-hover:-translate-y-4 group-hover:rotate-12 group-focus-visible:-translate-y-4 group-focus-visible:rotate-12 motion-reduce:group-hover:rotate-6 motion-reduce:group-focus-visible:rotate-6",
  },
  openVsx: {
    faceClass: "origin-bottom-right",
    mouseClass: "bottom-1.5 left-3 rotate-180 group-hover:translate-y-4 group-focus-visible:translate-y-4",
  },
  mac: {
    faceClass: "origin-top-left",
    mouseClass: "right-3 top-1.5 rotate-6 group-hover:-translate-y-4 group-hover:rotate-12 group-focus-visible:-translate-y-4 group-focus-visible:rotate-12 motion-reduce:group-hover:rotate-6 motion-reduce:group-focus-visible:rotate-6",
  },
  windows: {
    faceClass: "origin-top-right",
    mouseClass: "left-3 top-1.5 -rotate-6 group-hover:-translate-y-4 group-hover:-rotate-12 group-focus-visible:-translate-y-4 group-focus-visible:-rotate-12 motion-reduce:group-hover:-rotate-6 motion-reduce:group-focus-visible:-rotate-6",
  },
  linux: {
    faceClass: "origin-bottom-left",
    mouseClass: "bottom-1.5 right-3 rotate-180 group-hover:translate-y-4 group-focus-visible:translate-y-4",
  },
  other: {
    faceClass: "origin-bottom-right",
    mouseClass: "bottom-1.5 left-3 rotate-180 group-hover:translate-y-4 group-focus-visible:translate-y-4",
  },
} satisfies Record<keyof typeof PEEK_ROTATION_DEGREES, { faceClass: string; mouseClass: string }>;

const INSTALL_STEPS: Record<string, { pill: string; title: string; steps: string[] }> = {
  "darwin-aarch64": {
    pill: "Mac Silicon",
    title: "Installing on Mac",
    steps: [
      "Double-click the downloaded .tar.gz to extract MouseTerm.app",
      "Drag MouseTerm.app to Applications",
    ],
  },
  "windows-x86_64": {
    pill: "Windows x64",
    title: "Installing on Windows",
    steps: [
      "Double-click the downloaded MouseTerm-windows-x64-setup.exe",
      "If SmartScreen appears: More info \u2192 Run anyway",
    ],
  },
  "linux-x86_64": {
    pill: "Linux x64",
    title: "Installing on Linux",
    steps: [
      "Make executable: chmod +x MouseTerm-linux-x86_64.AppImage",
      "Run from terminal or double-click to launch",
    ],
  },
};

function DownloadButton({
  href,
  children,
  icon,
  className = "",
  onClick,
  peek,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  icon: ReactNode;
  className?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  peek: keyof typeof PEEK_MOTIONS;
  variant?: "primary" | "wide" | "compact";
}) {
  const motion = PEEK_MOTIONS[peek];
  const peekStyle = { "--peek-rotate": `${PEEK_ROTATION_DEGREES[peek]}deg` } as CSSProperties;

  return (
    <a
      href={href}
      onClick={onClick}
      className="group relative isolate inline-block overflow-visible focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-[var(--download-accent)]"
      style={peekStyle}
    >
      <img
        src={tinyIconUrl}
        alt=""
        aria-hidden="true"
        className={`${DOWNLOAD_MOUSE_BASE} ${motion.mouseClass}`}
      />
      <span className={`${DOWNLOAD_BUTTON_BASE} ${motion.faceClass} group-hover:rotate-[var(--peek-rotate)] group-focus-visible:rotate-[var(--peek-rotate)] ${DOWNLOAD_BUTTON_VARIANTS[variant]} ${className}`}>
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center"
        >
          {icon}
        </span>
        <span className="min-w-0 truncate">{children}</span>
      </span>
    </a>
  );
}

function VsCodeIcon({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-[var(--color-caramel)] ${className}`}
      style={{
        mask: `url("${visualStudioIconUrl}") center / contain no-repeat`,
        WebkitMask: `url("${visualStudioIconUrl}") center / contain no-repeat`,
      }}
    />
  );
}

function DownloadGroupHeader({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center text-[var(--color-caramel)]">
        {icon}
      </span>
      <h3 className="font-display text-xl text-[var(--color-text)]">{children}</h3>
    </div>
  );
}

function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runwayRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const word0Ref = useRef<HTMLSpanElement>(null);
  const word1Ref = useRef<HTMLSpanElement>(null);
  const word2Ref = useRef<HTMLSpanElement>(null);
  const asteriskRef = useRef<HTMLElement>(null);
  const footnoteRef = useRef<HTMLParagraphElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const headerBrandRef = useRef<HTMLAnchorElement>(null);
  const hookRef = useRef<HTMLDivElement>(null);
  const [installGuide, setInstallGuide] = useState<string | null>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    const runwayElement = runwayRef.current;
    if (!videoElement || !runwayElement) return;
    const video: HTMLVideoElement = videoElement;
    const runway: HTMLDivElement = runwayElement;

    const wordRefs = [word0Ref, word1Ref, word2Ref];
    let ticking = false;

    function scheduleScrollSync() {
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        if (!video || !runway) return;

        // How far through the scroll runway (0–1, clamped for animations)
        const rect = runway.getBoundingClientRect();
        const runwayScroll = -rect.top;
        const runwayHeight = runway.offsetHeight - window.innerHeight;
        const fraction = runwayHeight > 0
          ? clamp01(runwayScroll / runwayHeight)
          : 0;

        // Rendered icon height (object-contain preserves aspect ratio within container).
        const naturalAspect = video.videoWidth && video.videoHeight
          ? video.videoWidth / video.videoHeight
          : 1.22; // fallback before metadata loads
        const containerAspect = video.offsetWidth / video.offsetHeight;
        const iconHeight = naturalAspect > containerAspect
          ? video.offsetWidth / naturalAspect  // width-limited
          : video.offsetHeight;                 // height-limited
        const initialOffset = iconHeight * ICON_INITIAL_HIDE_FRAC;

        // Scrub video: hold frame 0 during icon rise, then scrub remaining range.
        // Skip redundant seeks whose delta is less than one frame's duration —
        // each seek forces a decode, and sub-frame seeks produce the same output.
        if (video.duration && isFinite(video.duration)) {
          let target = 0;
          if (runwayScroll >= initialOffset) {
            const videoProgress = (runwayHeight - initialOffset) > 0
              ? clamp01((runwayScroll - initialOffset) / (runwayHeight - initialOffset))
              : 0;
            target = videoProgress * video.duration;
          }
          if (Math.abs(video.currentTime - target) > 1 / 24) {
            video.currentTime = target;
          }
        }

        // Reveal words
        for (let i = 0; i < WORD_THRESHOLDS.length; i++) {
          const el = wordRefs[i].current;
          if (!el) continue;
          const progress = clamp01(
            (fraction - WORD_THRESHOLDS[i]) / 0.08
          );
          el.style.opacity = String(progress);
          el.style.transform = `translateY(${(1 - progress) * 12}px)`;
        }

        // Asterisk + footnote
        const astProgress = clamp01(
          (fraction - ASTERISK_THRESHOLD) / 0.08
        );
        if (asteriskRef.current) asteriskRef.current.style.opacity = String(astProgress);
        if (footnoteRef.current) footnoteRef.current.style.opacity = String(astProgress * 0.7);

        // Header: reveal brand + background just before the tmux-shortcuts
        // footnote appears, so it reads as dark once the line is visible.
        const headerProgress = clamp01(
          (fraction - (ASTERISK_THRESHOLD - HEADER_REVEAL_LEAD)) / HEADER_REVEAL_LEAD
        );
        if (headerBrandRef.current) {
          headerBrandRef.current.style.opacity = String(headerProgress);
        }
        if (headerRef.current) {
          const headerBlur = headerProgress > 0 ? `blur(${headerProgress * 4}px)` : '';
          headerRef.current.style.backgroundColor = `rgba(0, 0, 0, ${headerProgress * 0.6})`;
          headerRef.current.style.backdropFilter = headerBlur;
          headerRef.current.style.setProperty("-webkit-backdrop-filter", headerBlur);
        }

        // Slide video + hero up once the content section enters the viewport.
        // Both start at the same scroll position so they move in lockstep.
        const contentEnterScroll = runway.offsetHeight * UNPIN_THRESHOLD - window.innerHeight;
        const slideAmount = Math.max(0, runwayScroll - contentEnterScroll);

        // Video transform combines two behaviors:
        //   1. Icon-rise (runwayScroll 0 → initialOffset): translate down so only
        //      the top third is visible; scroll lifts it 1:1 until fully in view.
        //   2. Unpin slide (fraction > UNPIN_THRESHOLD): translate up with content.
        const iconCurrentOffset = Math.max(0, initialOffset - runwayScroll);
        const videoTranslateY = iconCurrentOffset > 0
          ? iconCurrentOffset
          : slideAmount > 0 ? -Math.round(slideAmount) : 0;
        video.style.transform = videoTranslateY !== 0
          ? `translateY(${Math.round(videoTranslateY)}px)`
          : '';

        // Hook text: visible until the icon nearly finishes rising, then fades out.
        if (hookRef.current) {
          const remainingHidden = iconHeight > 0 ? iconCurrentOffset / iconHeight : 0;
          const fadeProgress = iconCurrentOffset === 0
            ? 1
            : clamp01(1 - remainingHidden / HOOK_FADE_REMAINING);
          hookRef.current.style.opacity = String(1 - fadeProgress);
          hookRef.current.style.transform = `translateY(${-fadeProgress * 24}px)`;
        }

        // Hero: cap so it stops at unstick (fraction = 1); natural scroll takes over.
        const maxHeroOffset = runway.offsetHeight * (1 - UNPIN_THRESHOLD);
        const heroOffset = Math.min(slideAmount, maxHeroOffset);
        if (heroRef.current) {
          heroRef.current.style.transform = heroOffset > 0
            ? `translateY(-${Math.round(heroOffset)}px)`
            : '';
        }
      });
    }

    // Mobile unlock
    let unlocked = false;
    let unlockPending = false;
    function unlock() {
      if (unlocked || unlockPending) return;
      unlockPending = true;
      video.play().then(() => {
        video.pause();
        unlocked = true;
        window.removeEventListener("touchstart", unlock);
        scheduleScrollSync();
      }).catch(() => {
        unlocked = false;
      }).finally(() => {
        unlockPending = false;
      });
    }
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    const handleCanPlayThrough = () => {
      unlocked = true;
      scheduleScrollSync();
    };
    video.addEventListener("canplaythrough", handleCanPlayThrough, { once: true });
    video.addEventListener("loadedmetadata", scheduleScrollSync);
    video.addEventListener("durationchange", scheduleScrollSync);

    function onScroll() {
      if (!unlocked) unlock();
      scheduleScrollSync();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initial position

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", unlock);
      video.removeEventListener("canplaythrough", handleCanPlayThrough);
      video.removeEventListener("loadedmetadata", scheduleScrollSync);
      video.removeEventListener("durationchange", scheduleScrollSync);
    };
  }, []);

  return (
    <>
      <SiteHeader ref={headerRef} brandRef={headerBrandRef} brandVisible={false} />

      {/* ── Fixed video layer — bottom-anchored, scrubs for the full runway ── */}
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        muted
        playsInline
        preload="auto"
        className="fixed bottom-0 left-0 w-full object-contain object-bottom z-0"
        style={{ height: "min(500px, calc(100vh - 420px))" }}
      />

      {/* ── Pinned scroll runway: hero text overlay ── */}
      <div ref={runwayRef} style={{ height: `${RUNWAY_VH}vh` }}>
        <div ref={heroRef} className="sticky top-0 flex flex-col items-center z-[1]" style={{ height: "100vh" }}>
          {/* Hook copy — visible on load, fades out on first scroll */}
          <div
            ref={hookRef}
            className="absolute top-20 md:top-24 left-0 right-0 flex flex-col items-center text-center px-6 font-display text-[clamp(2.5rem,5vw+0.5rem,4rem)] gap-1"
          >
            <span>Too many terminals.</span>
            <span>Not enough focus.</span>
          </div>
          {/* Hero words — crossfade in place with the hook, just below the header */}
          <div className="absolute top-20 md:top-24 left-0 right-0 flex flex-col items-center text-center px-6 gap-1 font-display text-[clamp(2.5rem,5vw+0.5rem,4rem)]">
            <span ref={word0Ref} style={{ opacity: 0, transform: "translateY(12px)" }}>
              Multitasking
            </span>
            <span ref={word1Ref} style={{ opacity: 0, transform: "translateY(12px)" }}>
              Terminal
            </span>
            <span ref={word2Ref} style={{ opacity: 0, transform: "translateY(12px)" }}>
              <span className="text-[var(--color-caramel)] relative">
                for Mice<sup ref={asteriskRef} className="absolute left-full top-3" style={{ opacity: 0 }}>*</sup>
              </span>
            </span>
            <p
              ref={footnoteRef}
              className="mt-3 text-lg"
              style={{ opacity: 0 }}
            >
              *supports (and teaches) tmux shortcuts
            </p>
          </div>
        </div>
      </div>

      {/* ── Content sections — pulled up to appear as video starts scrolling ── */}
      <div className="relative z-10 bg-[var(--color-bg)]" style={{ marginTop: `-${(1 - UNPIN_THRESHOLD) * RUNWAY_VH}vh` }}>
        <section id="features" className="mx-auto max-w-2xl px-4 md:px-6 py-20">
          <h2 className="font-display text-[clamp(1.5rem,2.5vw+0.5rem,2.25rem)] mb-6">Stop watching terminals spin</h2>
          <p className="text-lg leading-relaxed opacity-70 mb-4">
            MouseTerm tracks activity the same way you do — visual motion. When a
            pane stops changing for two seconds, it marks the task complete and
            alerts you.
          </p>
          <p className="text-lg leading-relaxed opacity-70">
            Works with any CLI tool that prints to a terminal — no plugins, no
            configuration.
          </p>
          <div className="mt-8 -mx-4 md:mx-0 aspect-video md:rounded-lg border-y md:border border-[var(--color-text)]/20 bg-[var(--color-text)]/5 flex items-center justify-center">
            <p className="text-sm opacity-40 italic">TODO: Completion detection in action</p>
          </div>
        </section>

        {/* Section 2: text left, image right */}
        <section className="mx-auto max-w-5xl px-4 md:px-6 py-12 grid md:grid-cols-[2fr_3fr] gap-8 md:gap-12 items-start">
          <div>
            <h2 className="font-display text-xl mb-6">Copy paste like you meant</h2>
            <p className="text-lg leading-relaxed opacity-70 mb-4">
              Click and drag in a "mouse conformant" terminal doesn't select text;
              it sends escape code{" "}
              <code className="text-sm bg-[var(--color-text)]/20 px-1.5 py-0.5 rounded">{"\\e[<0;x;yM"}</code>.
              And <code className="text-sm bg-[var(--color-text)]/20 px-1.5 py-0.5 rounded">Ctrl+C</code>{" "}
              doesn't copy; it asks your program to kill itself.
            </p>
            <p className="text-lg leading-relaxed opacity-70">
              MouseTerm lets you copy paste like a human, not a terminal.
            </p>
          </div>
          <div className="-mx-4 md:mx-0 aspect-video md:rounded-lg border-y md:border border-[var(--color-text)]/20 bg-[var(--color-text)]/5 flex items-center justify-center">
            <p className="text-sm opacity-40 italic">TODO: Copy/paste with line-break rewrap</p>
          </div>
        </section>

        {/* Section 3: image left, text right */}
        <section className="mx-auto max-w-5xl px-4 md:px-6 py-12 grid md:grid-cols-[3fr_2fr] gap-8 md:gap-12 items-start">
          <div className="-mx-4 md:mx-0 aspect-video md:rounded-lg border-y md:border border-[var(--color-text)]/20 bg-[var(--color-text)]/5 flex items-center justify-center order-2 md:order-1">
            <p className="text-sm opacity-40 italic">TODO: Tiling layout and tmux keybinds</p>
          </div>
          <div className="order-1 md:order-2">
            <h2 className="font-display text-xl mb-6">Soft as a mouse, sharp as tmux</h2>
            <p className="text-lg leading-relaxed opacity-70 mb-4">
              Run builds, agents, servers, and scripts side by side. Minimize the
              ones you're not watching to a compact status indicator. Every pane
              keeps running and every alert still fires whether you can see it or
              not.
            </p>
            <p className="text-lg leading-relaxed opacity-70">
              Do it all with the mouse, or keep your hands on the keyboard with
              tmux keybinds.
            </p>
          </div>
        </section>

        <section id="download" className="mx-auto max-w-5xl px-4 py-20 md:px-6" style={downloadAccentStyle}>
          <h2 className="font-display text-[clamp(1.5rem,2.5vw+0.5rem,2.25rem)] text-[var(--color-text)]">Get MouseTerm</h2>
          <p className="mb-4 text-lg leading-relaxed opacity-70">The multitasking terminal for mice.</p>
          <DownloadButton
            href="/playground"
            icon={<TerminalIcon size={26} weight="bold" />}
            peek="playground"
          >
            Try it in the Playground
          </DownloadButton>

          <div className="mt-10 space-y-8">
            <div>
              <DownloadGroupHeader icon={<VsCodeIcon className="size-6" />}>VS Code Extension</DownloadGroupHeader>
              <p className="mb-4 text-lg leading-relaxed opacity-70">Also works in Cursor, Windsurf, Antigravity, or any other VS Code fork.</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-3">
                <DownloadButton
                  href="https://marketplace.visualstudio.com/items?itemName=diffplug.mouseterm"
                  icon={<StorefrontIcon size={22} weight="bold" />}
                  peek="marketplace"
                  variant="wide"
                >
                  Visual Studio Marketplace
                </DownloadButton>
                <DownloadButton
                  href="https://open-vsx.org/extension/diffplug/mouseterm"
                  icon={<CubeIcon size={22} weight="bold" />}
                  peek="openVsx"
                  variant="wide"
                >
                  Open VSX Registry
                </DownloadButton>
              </div>
            </div>
            <div>
              <DownloadGroupHeader icon={<DesktopIcon size={24} weight="bold" />}>Standalone App</DownloadGroupHeader>
              <p className="mb-4 text-lg leading-relaxed opacity-70">Don't settle for your operating system's built-in terminal, get a nice one!</p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-3">
                <DownloadButton
                  href={standaloneLatest.platforms["darwin-aarch64"].url}
                  onClick={() => setInstallGuide("darwin-aarch64")}
                  icon={<AppleLogoIcon size={22} weight="fill" />}
                  peek="mac"
                  variant="compact"
                >
                  {INSTALL_STEPS["darwin-aarch64"].pill}
                </DownloadButton>
                <DownloadButton
                  href={standaloneLatest.platforms["windows-x86_64"].url}
                  onClick={() => setInstallGuide("windows-x86_64")}
                  icon={<WindowsLogoIcon size={22} weight="fill" />}
                  peek="windows"
                  variant="compact"
                >
                  {INSTALL_STEPS["windows-x86_64"].pill}
                </DownloadButton>
                <DownloadButton
                  href={standaloneLatest.platforms["linux-x86_64"].url}
                  onClick={() => setInstallGuide("linux-x86_64")}
                  icon={<LinuxLogoIcon size={22} weight="fill" />}
                  peek="linux"
                  variant="compact"
                >
                  {INSTALL_STEPS["linux-x86_64"].pill}
                </DownloadButton>
                <DownloadButton
                  href="https://github.com/diffplug/mouseterm/issues/8"
                  icon={<DotsThreeOutlineIcon size={22} weight="fill" />}
                  peek="other"
                  variant="compact"
                >
                  Other
                </DownloadButton>
              </div>
              {installGuide && INSTALL_STEPS[installGuide] && (
                <div className="mt-8 rounded-lg border border-[var(--color-text)]/20 bg-[var(--color-text)]/5 px-5 py-5 sm:px-6">
                  <p className="mb-4 flex items-center gap-3 text-lg font-display text-[var(--color-text)]">
                    <CheckCircleIcon size={26} weight="bold" className="shrink-0 text-green-500" aria-hidden="true" />
                    <span>Download started!</span>
                  </p>
                  <p className="mb-3 border-b border-[var(--color-text)]/10 pb-3 font-display text-base uppercase text-[var(--download-accent)]">{INSTALL_STEPS[installGuide].title}</p>
                  <ol className="space-y-2 text-base">
                    {INSTALL_STEPS[installGuide].steps.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 text-[var(--download-accent)]">{i + 1}.</span>
                        <span className="opacity-70">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--color-text)]/20 py-10">
          <div className="mx-auto max-w-2xl px-4 md:px-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm opacity-50">
            <a href="/dependencies" className="underline hover:opacity-100">Dependencies</a>
            <a href="https://github.com/diffplug/mouseterm/issues" className="underline hover:opacity-100">Report an issue</a>
            <p>
              Brought to you by{" "}
              <a href="https://nedshed.dev" className="underline hover:opacity-100">nedshed.dev</a>
              {" "}and{" "}
              <a href="https://diffplug.com" className="underline hover:opacity-100">DiffPlug</a>
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}
