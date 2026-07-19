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
  Clock,
  CheckCircle2,
} from "lucide-react";
import { motion } from "framer-motion";
import { Topbar } from "@/components/Topbar";
import { EscrowOrbit } from "@/components/EscrowOrbit";
import { SmoothScroll } from "@/components/motion/SmoothScroll";
import { ScrubbedText } from "@/components/motion/ScrubbedText";
import { Reveal } from "@/components/motion/useReveal";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { useSession } from "@/lib/auth";

/**
 * Landing page — ported from prototype.html with the A2 slop fixes:
 *   - hero h1 tracking relaxed to -.02em (was -.075em)
 *   - one brand kicker (the hero eyebrow); other sections use a numbered cadence
 *   - rules grid uses varied sizes (1.4fr 1fr 1fr, one tall card)
 *   - cards: border, no shadow (no ghost-cards)
 *
 * CTAs are real links to /create, not `data-enter-app` stubs.
 *
 * Motion (per the soft neo-brutalist pass): every reveal uses a DIFFERENT motion
 * tied to what it reveals — no uniform fade-up reflex (impeccable's
 * skill-motion-no-section-fade rule). The hero entrance is a one-shot stagger
 * on load; trust items clip in from the bottom; flow steps stamp in (scale +
 * rotate, matching their offset-shadow surfaces); rule cards fan in from
 * their column side. The CTA box has a slow ambient background shift so the
 * dark surface breathes. All gated by prefers-reduced-motion via the Reveal
 * component + useReducedMotion.
 */
const EASE = [0.16, 1, 0.3, 1] as const;

