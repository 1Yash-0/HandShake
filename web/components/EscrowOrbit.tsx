"use client";

import { useEffect, useRef } from "react";
import { LockKeyhole, FileKey2, CheckCircle2, ShieldCheck } from "lucide-react";
import { ParallaxLayer } from "@/components/motion/ParallaxLayer";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

/**
 * The hero's escrow orbit visual — central "125 USDC" disk with two dashed
 * orbit rings and three floating status cards.
 *
 * Two motion layers compose:
 *   1. CSS keyframe animations (orbit rotate, float bob, coreIn entrance) —
 *      always on unless reduced-motion globally overrides.
 *   2. Scroll-driven parallax depth via ParallaxLayer (Framer Motion useScroll).
 *      Per the spec: core recedes slowest (y:60, scale:.92), outer orbit falls
 *      faster (y:120), inner orbit slightly slower (y:90 — inverts the natural
 *      assumption for more depth), float-cards drift up + fade (y:160, opacity:0).
 *      ParallaxLayer gates on reduced-motion itself, so under reduced-motion
 *      the hero is a clean static composition.
 *
 * Count-up: see EscrowPrice — extracted into a leaf component so the rAF tick
 * writes to a ref (no setState in effect, no risk of a parent re-render
 * reconciling the JSX back to "0").
 */
export function EscrowOrbit() {
  return (
    <div className="handoff-stage" aria-label="Payment and encrypted file meet in escrow">
      <ParallaxLayer y={120} className="orbit-wrap">
        <div className="orbit one" />
      </ParallaxLayer>
      <ParallaxLayer y={90} className="orbit-wrap">
        <div className="orbit two" />
      </ParallaxLayer>

      <ParallaxLayer y={60} scale={0.92} className="core-wrap">
        <div className="escrow-core">
          <div>
            <div style={{ display: "grid", placeItems: "center", marginBottom: 8 }}>
              <LockKeyhole size={24} color="var(--lime)" />
            </div>
            <div className="core-label">Funds locked</div>
            <EscrowPrice />
            <div className="core-unit">USDC</div>
          </div>
        </div>
      </ParallaxLayer>

      <ParallaxLayer y={160} opacity={0} className="float-card fc-1">
        <CheckCircle2 size={16} className="icon" />
        <div>
          <strong>Client funded</strong>
          <div style={{ fontSize: ".75rem", color: "var(--muted)" }}>Transaction confirmed</div>
        </div>
      </ParallaxLayer>

      <ParallaxLayer y={160} opacity={0} className="float-card fc-2">
        <ShieldCheck size={16} className="icon" />
        <div>
          <strong>Brand kit ready</strong>
          <div style={{ fontSize: ".75rem", color: "var(--muted)" }}>Encrypted in browser</div>
        </div>
      </ParallaxLayer>

      <ParallaxLayer y={160} opacity={0} className="float-card fc-3">
        <FileKey2 size={16} className="icon" />
        <div>
          <strong>Original protected</strong>
          <div style={{ fontSize: ".75rem", color: "var(--muted)" }}>Key not released</div>
        </div>
      </ParallaxLayer>
    </div>
  );
}

/**
 * The animated "125" price inside the escrow core.
 *
 * Implementation: the rAF tick writes directly to the span's textContent via a
 * ref — no React state, so the `react-hooks/set-state-in-effect` rule doesn't
 * fire, and a parent re-render can't reconcile the JSX back to "0" (this leaf
 * has no state and only static props, so it never re-renders after mount).
 *
 * Per the spec: 0 → 125, power3.out, 1.6s, 400ms delay so the coreIn scale
 * entrance lands first, one-shot. Under reduced-motion: render "125" with no rAF.
 */
function EscrowPrice() {
  const reduce = useReducedMotion();
  const spanRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const span = spanRef.current;
    if (!span) return;

    if (reduce) {
      span.textContent = "125";
      return;
    }

    // one-shot count-up, 0 → 125, ease power3.out, 1.6s
    const duration = 1600;
    const startTime = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // power3.out

    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      span.textContent = String(Math.round(ease(t) * 125));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    // delay 400ms so the coreIn scale entrance lands first
    const timeout = setTimeout(() => {
      rafRef.current = requestAnimationFrame(tick);
    }, 400);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(timeout);
    };
  }, [reduce]);

  return (
    <div className="core-price tabular" ref={spanRef}>
      0
    </div>
  );
}
