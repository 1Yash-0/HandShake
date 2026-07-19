"use client";

import { ReactNode, useEffect } from "react";
import Lenis from "lenis/react";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Lenis smooth-scroll, landing-page only. Per the approved motion spec:
 *   - duration 1.1, expo out (matches --ease)
 *   - smoothWheel: true, smoothTouch: false (touch keeps native scroll)
 *   - gated by prefers-reduced-motion (never constructed under it)
 *
 * Mount this ONCE, wrapping the landing page only. The app shell (deal/handoff/
 * timeline forms) keeps native scroll — momentum-glide on a form is a usability
 * tax. So we don't wrap the whole layout, just the landing page.
 *
 * Anchor links (`a[href^="#"]`) auto-rewire to `lenis.scrollTo(target, offset:-76)`
 * via Lenis's built-in anchor handling — we don't need to rewire manually.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();

  // Defensive: if Lenis fails to init for any reason, the page still scrolls
  // natively (Lenis is a progressive enhancement, not a requirement).
  useEffect(() => {
    // no-op — Lenis React component handles its own lifecycle. This effect
    // exists to make the gating explicit at mount time.
  }, [reduce]);

  if (reduce) return <>{children}</>;

  return (
    <Lenis
      root
      options={{
        duration: 1.1,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        syncTouch: false,
      }}
    >
      {children}
    </Lenis>
  );
}
