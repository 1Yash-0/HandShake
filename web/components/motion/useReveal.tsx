"use client";

import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

/**
 * useReveal — one-shot scroll-triggered reveal variants for the landing page.
 *
 * Why a hook (not a component): the landing page wraps many different elements
 * (trust items, flow steps, rule cards) in `motion.div` and each needs the
 * SAME viewport-trigger behavior but a DIFFERENT motion (per impeccable's
 * skill-motion-no-section-fade rule — every reveal fits what it reveals, no
 * uniform reflex). This hook returns the shared viewport + reduced-motion
 * plumbing; the caller picks the variant and the stagger index.
 *
 * Variants:
 *   - "clip"   — bottom wipe: clip-path inset(0 0 100% 0) → inset(0 0 0 0).
 *                Used on the trust strip items — reads as "rising into view".
 *   - "stamp"  — scale .96 + rotate -1deg → 1 + 0. The neo-brutalist stamp.
 *                Used on flow steps — matches their offset-shadow surfaces.
 *   - "fan"    — directional x slide: cards enter from their column side.
 *                Used on the rules grid — left cards from x:-24, right from x:24.
 *                The caller passes `dir` ("left" | "right") to pick the side.
 *   - "rise"   — plain y:16→0 + opacity 0→1. The fallback for elements that
 *                just need to appear (CTA copy).
 *
 * All exit states are the identity (no exit motion — exit animations on scroll
 * back up are janky and pointless on a landing page).
 *
 * Reduced-motion: returns { ref, style: undefined, variants: undefined, noMotion: true }
 * so the caller can render a plain div with no transform. The ref still works.
 *
 * Usage:
 *   const reveal = useReveal("stamp", { delay: i * 0.11 });
 *   return <motion.div ref={reveal.ref} variants={reveal.variants} initial="hidden"
 *     animate={reveal.inView ? "show" : "hidden"} ... />
 *
 * Or simpler: use the Reveal component exported below — it wraps the common case.
 */

type RevealVariant = "clip" | "stamp" | "fan" | "rise";

// framer-motion's `useInView` `margin` option is a constrained template-
// literal type (MarginType), not a free `string`. framer-motion doesn't
// export MarginType publicly, so we mirror it here — any caller-supplied
// margin must be of the form "<num>px|% [ <num>px|% ... ]" up to 4 sides.
type MarginValue = `${number}${"px" | "%"}`;
type MarginType =
  | MarginValue
  | `${MarginValue} ${MarginValue}`
  | `${MarginValue} ${MarginValue} ${MarginValue}`
  | `${MarginValue} ${MarginValue} ${MarginValue} ${MarginValue}`;

type UseRevealOptions = {
  /** delay in seconds before the reveal fires (for stagger) */
  delay?: number;
  /** for "fan" only: which side the element enters from */
  dir?: "left" | "right";
  /** viewport margin — how early the reveal triggers. Default: "-10% 0px -10% 0px" */
  margin?: MarginType;
  /** run once (default true — re-triggering on scroll back up is janky) */
  once?: boolean;
};

const EASE = [0.16, 1, 0.3, 1] as const; // --ease, cubic-bezier(.16,1,.3,1)
const DURATION = 0.6;

function buildVariants(variant: RevealVariant, delay: number, dir?: "left" | "right"): Variants {
  const xFan = dir === "right" ? 24 : -24;
  switch (variant) {
    case "clip":
      return {
        hidden: { clipPath: "inset(0 0 100% 0)", opacity: 0 },
        show: {
          clipPath: "inset(0 0 0 0)",
          opacity: 1,
          transition: { duration: DURATION, ease: EASE, delay },
        },
      };
    case "stamp":
      return {
        hidden: { scale: 0.96, rotate: -1, opacity: 0 },
        show: {
          scale: 1,
          rotate: 0,
          opacity: 1,
          transition: { duration: DURATION, ease: EASE, delay },
        },
      };
    case "fan":
      return {
        hidden: { x: xFan, opacity: 0 },
        show: {
          x: 0,
          opacity: 1,
          transition: { duration: DURATION, ease: EASE, delay },
        },
      };
    case "rise":
    default:
      return {
        hidden: { y: 16, opacity: 0 },
        show: {
          y: 0,
          opacity: 1,
          transition: { duration: DURATION, ease: EASE, delay },
        },
      };
  }
}

export function useReveal(variant: RevealVariant, options: UseRevealOptions = {}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { delay = 0, margin = "-10% 0px -10% 0px", once = true } = options;
  // `once` defaults true — re-triggering on scroll-back is janky on a landing page.
  // `margin` triggers slightly before the element is fully in view so the reveal
  // reads as arriving with the reader, not after.
  const inView = useInView(ref, { margin, once });

  if (reduce) {
    // Reduced-motion: no transform, no clip-path. The caller should render a
    // plain div. We expose `noMotion: true` so they can branch.
    return { ref, inView: true, noMotion: true, variants: undefined as Variants | undefined };
  }

  return {
    ref,
    inView,
    noMotion: false,
    variants: buildVariants(variant, delay, options.dir),
  };
}

/**
 * Reveal — the common-case wrapper. Use this when you just want to wrap an
 * element in a reveal motion without manually threading ref/variants/initial/animate.
 *
 *   <Reveal variant="stamp" delay={0.11}><FlowStep ... /></Reveal>
 *
 * For cases where you need to spread motion props onto an existing motion element
 * (or compose with other motion), use the hook directly.
 */
export function Reveal({
  variant,
  delay,
  dir,
  margin,
  once,
  className,
  children,
}: {
  variant: RevealVariant;
  delay?: number;
  dir?: "left" | "right";
  margin?: MarginType;
  once?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  // Destructure (rather than `reveal.*` access) so the react-hooks/refs lint
  // rule can track `ref` as the ref object and the other fields as plain
  // values — otherwise it flags every property access on the returned object
  // because it can't prove `inView`/`variants` aren't refs.
  const { ref, inView, noMotion, variants } = useReveal(variant, { delay, dir, margin, once });

  if (noMotion) {
    return (
      <div className={className} ref={ref}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      variants={variants}
      initial="hidden"
      animate={inView ? "show" : "hidden"}
      // will-change hints for the properties each variant animates — keeps the
      // compositor on a separate layer for the duration of the tween.
      style={{
        willChange:
          variant === "clip" ? "clip-path, opacity" :
          variant === "stamp" ? "transform, opacity" :
          variant === "fan" ? "transform, opacity" :
          "transform, opacity",
      }}
    >
      {children}
    </motion.div>
  );
}