export default function LandingPage() {
  const session = useSession();
  const reduce = useReducedMotion();
  // Logged-in users get a direct link to their dashboard as the primary CTA.
  const primaryHref = session ? `/${session.role}` : "/login";
  const primaryLabel = session
    ? session.role === "client"
      ? "Go to your deals"
      : "Go to your work"
    : "Sign in to start";
  const secondaryHref = "/create";
  const secondaryLabel = "Try it →";

  // Hero entrance stagger — one-shot on load, not scroll-triggered (it's
  // above the fold). 90ms between eyebrow → h1 → lead → actions. Under
  // reduced-motion these resolve to the identity (no transform).
  const heroItem = (delay: number) =>
    reduce
      ? { initial: false, animate: { opacity: 1, y: 0 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.6, ease: EASE, delay },
        };

  return (
    <SmoothScroll>
      <Topbar />
      <main>
        {/* ──────────────────────────────────────────────────────────── hero */}
        <section className="container hero" id="top">
          <div className="hero-copy">
            <motion.div {...heroItem(0)}>
              <div className="eyebrow">Protected digital handoffs</div>
            </motion.div>
            <motion.h1 {...heroItem(0.09)}>
              Get paid.
              <br />
              <span>Keep control.</span>
            </motion.h1>
            <motion.p className="hero-lead" {...heroItem(0.18)}>
              Turn a deal from Discord, WhatsApp, or email into a protected handoff. Payment locks first.
              The original unlocks after approval.
            </motion.p>
            <motion.div className="hero-actions" {...heroItem(0.27)}>
              <Link className="btn btn-blue" href={primaryHref}>
                {primaryLabel}
                <ArrowRight size={16} />
              </Link>
              <Link className="btn btn-soft" href={secondaryHref}>
                {secondaryLabel}
              </Link>
            </motion.div>
            <motion.div className="row text-muted" style={{ fontSize: ".875rem", gap: 9 }} {...heroItem(0.36)}>
              <Radio size={14} color="var(--green)" />
              Live escrow on Monad testnet
            </motion.div>
          </div>
          <EscrowOrbit />
        </section>

        {/* ────────────────────────────────────────────────────── trust strip */}
        <div className="container">
          <div className="trust-strip">
            <Reveal variant="clip" delay={0}>
              <TrustItem icon={<ShieldCheck size={18} />} title="Escrow by code">
                USDC locked in a Monad contract. No platform holds your money.
              </TrustItem>
            </Reveal>
            <Reveal variant="clip" delay={0.07}>
              <TrustItem icon={<LockKeyhole size={18} />} title="Encrypted handoff">
                File encrypted in the browser. Only its hash goes onchain.
              </TrustItem>
            </Reveal>
            <Reveal variant="clip" delay={0.14}>
              <TrustItem icon={<Zap size={18} />} title="Auto-release">
                If the client ghosts after delivery, the freelancer is paid on timeout.
              </TrustItem>
            </Reveal>
            <Reveal variant="clip" delay={0.21}>
              <TrustItem icon={<Code size={18} />} title="Verified source">
                Contracts verified on MonadVision and Monadscan — read them yourself.
              </TrustItem>
            </Reveal>
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
              <Reveal variant="rise" delay={0}>
                <div className="versus-card bad">
                  <h3>Without Handshake</h3>
                  <p>
                    Pay-then-pray. Client sends $125 to a stranger on Discord, hopes for the file. If the
                    freelancer ghosts, the client is out the money with no recourse.
                  </p>
                </div>
              </Reveal>
              <Reveal variant="rise" delay={0.09}>
                <div className="versus-card bad">
                  <h3>Or ship-and-pray</h3>
                  <p>
                    Freelancer sends the source first. Client can take the work and block them. The
                    freelancer eats the loss and loses leverage the moment the file leaves.
                  </p>
                </div>
              </Reveal>
              <Reveal variant="rise" delay={0.18}>
                <div className="versus-card good">
                  <h3>With Handshake</h3>
                  <p>
                    Payment locks in escrow first. The freelancer sends an encrypted file — the client
                    sees a preview, never the source. Approve, and the contract releases both: money to
                    the freelancer, key to the client.
                  </p>
                </div>
              </Reveal>
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
              <Reveal variant="stamp" delay={0}>
                <FlowStep num="01" icon={<ScrollText size={28} />} title="Agree on the terms">
                  Project, price, deadline, review window, arbiter.
                </FlowStep>
              </Reveal>
              <Reveal variant="stamp" delay={0.11}>
                <FlowStep num="02" icon={<CircleDollarSign size={28} />} title="Lock the payment">
                  125 test USDC enters the Monad escrow contract.
                </FlowStep>
              </Reveal>
              <Reveal variant="stamp" delay={0.22}>
                <FlowStep num="03" icon={<FileKey2 size={28} />} title="Encrypt the original">
                  The client sees a preview, never the readable source.
                </FlowStep>
              </Reveal>
              <Reveal variant="stamp" delay={0.33}>
                <FlowStep num="04" icon={<BadgeCheck size={28} />} title="Approve and unlock">
                  Payment releases. The client receives the decryption key.
                </FlowStep>
              </Reveal>
            </div>
            <Reveal variant="rise" delay={0}>
              <div className="row-between mt-4">
                <span className="text-muted">
                  No marketplace. No bidding. No 20% platform cut.
                </span>
                <Link className="btn btn-lime" href="/create">
                  Try the handoff
                  <ArrowRight size={16} />
                </Link>
              </div>
            </Reveal>
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
            {/* Tall card reveals first (scale + clip via "stamp"), then the
                small cards fan in from their column side — left cards from
                x:-24, right cards from x:24. Directional, tied to layout,
                not a uniform fade. */}
            <Reveal variant="stamp" delay={0}>
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
            </Reveal>
            <Reveal variant="fan" dir="right" delay={0.11}>
              <div className="rule-case">
                <span className="tag tag-red">Dispute</span>
                <h3>Arbiter resolves</h3>
                <p>
                  Client opens a dispute during review. Funds lock. The arbiter calls{" "}
                  <code className="mono text-blue">resolveDispute</code> with one of{" "}
                  <em>release</em>, <em>refund</em>, or <em>split</em>.
                </p>
              </div>
            </Reveal>
            <Reveal variant="fan" dir="left" delay={0.18}>
              <div className="rule-case">
                <span className="tag tag-blue">No delivery</span>
                <h3>Refund to client</h3>
                <p>
                  If the freelancer never ships by the deadline, the client calls{" "}
                  <code className="mono text-blue">claimRefund</code> and reclaims the full escrow.
                </p>
              </div>
            </Reveal>
            <Reveal variant="fan" dir="right" delay={0.25}>
              <div className="rule-case">
                <span className="tag tag-amber">Timeout</span>
                <h3>Hard deadlines</h3>
                <p>
                  <Clock size={14} /> The deadline is a unix timestamp onchain. The contract rejects
                  late submissions — no exceptions, no &ldquo;just a few more hours.&rdquo;
                </p>
              </div>
            </Reveal>
            <Reveal variant="fan" dir="left" delay={0.32}>
              <div className="rule-case">
                <span className="tag tag-green">Verified</span>
                <h3>Read the source</h3>
                <p>
                  <Code size={14} /> Both contracts are verified on MonadVision + Monadscan. Every
                  function the UI calls, you can read in Solidity first.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─────────────────────────────────────────────────────────── CTA */}
        <section className="container section" id="security">
          <CtaBox />
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

/**
 * CTA box — the dark closing card. Gets a slow ambient drift on a soft radial
 * highlight so the dark surface breathes (subtle life, not distracting). The
 * drift is a 12s ease-in-out alternate loop; under reduced motion the layer
 * is not rendered at all. Wrapped in its own component so the reduced-motion
 * read stays local to the box.
 */
function CtaBox() {
  const reduce = useReducedMotion();
  return (
    <div className="cta-box">
      {/* Ambient breathing layer — a soft radial highlight that drifts across
          the dark surface. 12s loop, ease-in-out. Under reduced-motion: hidden. */}
      {!reduce && (
        <motion.div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(600px 300px at 20% 30%, oklch(60% .12 274 / .18), transparent 60%)",
            animation: "ctaBreathe 12s ease-in-out infinite alternate",
            pointerEvents: "none",
          }}
        />
      )}
      <div style={{ position: "relative", zIndex: 1 }}>
        <h2>A safer yes to small digital deals.</h2>
        <p>
          $125 brand kit. $40 logo touch-up. $300 deck review. The work that lives in DMs and
          doesn&apos;t deserve a marketplace — now has a contract.
        </p>
      </div>
      <Link className="btn btn-lime" href="/create" style={{ position: "relative", zIndex: 1 }}>
        Create a deal
        <ArrowUpRight size={16} />
      </Link>
    </div>
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
