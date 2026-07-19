"use client";

import { useAccount } from "wagmi";
import { Wallet, Loader2, Inbox, ArrowUpRight, FileKey2 } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { AuthGate } from "@/components/AuthGate";
import { DealRow } from "@/components/DealRow";
import { useUserDeals } from "@/lib/useUserDeals";
import { useSession } from "@/lib/auth";
import { formatUsdc, DEAL_STATE_LABELS } from "@/lib/contract";

/**
 * Freelancer dashboard — `/freelancer`. Gated to logged-in freelancers.
 *
 * Shows:
 *   - a one-line summary (open work, total locked USDC owed to them,
 *     total paid out)
 *   - NO create-deal CTA — freelancers don't create deals, clients do
 *   - the freelancer's deal list, sorted with actionable states first
 *
 * The dashboard only surfaces freelancer-relevant flow. The create flow
 * lives at `/create` (client-only). The freelancer's primary action per deal
 * is "Encrypt & submit" (Funded state) at `/handoff/[id]`.
 */
export default function FreelancerDashboardPage() {
  return (
    <AuthGate role="freelancer">
      <FreelancerDashboard />
    </AuthGate>
  );
}

function FreelancerDashboard() {
  const session = useSession();
  const { address } = useAccount();
  const { freelancerDeals, isLoading } = useUserDeals(address);

  const open = freelancerDeals.filter((d) => d.state <= 2);
  const locked = open.filter((d) => d.state === 1).reduce((s, d) => s + d.amount, 0n);
  const paidOut = freelancerDeals
    .filter((d) => d.state === 3)
    .reduce((s, d) => s + d.amount, 0n);

  // Sort: actionable first (Funded → submit; UnderReview → wait; Created → wait),
  // then closed.
  const sorted = [...freelancerDeals].sort((a, b) => {
    const order = [1, 2, 0, 5, 3, 4, 6];
    return order.indexOf(a.state) - order.indexOf(b.state);
  });

  return (
    <>
      <Topbar />
      <main className="container dashboard">
        <div className="dashboard-head">
          <div>
            <div className="step-num">Freelancer dashboard</div>
            <h1 className="dashboard-title">
              Welcome back, <span>{shortAddr(session?.address ?? address ?? "")}</span>
            </h1>
            <p className="text-muted dashboard-lead">
              You&apos;re the freelancer on these deals. Encrypt and submit your deliverable, then
              wait for approval — or get paid automatically when the review window closes.
            </p>
          </div>
          <div className="dashboard-hint pill pill-blue">
            <Wallet size={12} /> Deals you&apos;re working on
          </div>
        </div>

        <div className="dashboard-stats">
          <Stat
            label="Open work"
            value={open.length.toString()}
            hint={open.length === 0 ? "No open deals" : "Awaiting action or approval"}
          />
          <Stat
            label="Locked for you"
            value={`${formatUsdc(locked)} USDC`}
            hint="In funded escrows — yours once approved"
          />
          <Stat
            label="Paid out"
            value={`${formatUsdc(paidOut)} USDC`}
            hint="Released to you across closed deals"
          />
        </div>

        <section className="dashboard-section">
          <div className="row-between mb-2">
            <h2 className="dashboard-section-title">
              <FileKey2 size={18} color="oklch(60% .15 115)" /> Your deals
            </h2>
            <span className="text-muted" style={{ fontSize: ".8125rem" }}>
              {freelancerDeals.length} total
            </span>
          </div>

          {isLoading && (
            <div className="row text-muted">
              <Loader2 size={16} className="animate-spin" /> Loading your deals…
            </div>
          )}

          {!isLoading && freelancerDeals.length === 0 && (
            <EmptyState
              icon={<Inbox size={28} />}
              title="No deals sent to you yet"
              body="When a client creates a deal with your address, it shows up here. Ask them for the /deal link, or to set you as the freelancer. Then connect with that same wallet to see it here."
            />
          )}

          {!isLoading && sorted.length > 0 && (
            <div className="deal-list">
              {sorted.map((d) => (
                <DealRow key={d.id.toString()} deal={d} perspective="freelancer" />
              ))}
            </div>
          )}
        </section>

        <section className="dashboard-section dashboard-section-soft">
          <h2 className="dashboard-section-title">
            <ArrowUpRight size={18} color="oklch(60% .15 115)" /> What a freelancer does here
          </h2>
          <ol className="dashboard-explainer">
            <li>
              <strong>Get a deal link.</strong> A client creates a deal with your wallet address and
              sends you the <code className="mono">/deal/&lt;id&gt;</code> link.
            </li>
            <li>
              <strong>Wait for funding.</strong> The deal has to be Funded before you can submit.
              The client page handles that — you just wait for the state to flip to Funded.
            </li>
            <li>
              <strong>Encrypt &amp; submit.</strong> Open the deal, hit{" "}
              <em>Encrypt &amp; submit deliverable</em>. A fresh AES key is generated in your
              browser, the file is encrypted, ciphertext goes to storage, the hash goes onchain.
            </li>
            <li>
              <strong>Get paid.</strong> The client approves → the contract pays you and releases
              the key to them. If they ghost past the review window, anyone can call{" "}
              <code className="mono">releaseAfterTimeout</code> and you still get paid.
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
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h3>{title}</h3>
      <p className="text-muted">{body}</p>
    </div>
  );
}

function shortAddr(a: string): string {
  if (!a) return "";
  if (a.length < 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
