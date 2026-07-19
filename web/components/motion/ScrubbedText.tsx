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
 *   blur      — words start blurred + dim, sharpen left-to-right as you scroll
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
        const start = 0.1 + (i / words.length) * 0.4;
        const end = start + 0.12;
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

/** Single word with its own blur-sharpen scrubbed to scroll progress. */
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
  const blur = useTransform(progress, [start, end], [6, 0]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  const opacity = useTransform(progress, [start, end], [0.35, 1]);
  return (
    <motion.span
      style={{
        display: "inline-block",
        filter,
        opacity,
        willChange: "filter, opacity",
        marginRight: isLast ? 0 : "0.25em",
      }}
    >
      {word}
    </motion.span>
  );
}
