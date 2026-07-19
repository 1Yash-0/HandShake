"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe reduced-motion gate via useSyncExternalStore — the canonical React
 * 19 way to subscribe to a browser media query. Returns true when the user has
 * `prefers-reduced-motion: reduce` set.
 *
 * All motion components gate on this — under reduced-motion, we render
 * children static and never construct a Lenis instance or a Framer Motion
 * transform. The motion spec mandates a *structural* gate (return early before
 * creating any tween), not a CSS opacity override — Framer Motion writes inline
 * styles that would beat the CSS fallback, so we never start the motion.
 *
 * On the server, returns false (no way to know the user's preference; the
 * client will hydrate to the right value on first paint).
 */
const reduceMotionQuery = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(reduceMotionQuery);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(reduceMotionQuery).matches;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
