import { useEffect, useRef, useState } from "react";
import SiteHeader from "../components/SiteHeader";
import posterUrl from "../assets/video-climb-blink-and-stare.webp";
import videoUrl from "../assets/video-climb-blink-and-stare.mp4";
import standaloneLatest from "@standalone-latest";

export { Home as Component };

/** Scroll runway length in viewport heights. Larger = slower reveal. */
const RUNWAY_VH = 300;

/** Scroll thresholds within the pinned runway (0–1) */
const ICON_INITIAL_HIDE_FRAC = 0.67; // Fraction of icon's rendered height hidden at load — leaves top third visible
const HOOK_FADE_REMAINING = 0.10;    // Hook begins fading when bottom 10% of icon enters viewport
const WORD_THRESHOLDS = [0.25, 0.40, 0.55] as const;
const ASTERISK_THRESHOLD = 0.65;

/** Fraction of runway where the hero text unpins and scrolls away (0–1).
 *  The video keeps scrubbing underneath. */
const UNPIN_THRESHOLD = 0.8;

/** Clamp a value to 0–1. */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const PILL =
  "inline-block px-4 py-1.5 rounded-md border border-[var(--color-caramel)]/30 text-[var(--color-caramel)] text-sm font-display hover:bg-[var(--color-caramel)]/10 hover:border-[var(--color-caramel)]/60 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150";

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
      "Double-click the downloaded ...-setup.exe",
      "If SmartScreen appears: More info \u2192 Run anyway",
    ],
  },
  "linux-x86_64": {
    pill: "Linux x64",
    title: "Installing on Linux",
    steps: [
      "Make executable: chmod +x MouseTerm*.AppImage",
      "Run from terminal or double-click to launch",
    ],
  },
};

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
    const video = videoRef.current;
    const runway = runwayRef.current;
    if (!video || !runway) return;

    // Mobile unlock
    let unlocked = false;
    function unlock() {
      if (unlocked) return;
      unlocked = true;
      video.play().then(() => {
        video.pause();
        video.currentTime = 0;
      }).catch(() => { unlocked = false; });
      window.removeEventListener("touchstart", unlock);
    }
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
    video.addEventListener("canplaythrough", () => { unlocked = true; }, { once: true });

    const wordRefs = [word0Ref, word1Ref, word2Ref];
    let ticking = false;

    function onScroll() {
      if (!unlocked) unlock();
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

        // Header: reveal brand + background at unpin threshold
        const headerProgress = clamp01(
          (fraction - UNPIN_THRESHOLD) / 0.08
        );
        if (headerBrandRef.current) {
          headerBrandRef.current.style.opacity = String(headerProgress);
        }
        if (headerRef.current) {
          headerRef.current.style.backgroundColor = `rgba(0, 0, 0, ${headerProgress * 0.6})`;
          headerRef.current.style.backdropFilter = headerProgress > 0 ? `blur(${headerProgress * 4}px)` : '';
          headerRef.current.style.webkitBackdropFilter = headerProgress > 0 ? `blur(${headerProgress * 4}px)` : '';
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

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // initial position

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("touchstart", unlock);
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
        style={{ height: "500px" }}
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
                for Mice<sup ref={asteriskRef} className="absolute left-full top-0" style={{ opacity: 0 }}>*</sup>
              </span>
            </span>
            <p
              ref={footnoteRef}
              className="mt-3 text-lg"
              style={{ opacity: 0 }}
            >
              * supports (and teaches) tmux shortcuts
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
          <div className="mt-8 -mx-4 md:mx-0 aspect-video md:rounded-lg border-y md:border border-[var(--color-text)]/10 bg-[var(--color-text)]/5 flex items-center justify-center">
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
              <code className="text-sm bg-[var(--color-text)]/10 px-1.5 py-0.5 rounded">{"\\e[<0;x;yM"}</code>.
              And <code className="text-sm bg-[var(--color-text)]/10 px-1.5 py-0.5 rounded">Ctrl+C</code>{" "}
              doesn't copy; it asks your program to kill itself.
            </p>
            <p className="text-lg leading-relaxed opacity-70">
              MouseTerm lets you copy paste like a human, not a terminal.
            </p>
          </div>
          <div className="-mx-4 md:mx-0 aspect-video md:rounded-lg border-y md:border border-[var(--color-text)]/10 bg-[var(--color-text)]/5 flex items-center justify-center">
            <p className="text-sm opacity-40 italic">TODO: Copy/paste with line-break rewrap</p>
          </div>
        </section>

        {/* Section 3: image left, text right */}
        <section className="mx-auto max-w-5xl px-4 md:px-6 py-12 grid md:grid-cols-[3fr_2fr] gap-8 md:gap-12 items-start">
          <div className="-mx-4 md:mx-0 aspect-video md:rounded-lg border-y md:border border-[var(--color-text)]/10 bg-[var(--color-text)]/5 flex items-center justify-center order-2 md:order-1">
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

        <section id="download" className="mx-auto max-w-2xl px-4 md:px-6 py-20">
          <h2 className="font-display text-[clamp(1.5rem,2.5vw+0.5rem,2.25rem)] mb-8">Get MouseTerm</h2>

          <a
            href="/playground"
            className="inline-block px-6 py-3 rounded-md bg-[var(--color-caramel)] text-[var(--color-bg)] font-display text-lg hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150"
          >
            Try it in the Playground
          </a>

          <div className="mt-10 space-y-6">
            <div>
              <p className="text-lg opacity-70 mb-2">VS Code Extension</p>
              <div className="flex flex-wrap gap-2">
                <a href="https://marketplace.visualstudio.com/items?itemName=diffplug.mouseterm" className={PILL}>Visual Studio Marketplace</a>
                <a href="https://open-vsx.org/extension/diffplug/mouseterm" className={PILL}>Open VSX Registry</a>
              </div>
            </div>
            <div>
              <p className="text-lg opacity-70 mb-2">Standalone App</p>
              <div className="flex flex-wrap gap-2">
                {(["darwin-aarch64", "windows-x86_64", "linux-x86_64"] as const).map((key) => (
                  <a
                    key={key}
                    href={standaloneLatest.platforms[key].url}
                    onClick={() => setInstallGuide(key)}
                    className={`${PILL}${installGuide === key ? " bg-[var(--color-caramel)]/10 border-[var(--color-caramel)]/60" : ""}`}
                  >
                    {INSTALL_STEPS[key].pill}
                  </a>
                ))}
                <a href="https://github.com/diffplug/mouseterm/issues/8" className={PILL}>Other</a>
              </div>
              {installGuide && INSTALL_STEPS[installGuide] && (
                <div className="mt-3 rounded-md border border-[var(--color-text)]/10 bg-[var(--color-text)]/5 px-4 py-3">
                  <p className="text-base uppercase text-[var(--color-caramel)] mb-2">{INSTALL_STEPS[installGuide].title}</p>
                  <ol className="space-y-1 text-sm opacity-70">
                    {INSTALL_STEPS[installGuide].steps.map((step, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[var(--color-caramel)] shrink-0">{i + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          </div>
        </section>

        <footer className="border-t border-[var(--color-text)]/10 py-10">
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
