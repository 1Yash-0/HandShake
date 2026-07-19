"use client";

import { ReactNode, useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { useReducedMotion } from "./useReducedMotion";

type Props = {
  children: ReactNode;
  /** y offset in px at scroll progress = 1 (relative to start position) */
  y?: number;
  /** scale at scroll progress = 1 (1 = no scale) */
  scale?: number;
  /** opacity at scroll progress = 1 */
  opacity?: number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * Scroll-driven parallax depth layer for the hero. Per the approved motion spec,
 * the hero gets layered parallax: escrow-core recedes slowly, orbits fall away
 * faster, float-cards drift up + fade out. Different `y` per element creates
 * camera depth — the Stripe/Vercel hero signature.
 *
 * Under reduced-motion: render children static with no transforms.
 */
export function ParallaxLayer({
  children,
  y = 0,
  scale = 1,
  opacity = 1,
  className,
  style,
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    // scrub through the hero — starts when it enters, ends when it leaves
    offset: ["start start", "end start"],
  });

  const yMotion = useTransform(scrollYProgress, [0, 1], [0, y]);
  const scaleMotion = useTransform(scrollYProgress, [0, 1], [1, scale]);
  const opacityMotion = useTransform(scrollYProgress, [0, 1], [1, opacity]);

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      ref={ref}
      className={className}
      style={{
        ...style,
        y: yMotion,
        scale: scaleMotion,
        opacity: opacityMotion,
        willChange: "transform, opacity",
      }}
    >
      {children}
    </motion.div>
  );
}
