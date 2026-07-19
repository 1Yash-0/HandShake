"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Coins, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  DEAL_STATE_LABELS,
  formatUsdc,
} from "@/lib/contract";
import { addressLink } from "@/lib/monad";
import type { DealSummary } from "@/lib/useUserDeals";

/**
 * One row in a role dashboard's deal list. Shared between client and
 * freelancer dashboards — the `perspective` prop tweaks the secondary copy
 * ("You're the client" vs "You're the freelancer") so the same deal reads
 * differently from each side without duplicating the row component.
 *
 * Anti-slop: not a card. A row with a leading state pill, terms, and a
 * trailing link. Reads as a list, not a grid of identical cards.
 */
export function DealRow({
  deal,
  perspective,
}: {
  deal: DealSummary;
  perspective: "client" | "freelancer";
}) {
  const stateClass = STATE_PILL[deal.state] ?? "pill-gray";

  // Memoize the Date object so its identity is stable across renders —
  // otherwise every render constructs a new Date and any child effect that
  // depends on it would re-fire.
  const deadline = useMemo(() => new Date(Number(deal.deadline) * 1000), [deal.deadline]);

  // `Date.now()` is impure and must not run during render (React 19 purity
  // rule + SSR/hydration mismatch). We subscribe to a coarse 60s tick via
  // useSyncExternalStore: the snapshot is the current wall-clock time, and
  // the server snapshot is 0 so SSR renders "not past deadline" deterministically.
  // The row is a list item, not a live countdown — 60s granularity is plenty,
  // and the contract is the source of truth on deadline enforcement anyway.
  const now = useSyncExternalStore(
    subscribeNowTick,
    getNowSnapshot,
    getNowServerSnapshot,
  );
  const pastDeadline = now > deadline.getTime();

  const counterpart =
    perspective === "client"
      ? { label: "Freelancer", address: deal.freelancer }
      : { label: "Client", address: deal.client };

  const nextAction = nextActionFor(deal.state, perspective, pastDeadline);

  // The row is a clickable <div>, not a <Link>/<a>, because the row contains a
  // nested <a> to the explorer. HTML forbids <a> inside <a> — React hydration
  // catches it and the browser mis-renders the DOM. We preserve keyboard
  // accessibility (role/tabIndex/Enter/Space) and let the inner <a> keep its
  // real anchor semantics (right-click → open in new tab).
  const router = useRouter();
  const dealHref = `/deal/${deal.id.toString()}`;
  const goToDeal = () => router.push(dealHref);

  return (
    <div
      className="deal-row"
      role="link"
      tabIndex={0}
      onClick={goToDeal}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDeal();
        }
      }}
    >
      <div className="deal-row-main">
        <div className="row" style={{ gap: 10 }}>
          <span className={`pill ${stateClass}`}>
            <span className="pill-dot" /> {DEAL_STATE_LABELS[deal.state]}
          </span>
          <span className="deal-row-id mono">Deal #{deal.id.toString()}</span>
        </div>
        <div className="deal-row-terms">
          <span className="deal-row-amount">
            <Coins size={13} /> {formatUsdc(deal.amount)} USDC
          </span>
          <span className={`deal-row-deadline ${pastDeadline ? "text-red" : "text-muted"}`}>
            <Clock size={13} />
            {deadline.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{" "}
            {deadline.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
            {pastDeadline && deal.state < 3 && " · past deadline"}
          </span>
        </div>
        <div className="deal-row-counterpart">
          <span className="text-muted">{counterpart.label}:</span>
          <a
            href={addressLink(counterpart.address)}
            target="_blank"
            rel="noreferrer"
            className="mono tl-link"
            onClick={(e) => e.stopPropagation()}
          >
            {counterpart.address.slice(0, 8)}…{counterpart.address.slice(-6)}
          </a>
        </div>
      </div>
      <div className="deal-row-aside">
        {nextAction ? (
          <>
            <span className="deal-row-next">{nextAction.label}</span>
            <ArrowUpRight size={14} />
          </>
        ) : (
          <span className="deal-row-done text-muted">
            <CheckCircle2 size={13} /> Closed
          </span>
        )}
      </div>
    </div>
  );
}

/** Map (state, perspective, pastDeadline) → the next thing the user does. */
function nextActionFor(
  state: number,
  perspective: "client" | "freelancer",
  pastDeadline: boolean,
): { label: string } | null {
  // Created
  if (state === 0) {
    return perspective === "client"
      ? { label: "Fund escrow" }
      : { label: "Awaiting funding" };
  }
  // Funded
  if (state === 1) {
    if (pastDeadline) {
      return perspective === "client"
        ? { label: "Claim refund" }
        : { label: "Deadline passed" };
    }
    return perspective === "client"
      ? { label: "Waiting on deliverable" }
      : { label: "Encrypt & submit" };
  }
  // UnderReview
  if (state === 2) {
    return perspective === "client"
      ? { label: "Approve or dispute" }
      : { label: "Awaiting approval" };
  }
  // Released
  if (state === 3) {
    return perspective === "client"
      ? { label: "Unlock original" }
      : { label: "Paid out" };
  }
  // Refunded / Disputed / Resolved — terminal
  return null;
}

const STATE_PILL: Record<number, string> = {
  0: "pill-gray",
  1: "pill-blue",
  2: "pill-amber",
  3: "pill-green",
  4: "pill-gray",
  5: "pill-red",
  6: "pill-gray",
};

/**
 * useSyncExternalStore plumbing for a coarse 60s wall-clock tick.
 *
 * - subscribe: registers a setInterval, notifies React on each tick, cleans
 *   up on unmount. The interval is shared across all subscribers (one timer
 *   per mount) — fine for a dashboard with a handful of rows.
 * - getSnapshot: returns the current wall-clock ms. React compares with
 *   Object.is, so a new value each tick triggers a re-render of subscribers.
 * - getServerSnapshot: returns 0 so SSR renders "not past deadline"
 *   deterministically — the client hydrates to the real clock on first paint.
 */
const TICK_MS = 60_000;
function subscribeNowTick(notify: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const id = setInterval(notify, TICK_MS);
  return () => clearInterval(id);
}
function getNowSnapshot(): number {
  return Date.now();
}
function getNowServerSnapshot(): number {
  return 0;
}

export { AlertTriangle }; // re-export for tree-shaking convenience in callers
