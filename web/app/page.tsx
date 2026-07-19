"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Radio,
  LockKeyhole,
  ShieldCheck,
  Zap,
  Code,
  ScrollText,
  CircleDollarSign,
  FileKey2,
  BadgeCheck,
  AlertTriangle,
  Clock,
  Users,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EscrowOrbit } from "@/components/EscrowOrbit";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { ScrubbedText } from "@/components/motion/ScrubbedText";
import { useSession } from "@/lib/auth";

/**
 * Landing page — ported from prototype.html with the A2 slop fixes:
 *   - hero h1 tracking relaxed to -.02em (was -.075em)
 *   - one brand kicker (the hero eyebrow); other sections use a numbered cadence
 *   - rules grid uses varied sizes (1.4fr 1fr 1fr, one tall card)
 *   - cards: border, no shadow (no ghost-cards)
 *
 * CTAs are real links to /create, not `data-enter-app` stubs.
 */
export default function LandingPage() {
  const session = useSession();
  // Logged-in users get a direct link to their dashboard as the primary CTA.
  const primaryHref = session ? `/${session.role}` : "/login";
  const primaryLabel = session
    ? session.role === "client"
      ? "Go to your deals"
      : "Go to your work"
    : "Sign in to start";
  const secondaryHref = "/create";
  const secondaryLabel = "Try it →";

  return (
    <SmoothScroll>
      <Topbar />
      <main>
        {/* ──────────────────────────────────────────────────────────── hero */}
        <section className="container hero" id="top">
          <div className="hero-copy">
            <div className="eyebrow">Protected digital handoffs</div>
            <h1>
              Get paid.
              <br />
              <span>Keep control.</span>
            </h1>
            <p className="hero-lead">
              Turn a deal from Discord, WhatsApp, or email into a protected handoff. Payment locks first.
              The original unlocks after approval.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-blue" href={primaryHref}>
                {primaryLabel}
                <ArrowRight size={16} />
              </Link>
              <Link className="btn btn-soft" href={secondaryHref}>
                {secondaryLabel}
              </Link>
            </div>
            <div className="row text-muted" style={{ fontSize: ".875rem", gap: 9 }}>
              <Radio size={14} color="var(--green)" />
              Live escrow on Monad testnet
            </div>
          </div>
          <EscrowOrbit />
        </section>

        {/* ────────────────────────────────────────────────────── trust strip */}
        <div className="container">
          <div className="trust-strip">
            <TrustItem icon={<ShieldCheck size={18} />} title="Escrow by code">
              USDC locked in a Monad contract. No platform holds your money.
            </TrustItem>
            <TrustItem icon={<LockKeyhole size={18} />} title="Encrypted handoff">
              File encrypted in the browser. Only its hash goes onchain.
            </TrustItem>
            <TrustItem icon={<Zap size={18} />} title="Auto-release">
              If the client ghosts after delivery, the freelancer is paid on timeout.
            </TrustItem>
            <TrustItem icon={<Code size={18} />} title="Verified source">
              Contracts verified on MonadVision and Monadscan — read them yourself.
            </TrustItem>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────── problem/versus */}
        <section className="container section" id="problem">
          <div className="problem">
            <div className="section-head">
              <div className="step-num">01 — The trust gap</div>
              <ScrubbedText personality="blur">Stop choosing who takes the risk.</ScrubbedText>
              <p className="text-muted">
                Today, one party eats the downside. The client pays upfront and hopes the work lands.
                Or the freelancer ships first and hopes the invoice gets paid. Handshake makes the
                contract hold the risk instead.
              </p>
            </div>
            <div className="versus">
              <div className="versus-card bad">
                <h3>Without Handshake</h3>
                <p>
                  Pay-then-pray. Client sends $125 to a stranger on Discord, hopes for the file. If the
                  freelancer ghosts, the client is out the money with no recourse.
                </p>
              </div>
              <div className="versus-card bad">
                <h3>Or ship-and-pray</h3>
                <p>
                  Freelancer sends the source first. Client can take the work and block them. The
                  freelancer eats the loss and loses leverage the moment the file leaves.
                </p>
              </div>
              <div className="versus-card good">
                <h3>With Handshake</h3>
                <p>
                  Payment locks in escrow first. The freelancer sends an encrypted file — the client
                  sees a preview, never the source. Approve, and the contract releases both: money to
                  the freelancer, key to the client.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────────────────────────────────────────────── how/flow */}
        <section className="section" id="how" style={{ background: "var(--surface-2)" }}>
          <div className="container">
            <div className="section-head">
              <div className="step-num">02 — One deal, four moves</div>
              <ScrubbedText personality="clip">Escrow meets encrypted delivery.</ScrubbedText>
              <p className="text-muted">
                The chain handles money and deadlines. The browser protects the file. Humans handle
                subjective quality.
              </p>
            </div>
            <div className="flow">
              <FlowStep num="01" icon={<ScrollText size={28} />} title="Agree on the terms">
                Project, price, deadline, review window, arbiter.
              </FlowStep>
              <FlowStep num="02" icon={<CircleDollarSign size={28} />} title="Lock the payment">
                125 test USDC enters the Monad escrow contract.
              </FlowStep>
              <FlowStep num="03" icon={<FileKey2 size={28} />} title="Encrypt the original">
                The client sees a preview, never the readable source.
              </FlowStep>
              <FlowStep num="04" icon={<BadgeCheck size={28} />} title="Approve and unlock">
                Payment releases. The client receives the decryption key.
              </FlowStep>
            </div>
            <div className="row-between mt-4">
              <span className="text-muted">
                No marketplace. No bidding. No 20% platform cut.
              </span>
              <Link className="btn btn-lime" href="/create">
                Try the handoff
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────── edge/rules */}
        <section className="container section" id="rules">
          <div className="section-head">
            <div className="step-num">03 — Rules, not promises</div>
            <ScrubbedText personality="underline">Built for the awkward outcomes.</ScrubbedText>
            <p className="text-muted">
              Most deals go smoothly. The ones that don&apos;t are why Handshake exists. Every edge
              case has a defined resolution written into the contract.
            </p>
          </div>
          <div className="rules-grid">
            <div className="rule-case tall">
              <span className="tag tag-amber">Client ghosts</span>
              <h3>Auto-release after review window</h3>
              <p>
                The freelancer submits the encrypted deliverable. The client has a review window
                (e.g. 48 hours). If they never respond, anyone can call{" "}
                <code className="mono text-blue">releaseAfterTimeout</code> and the contract pays the
                freelancer. Ghosting does not block payment.
              </p>
              <p style={{ marginTop: 12 }}>
                <CheckCircle2 size={14} color="var(--green)" /> Enforced onchain — no platform
                intervention needed.
              </p>
            </div>
            <div className="rule-case">
              <span className="tag tag-red">Dispute</span>
              <h3>Arbiter resolves</h3>
              <p>
                Client opens a dispute during review. Funds lock. The arbiter calls{" "}
                <code className="mono text-blue">resolveDispute</code> with one of{" "}
                <em>release</em>, <em>refund</em>, or <em>split</em>.
              </p>
            </div>
            <div className="rule-case">
              <span className="tag tag-blue">No delivery</span>
              <h3>Refund to client</h3>
              <p>
                If the freelancer never ships by the deadline, the client calls{" "}
                <code className="mono text-blue">claimRefund</code> and reclaims the full escrow.
              </p>
            </div>
            <div className="rule-case">
              <span className="tag tag-amber">Timeout</span>
              <h3>Hard deadlines</h3>
              <p>
                <Clock size={14} /> The deadline is a unix timestamp onchain. The contract rejects
                late submissions — no exceptions, no &ldquo;just a few more hours.&rdquo;
              </p>
            </div>
            <div className="rule-case">
              <span className="tag tag-green">Verified</span>
              <h3>Read the source</h3>
              <p>
                <Code size={14} /> Both contracts are verified on MonadVision + Monadscan. Every
                function the UI calls, you can read in Solidity first.
              </p>
            </div>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────── CTA */}
        <section className="container section" id="security">
          <div className="cta-box">
            <div>
              <h2>A safer yes to small digital deals.</h2>
              <p>
                $125 brand kit. $40 logo touch-up. $300 deck review. The work that lives in DMs and
                doesn&apos;t deserve a marketplace — now has a contract.
              </p>
            </div>
            <Link className="btn btn-lime" href="/create">
              Create a deal
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>

        {/* ──────────────────────────────────────────────────────── footer */}
        <footer className="container">
          <div>
            Handshake · escrow-meets-encrypted-delivery on Monad testnet
          </div>
          <div className="row">
            <a href="https://testnet.monadvision.com/address/0x989EA8716ba301185798223a44fBb84713AEEFC1" target="_blank" rel="noreferrer">
              Escrow contract
            </a>
            <span aria-hidden>·</span>
            <a href="https://testnet.monadvision.com/address/0x6499aB00482dCc693Fd844f162378E215d93Aac9" target="_blank" rel="noreferrer">
              MockUSDC
            </a>
            <span aria-hidden>·</span>
            <Link href="/create">Start a deal</Link>
          </div>
        </footer>
      </main>
    </SmoothScroll>
  );
}

/* ------------------------------------------------------- small inline components */

function TrustItem({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="trust-item">
      {icon}
      <div>
        <strong>{title}</strong>
        <div>{children}</div>
      </div>
    </div>
  );
}

function FlowStep({ num, icon, title, children }: { num: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flow-step">
      <div className="step-num">{num}</div>
      <div className="icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

// Suppress unused-import warning for icons reserved for future tabs.
void Users; void AlertTriangle; void XCircle; void CheckCircle2;
