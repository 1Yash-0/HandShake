"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Plus, Briefcase, Loader2, Inbox, ArrowUpRight } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { AuthGate } from "@/components/AuthGate";
import { DealRow } from "@/components/DealRow";
import { useUserDeals } from "@/lib/useUserDeals";
import { useSession } from "@/lib/auth";
import { formatUsdc, DEAL_STATE_LABELS } from "@/lib/contract";

/**
 * Client dashboard — `/client`. Gated to logged-in clients by <AuthGate>.
 *
 * Shows:
 *   - a one-line summary (number of deals, total USDC in flight)
 *   - the primary CTA: "Create a deal" (clients create; freelancers don't)
 *   - the client's deal list, sorted with actionable states first
 *
 * The dashboard only surfaces client-relevant flow. The freelancer handoff
 * lives at `/freelancer`. Both sides share `/deal/[id]` but that page leads
 * with the role's primary action.
 */
export default function ClientDashboardPage() {
  return (
    <AuthGate role="client">
      <ClientDashboard />
    </AuthGate>
  );
}

function ClientDashboard() {
  const session = useSession();
  const { address } = useAccount();
  const { clientDeals, isLoading } = useUserDeals(address);

  const inFlight = clientDeals.filter((d) => d.state <= 2);
  const inFlightTotal = inFlight.reduce((sum, d) => sum + d.amount, 0n);
  const closed = clientDeals.filter((d) => d.state >= 3);

  // Sort: actionable first (Created, Funded, UnderReview), then closed.
  const sorted = [...clientDeals].sort((a, b) => {
    const order = [0, 1, 2, 5, 3, 4, 6];
    return order.indexOf(a.state) - order.indexOf(b.state);
  });

  return (
    <>
      <Topbar />
      <main className="container dashboard">
        <div className="dashboard-head">
          <div>
            <div className="step-num">Client dashboard</div>
            <h1 className="dashboard-title">
              Welcome back, <span>{shortAddr(session?.address ?? address ?? "")}</span>
            </h1>
            <p className="text-muted dashboard-lead">
              You&apos;re the client on these deals. Create a new one, fund an escrow, or unlock an
              approved original.
            </p>
          </div>
          <Link className="btn btn-blue" href="/create">
            <Plus size={16} /> Create a deal
          </Link>
        </div>

        <div className="dashboard-stats">
          <Stat
            label="Open deals"
            value={inFlight.length.toString()}
            hint={inFlight.length === 0 ? "No deals in progress" : "Awaiting your action"}
          />
          <Stat
            label="In flight"
            value={`${formatUsdc(inFlightTotal)} USDC`}
            hint="Locked in escrow across open deals"
          />
          <Stat
            label="Closed"
            value={closed.length.toString()}
            hint="Released, refunded, or resolved"
          />
        </div>

        <section className="dashboard-section">
          <div className="row-between mb-2">
            <h2 className="dashboard-section-title">
              <Briefcase size={18} color="var(--blue)" /> Your deals
            </h2>
            <span className="text-muted" style={{ fontSize: ".8125rem" }}>
              {clientDeals.length} total
            </span>
          </div>

          {isLoading && (
            <div className="row text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading your deals…
            </div>
          )}

          {!isLoading && clientDeals.length === 0 && (
            <EmptyState
              icon={<Inbox size={28} />}
              title="No deals yet"
              body="Create your first deal — pick a freelancer, set the terms, lock the USDC. The freelancer gets a shareable link to encrypt and submit the deliverable."
              cta={
                <Link className="btn btn-blue" href="/create">
                  <Plus size={16} /> Create your first deal
                </Link>
              }
            />
          )}

          {!isLoading && sorted.length > 0 && (
            <div className="deal-list">
              {sorted.map((d) => (
                <DealRow key={d.id.toString()} deal={d} perspective="client" />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-section dashboard-section-soft">
          <h2 className="dashboard-section-title">
            <ArrowUpRight size={18} color="var(--blue)" /> What a client does here
          </h2>
          <ol className="dashboard-explainer">
            <li>
              <strong>Create a deal.</strong> Pick a freelancer address, set amount, deadline, and
              review window. Two transactions: approve USDC, then create the deal.
            </li>
            <li>
              <strong>Fund the escrow.</strong> The deal page lets you call{" "}
              <code className="mono">fundDeal</code> — your USDC moves into the contract.
            </li>
            <li>
              <strong>Review &amp; approve.</strong> When the freelancer submits, you review the
              preview and call <code className="mono">approveDeal</code>. Payment releases to them;
              the decryption key unlocks to you.
            </li>
            <li>
              <strong>Unlock the original.</strong> Fetch the AES key from the gate (only opens
              when the chain says <code className="mono">Released</code>) and decrypt in-browser.
            </li>
          </ol>
          <p className="text-muted" style={{ fontSize: ".8125rem", marginTop: 12 }}>
            States you can see: {Object.values(DEAL_STATE_LABELS).join(", ")}.
            Disputes and refunds live in the contract — open the deal page for the next action.
          </p>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="dash-stat">
      <span className="dash-stat-label">{label}</span>
      <strong className="dash-stat-value tabular">{value}</strong>
      <span className="dash-stat-hint text-muted">{hint}</span>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p className="text-muted">{body}</p>
      {cta}
    </div>
  );
}

function shortAddr(a: string): string {
  if (!a) return "";
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
