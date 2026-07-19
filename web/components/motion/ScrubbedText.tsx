"use client";

import { useMemo, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

type Personality = "blur" | "clip" | "underline";

type Props = {
  children: string;
  personality: Personality;
  /** element to render as — defaults to h2 */
  as?: "h2" | "h3";
  className?: string;
};

/**
 * Scroll-scrubbed text reveal, per-section personality. Cures the
 * "uniform fade-up on every section" tell from impeccable's
 * skill-motion-no-section-fade rule.
 *
 *   blur      — words start slightly blurred + dim, sharpen left-to-right as
 *               you scroll, with a tiny lift (y:4→0). Reads as "focus" not
 *               "appear": words are present at the start, just not in focus.
 *               Polished timings: blur 4px→0, opacity 0.55→1, scrub width 0.18
 *               (slower, more deliberate), scrub range 0.05→0.62 (starts
 *               earlier, lands later — feels driven by the reader's scroll,
 *               not rushed), ease-out-quart on blur+opacity+y (exponential).
 *
 *   clip      — clip-path wipe from inset(0 100% 0 0) → inset(0 0 0 0)
 *   underline — fades in normally, but a 2px accent line draws scaleX(0)→1
 *
 * All three are scrubbed to scroll progress through the section — they read as
 * the reader's scroll *causing* the reveal, not a one-shot animation on enter.
 *
 * Under reduced-motion: render the raw text with no spans, no transforms.
 *
 * Hooks note: every useTransform is called unconditionally at the top so the
 * react-hooks/rules-of-hooks rule holds regardless of which personality branch
 * renders. Calling a hook and not consuming its value is fine; calling it
 * after an early return is the violation.
 */

// ease-out-quart — exponential, per impeccable's motion rule. Maps a linear
// 0..1 scrub progress to an eased 0..1 so the reveal front-loads the change
// and decelerates into the final state (premium feel vs linear scrub).
const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

export function ScrubbedText({
  children,
  personality,
  as = "h2",
  className,
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // Framer's default offset ["start end", "end start"] scrubs the element
    // across the full viewport — exactly what we want.
  });

  const words = useMemo(() => children.split(" "), [children]);
  const Tag = as as "h2";

  // All personality transforms, declared up-front so hooks rules hold.
  const clipPath = useTransform(
    scrollYProgress,
    [0, 0.6],
    ["inset(0 100% 0 0)", "inset(0 0 0 0)"],
  );
  const underlineScaleX = useTransform(scrollYProgress, [0.1, 0.5], [0, 1]);

  if (reduce) {
    return (
      <Tag className={className} ref={ref}>
        {children}
      </Tag>
    );
  }

  if (personality === "clip") {
    // Single clip-path wipe on the whole headline — words appear left-to-right
    // as the wipe uncovers them. Strong, single motion.
    return (
      <motion.div ref={ref} style={{ clipPath: clipPath, willChange: "clip-path" }}>
        <Tag className={className}>{children}</Tag>
      </motion.div>
    );
  }

  if (personality === "underline") {
    // Headline fades in as normal via the parent's reveal, but a 2px accent line
    // draws under it left-to-right, scrubbed. Underline is a separate motion div.
    return (
      <div ref={ref}>
        <Tag className={className}>{children}</Tag>
        <motion.div
          aria-hidden
          style={{
            scaleX: underlineScaleX,
            transformOrigin: "left center",
            height: 2,
            background: "var(--blue)",
            marginTop: 12,
            width: "100%",
            willChange: "transform",
          }}
        />
      </div>
    );
  }

  // personality === "blur" — per-word blur-sharpen via WordReveal children.
  // Each child is its own component instance with its own hooks, so the
  // per-word useTransform calls inside WordReveal are rules-safe.
  return (
    <Tag className={className} ref={ref}>
      {words.map((word, i) => {
        // Polished scrub range: start at 0.05 + (i/words.length)*0.57, width 0.18.
        // Was 0.1 + (i/words.length)*0.4, width 0.12. The new range covers 0.05→0.62
        // so the reveal starts earlier (as the section enters) and lands later
        // (just past mid-scroll) — reads as driven by the reader's scroll, not
        // finished before they arrive.
        const start = 0.05 + (i / words.length) * 0.57;
        const end = start + 0.18;
        return (
          <WordReveal
            key={i}
            word={word}
            start={start}
            end={end}
            progress={scrollYProgress}
            isLast={i === words.length - 1}
          />
        );
      })}
    </Tag>
  );
}

type ScrollProgress = ReturnType<typeof useScroll>["scrollYProgress"];

/** Single word with its own blur-sharpen + lift scrubbed to scroll progress. */
function WordReveal({
  word,
  start,
  end,
  progress,
  isLast,
}: {
  word: string;
  start: number;
  end: number;
  progress: ScrollProgress;
  isLast: boolean;
}) {
  // Two-stage transform: linear scrub progress → 0..1 → eased → final values.
  // The eased stage applies ease-out-quart so the sharpen front-loads and
  // decelerates into focus (premium vs a linear scrub).
  const eased = useTransform(progress, [start, end], [0, 1]);
  const easedOut = useTransform(eased, easeOutQuart);

  const blur = useTransform(easedOut, [0, 1], [4, 0]);         // was 6 → 4
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  const opacity = useTransform(easedOut, [0, 1], [0.55, 1]);   // was 0.35 → 0.55
  const y = useTransform(easedOut, [0, 1], [4, 0]);            // NEW: tiny lift
  return (
    <motion.span
      style={{
        display: "inline-block",
        filter,
        opacity,
        y,
        willChange: "filter, opacity, transform",
        marginRight: isLast ? 0 : "0.25em",
      }}
    >
      {word}
    </motion.span>
  );
}
