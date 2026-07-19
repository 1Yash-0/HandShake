"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useChainId,
  useWatchContractEvent,
} from "wagmi";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Download,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Coins,
  AlertTriangle,
  FileKey2,
  Briefcase,
  Wallet,
  Eye,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import {
  HANDSHAKE_ESCROW_ADDRESS,
  HANDSHAKE_ESCROW_ABI,
  MOCK_USDC_ADDRESS,
  formatUsdc,
  DealState,
  DEAL_STATE_LABELS,
  CHAIN_ID,
} from "@/lib/contract";
import { addressLink } from "@/lib/monad";
import { importKeyRaw, decryptFile } from "@/lib/crypto";
import { useSession } from "@/lib/auth";
import { conciseWalletError } from "@/lib/walletError";

/**
 * Client deal page — `/deal/<id>`. Reads deal state via `getDeal(id)` and
 * surfaces the right action per state:
 *
 *   Created      → client sees "Fund deal" (calls fundDeal)
 *   Funded       → freelancer-only link to /handoff/[id] to encrypt + submit
 *   UnderReview  → client sees "Approve" (calls approveDeal) + "Open dispute"
 *   Released     → client sees "Unlock original" — fetches AES key from /api/key
 *   Refunded     → terminal — "Deal refunded"
 *   Disputed     → "Awaiting arbiter"
 *   Resolved     → terminal — "Dispute resolved"
 *
 * The unlock path is the real trust gate: it pulls the key from /api/key,
 * which only returns the key when the contract says state == Released.
 *
 * Hooks: every hook is called unconditionally at the top. The `dealId === null`
 * guard (invalid URL id) renders <BadId/> AFTER all hooks have been called, so
 * the rules-of-hooks order is identical on every render.
 */
export default function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);

  // Session role drives the role-aware banner: which side of the deal is
  // "you", and what's the next thing you do. The contract still authorizes
  // every action by the stored parties — this banner is guidance, not gating.

  // Parse the route id without an early return — a null dealId is the signal
  // we render <BadId/> for, but only AFTER all hooks have been called.
  let dealId: bigint | null = null;
  try {
    dealId = BigInt(idStr);
  } catch {
    dealId = null;
  }

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const session = useSession();

  const [submitting, setSubmitting] = useState<"fund" | "approve" | "dispute" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlocked, setUnlocked] = useState<{ url: string; size: number } | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const { data: deal, isLoading, refetch, error: readErr } = useReadContract({
    address: HANDSHAKE_ESCROW_ADDRESS,
    abi: HANDSHAKE_ESCROW_ABI,
    functionName: "getDeal",
    args: [dealId ?? 0n],
    query: { enabled: dealId !== null },
    // wagmi v3 can't infer the tuple return from a loose JSON ABI, so we cast
    // `deal` to DealTuple below. The cast is structural — the contract returns
    // exactly these 9 fields in this order (see HandshakeEscrow.getDeal).
  });

  // Live-refresh on any escrow event touching this deal id.
  // (wagmi v3 watchContractEvent — server-side polling via the configured transport.)
  useWatchContractEvent({
    address: HANDSHAKE_ESCROW_ADDRESS,
    abi: HANDSHAKE_ESCROW_ABI,
    eventName: "Released",
    onLogs: () => {
      if (dealId !== null) void refetch();
    },
  });

  const onWrongChain = isConnected && chainId !== CHAIN_ID;

  // Tuple return of HandshakeEscrow.getDeal — see contracts/src/HandshakeEscrow.sol.
  type DealTuple = readonly [
    client: `0x${string}`,
    freelancer: `0x${string}`,
    arbiter: `0x${string}`,
    amount: bigint,
    deadline: bigint,
    reviewWindow: bigint,
    reviewEnd: bigint,
    ciphertextHash: `0x${string}`,
    state: bigint,
  ];

  // Parse the tuple return into named fields.
  const t = deal as DealTuple | undefined;
  const d = t
    ? {
        client: t[0],
        freelancer: t[1],
        arbiter: t[2],
        amount: t[3],
        deadline: t[4],
        reviewWindow: t[5],
        reviewEnd: t[6],
        ciphertextHash: t[7],
        state: Number(t[8]) as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      }
    : null;

  // ─── Hooks done. Now branch on validity. ────────────────────────────────
  if (dealId === null) {
    return <BadId />;
  }
  if (isLoading) {
    return (
      <>
        <Topbar />
        <main className="container section">
          <Loader2 className="animate-spin" /> Loading deal {dealId.toString()}…
        </main>
      </>
    );
  }
  if (readErr || !d) {
    return (
      <>
        <Topbar />
        <main className="container section">
          <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
            <AlertTriangle size={12} /> Deal {dealId.toString()} not found
          </div>
          <Link className="btn btn-soft mt-2" href="/create">
            Create a new deal
          </Link>
        </main>
      </>
    );
  }

  const isClient = isConnected && address?.toLowerCase() === d.client.toLowerCase();
  const isFreelancer = isConnected && address?.toLowerCase() === d.freelancer.toLowerCase();
  // When the same address is both client + freelancer (a self-deal, common in
  // solo demos), disambiguate by the user's signed-in role so the action panel
  // shows ONE side's CTA — not both. The contract still gates every write by
  // the stored parties; this only affects which button we surface in the UI.
  const yourSide: "client" | "freelancer" | null = isClient && isFreelancer
    ? (session?.role === "freelancer" ? "freelancer" : "client")
    : isClient ? "client"
    : isFreelancer ? "freelancer"
    : null;
  const actAsClient = yourSide === "client";
  const actAsFreelancer = yourSide === "freelancer";
  const statePill = {
    0: <span className="pill pill-gray"><span className="pill-dot" /> {DEAL_STATE_LABELS[0]}</span>,
    1: <span className="pill pill-blue"><span className="pill-dot" /> {DEAL_STATE_LABELS[1]}</span>,
    2: <span className="pill pill-amber"><span className="pill-dot" /> {DEAL_STATE_LABELS[2]}</span>,
    3: <span className="pill pill-green"><span className="pill-dot" /> {DEAL_STATE_LABELS[3]}</span>,
    4: <span className="pill pill-gray"><span className="pill-dot" /> {DEAL_STATE_LABELS[4]}</span>,
    5: <span className="pill pill-red"><span className="pill-dot" /> {DEAL_STATE_LABELS[5]}</span>,
    6: <span className="pill pill-gray"><span className="pill-dot" /> {DEAL_STATE_LABELS[6]}</span>,
  }[d.state];

  async function fund() {
    setError(null);
    if (onWrongChain) {
      setError(`Switch to Monad testnet (id ${CHAIN_ID}) in your wallet to fund.`);
      return;
    }
    setSubmitting("fund");
    try {
      const tx = await writeContractAsync({
        address: HANDSHAKE_ESCROW_ADDRESS,
        abi: HANDSHAKE_ESCROW_ABI,
        functionName: "fundDeal",
        chainId: CHAIN_ID,
        args: [dealId!],
      });
      void tx;
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
    } catch (err) {
      console.error("fund failed", err);
      setError(conciseWalletError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function approve() {
    setError(null);
    if (onWrongChain) {
      setError(`Switch to Monad testnet (id ${CHAIN_ID}) in your wallet to approve.`);
      return;
    }
    setSubmitting("approve");
    try {
      const tx = await writeContractAsync({
        address: HANDSHAKE_ESCROW_ADDRESS,
        abi: HANDSHAKE_ESCROW_ABI,
        functionName: "approveDeal",
        chainId: CHAIN_ID,
        args: [dealId!],
      });
      void tx;
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
    } catch (err) {
      console.error("approve failed", err);
      setError(conciseWalletError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function dispute() {
    setError(null);
    if (onWrongChain) {
      setError(`Switch to Monad testnet (id ${CHAIN_ID}) in your wallet to dispute.`);
      return;
    }
    setSubmitting("dispute");
    try {
      const tx = await writeContractAsync({
        address: HANDSHAKE_ESCROW_ADDRESS,
        abi: HANDSHAKE_ESCROW_ABI,
        functionName: "openDispute",
        chainId: CHAIN_ID,
        args: [dealId!],
      });
      void tx;
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
    } catch (err) {
      console.error("dispute failed", err);
      setError(conciseWalletError(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function unlockOriginal() {
    setUnlockError(null);
    setUnlocking(true);
    try {
      // 1. fetch the AES key from the gate — only Released deals unlock.
      const keyRes = await fetch(`/api/key?dealId=${dealId!.toString()}`);
      if (!keyRes.ok) {
        const j = await keyRes.json().catch(() => ({}));
        throw new Error(j.stateLabel ? `Deal state: ${j.stateLabel}` : `HTTP ${keyRes.status}`);
      }
      const { key: keyB64 } = await keyRes.json();
      const keyBytes = Uint8Array.from(Buffer.from(keyB64, "base64"));
      const key = await importKeyRaw(keyBytes);

      // 2. fetch the ciphertext blob URL. We stored it deterministically by deal id;
      //    for the demo we list the handshake/deal-<id>/ prefix.
      const listRes = await fetch(`/api/blob/list?dealId=${dealId!.toString()}`);
      if (!listRes.ok) throw new Error("Could not list ciphertext blobs");
      const { url } = await listRes.json();

      const cipherRes = await fetch(url);
      if (!cipherRes.ok) throw new Error("Could not fetch ciphertext");
      const cipherBytes = new Uint8Array(await cipherRes.arrayBuffer());

      // 3. Fetch the IV sidecar via the sidecar route.
      const sidecarListRes = await fetch(`/api/blob/sidecar?dealId=${dealId!.toString()}`);
      if (!sidecarListRes.ok) throw new Error("Could not list IV sidecar");
      const { url: sidecarUrl } = await sidecarListRes.json();
      const metaRes = await fetch(sidecarUrl);
      if (!metaRes.ok) throw new Error("Could not fetch IV sidecar");
      const meta = await metaRes.json();
      const iv = Uint8Array.from(Buffer.from(meta.iv, "base64"));

      const plain = await decryptFile(cipherBytes, iv, key);

      // 4. Trigger a download of the decrypted original in-browser.
      const blob = new Blob([plain], { type: meta.contentType || "application/octet-stream" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = meta.name || `deal-${dealId!.toString()}-decrypted.bin`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
      setUnlocked({ url, size: plain.byteLength });
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : String(err));
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <>
      <Topbar />
      <main className="container section">
        <Link href="/" className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back
        </Link>

        <div className="row-between mb-4">
          <div>
            <div className="step-num">Deal #{dealId.toString()}</div>
            <h2 style={{ marginTop: 6 }}>{statePill}</h2>
          </div>
          <Link className="btn btn-soft" href={`/timeline/${dealId.toString()}`}>
            View timeline <ArrowUpRight size={16} />
          </Link>
        </div>

        <RoleBanner
          role={session?.role}
          isClient={isClient}
          isFreelancer={isFreelancer}
          state={d.state}
          dealId={dealId}
          onFund={fund}
          onApprove={approve}
          onUnlock={unlockOriginal}
          submitting={submitting}
          unlocking={unlocking}
          onWrongChain={onWrongChain}
        />

        <div className="grid-2">
          <div className="deal-card stack">
            <div className="row">
              <Coins size={18} color="var(--blue)" />
              <strong>Terms</strong>
            </div>
            <div className="grid-2">
              <Stat label="Amount" value={`${formatUsdc(d.amount)} USDC`} />
              <Stat label="State" value={DEAL_STATE_LABELS[d.state]} />
              <Stat label="Deadline" value={new Date(Number(d.deadline) * 1000).toLocaleString()} />
              <Stat
                label="Review window"
                value={`${Number(d.reviewWindow) / 3600}h${d.reviewEnd ? ` (ends ${new Date(Number(d.reviewEnd) * 1000).toLocaleString()})` : ""}`}
              />
            </div>

            <div className="stack-sm">
              <AddressRow label="Client" address={d.client} you={yourSide === "client"} />
              <AddressRow label="Freelancer" address={d.freelancer} you={yourSide === "freelancer"} />
              <AddressRow label="Arbiter" address={d.arbiter} />
            </div>

            {d.ciphertextHash !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
              <div className="stack-sm">
                <div className="step-num">Ciphertext hash committed onchain</div>
                <code className="mono" style={{ fontSize: ".75rem", wordBreak: "break-all", color: "var(--blue)" }}>
                  {d.ciphertextHash}
                </code>
              </div>
            )}
          </div>

          <div className="deal-card stack">
            {/* ────────────────────────────────────────── per-state actions */}
            {d.state === DealState.Created && (
              <>
                <div className="row"><LockKeyhole size={18} color="var(--blue)" /> <strong>Fund escrow</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  You approved the USDC pull during deal creation. Now lock it in the contract.
                </p>
                <button className="btn btn-blue" onClick={fund} disabled={submitting !== null || !actAsClient || onWrongChain}>
                  {submitting === "fund" ? <Loader2 size={16} className="animate-spin" /> : <Coins size={16} />}
                  Fund {formatUsdc(d.amount)} USDC
                </button>
                {!actAsClient && <span className="hint">Only the deal client can fund.</span>}
                {actAsClient && onWrongChain && <span className="hint">Switch to Monad testnet to fund.</span>}
              </>
            )}

            {d.state === DealState.Funded && (
              <>
                <div className="row"><ShieldCheck size={18} color="var(--green)" /> <strong>Funds locked</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  {actAsFreelancer
                    ? "It's your turn. Encrypt and submit the deliverable to open the review window."
                    : "Waiting on the freelancer to encrypt and submit the deliverable."}
                </p>
                {actAsFreelancer && (
                  <Link className="btn btn-lime" href={`/handoff/${dealId.toString()}`}>
                    <FileKey2 size={16} /> Encrypt & submit deliverable
                  </Link>
                )}
              </>
            )}

            {d.state === DealState.UnderReview && (
              <>
                <div className="row"><Clock size={18} color="var(--amber)" /> <strong>Under review</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  The freelancer submitted the encrypted file. Review the preview, then approve to release
                  payment and unlock the original.
                </p>
                <button className="btn btn-blue" onClick={approve} disabled={submitting !== null || !actAsClient || onWrongChain}>
                  {submitting === "approve" ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  Approve & release
                </button>
                <button className="btn btn-danger" onClick={dispute} disabled={submitting !== null || !actAsClient || onWrongChain}>
                  {submitting === "dispute" ? <Loader2 size={16} className="animate-spin" /> : <AlertTriangle size={16} />}
                  Open dispute
                </button>
                {!actAsClient && <span className="hint">Only the deal client can approve or dispute.</span>}
                {actAsClient && onWrongChain && <span className="hint">Switch to Monad testnet to approve or dispute.</span>}
              </>
            )}

            {d.state === DealState.Released && (
              <>
                <div className="row"><CheckCircle2 size={18} color="var(--green)" /> <strong>Released</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  Payment released to the freelancer. The decryption key is now unlockable — the onchain
                  <code className="mono">Released</code> event is the gate.
                </p>
                <button className="btn btn-blue" onClick={unlockOriginal} disabled={unlocking}>
                  {unlocking ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                  Unlock original
                </button>
                {unlocked && (
                  <div className="pill pill-green" style={{ alignSelf: "flex-start" }}>
                    <CheckCircle2 size={12} /> Decrypted {unlocked.size} bytes
                  </div>
                )}
                {unlockError && (
                  <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
                    <AlertTriangle size={12} /> {unlockError}
                  </div>
                )}
              </>
            )}

            {d.state === DealState.Disputed && (
              <>
                <div className="row"><AlertTriangle size={18} color="var(--red)" /> <strong>Disputed</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  Funds are locked pending arbiter resolution. The arbiter calls{" "}
                  <code className="mono">resolveDispute</code> with release / refund / split.
                </p>
              </>
            )}

            {d.state === DealState.Refunded && (
              <>
                <div className="row"><Coins size={18} color="var(--muted)" /> <strong>Refunded</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  The freelancer did not deliver by the deadline. The full escrow was returned to the client.
                </p>
              </>
            )}

            {d.state === DealState.Resolved && (
              <>
                <div className="row"><ShieldCheck size={18} color="var(--muted)" /> <strong>Resolved</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  The arbiter resolved this dispute. See the timeline for the outcome.
                </p>
              </>
            )}

            {error && (
              <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
                <span className="pill-dot" /> {error}
              </div>
            )}

            <div className="text-muted" style={{ fontSize: ".75rem", marginTop: 12 }}>
              <span className="step-num">Contract</span>
              <div className="mono" style={{ marginTop: 4, wordBreak: "break-all" }}>
                <a
                  href={addressLink(HANDSHAKE_ESCROW_ADDRESS)}
                  target="_blank"
                  rel="noreferrer"
                  className="tl-link"
                >
                  {HANDSHAKE_ESCROW_ADDRESS}
                </a>
              </div>
              <div style={{ marginTop: 8 }}>
                <span className="step-num">Token</span>
                <div className="mono" style={{ marginTop: 4, wordBreak: "break-all" }}>
                  <a
                    href={addressLink(MOCK_USDC_ADDRESS)}
                    target="_blank"
                    rel="noreferrer"
                    className="tl-link"
                  >
                    {MOCK_USDC_ADDRESS}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="deal-stat">
      <span className="label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AddressRow({ label, address, you }: { label: string; address: string; you?: boolean }) {
  return (
    <div className="row-between">
      <span className="step-num">{label}{you && <span className="pill pill-blue" style={{ marginLeft: 6 }}><span className="pill-dot" /> you</span>}</span>
      <a
        href={addressLink(address as `0x${string}`)}
        target="_blank"
        rel="noreferrer"
        className="mono tl-link"
        style={{ fontSize: ".75rem" }}
      >
        {address.slice(0, 8)}…{address.slice(-6)}
      </a>
    </div>
  );
}

/**
 * Role-aware banner that leads the deal page. Surfaces the user's role in
 * this deal and the one next action they take — so a client sees "You're the
 * client — Fund escrow" and a freelancer sees "You're the freelancer —
 * Encrypt & submit" without reading the full state table.
 *
 * Three cases:
 *   - logged in, on the right side of this deal → role-tinted banner + CTA
 *   - logged in, on the wrong side of this deal (e.g. a client viewing a deal
 *     they're the freelancer on) → neutral "you're the other party" banner
 *   - not logged in, or not a party to this deal → neutral observer banner
 *
 * Buttons here call the SAME handlers as the per-state card below — they
 * don't bypass the contract. If a freelancer hits the Fund button, the
 * contract reverts on `fundDeal` because `msg.sender != client`.
 */
function RoleBanner({
  role,
  isClient,
  isFreelancer,
  state,
  dealId,
  onFund,
  onApprove,
  onUnlock,
  submitting,
  unlocking,
  onWrongChain,
}: {
  role: "client" | "freelancer" | undefined;
  isClient: boolean;
  isFreelancer: boolean;
  state: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  dealId: bigint;
  onFund: () => Promise<void>;
  onApprove: () => Promise<void>;
  onUnlock: () => Promise<void>;
  submitting: "fund" | "approve" | "dispute" | null;
  unlocking: boolean;
  onWrongChain: boolean;
}) {
  const youAreParty = isClient || isFreelancer;
  // Self-deal disambiguation: when the same address is both parties, prefer
  // the user's signed-in role so the banner shows ONE side's CTA. Matches
  // the action-panel logic in the parent (actAsClient/actAsFreelancer).
  const yourSide: "client" | "freelancer" | null = isClient && isFreelancer
    ? (role === "freelancer" ? "freelancer" : "client")
    : isClient ? "client"
    : isFreelancer ? "freelancer"
    : null;

  // Determine the primary CTA for the user's side in this deal's state.
  // CTAs that trigger onchain writes are disabled on the wrong chain; the
  // freelancer "Encrypt & submit" link isn't because /handoff does its own
  // guard + retries the onchain step independently.
  let cta: { label: string; tint: "blue" | "lime"; onClick?: () => void; href?: string; busy?: boolean; disabled?: boolean } | null = null;
  if (yourSide === "client") {
    if (state === DealState.Created) {
      cta = { label: "Fund escrow", tint: "blue", onClick: () => void onFund(), busy: submitting === "fund", disabled: onWrongChain };
    } else if (state === DealState.UnderReview) {
      cta = { label: "Approve & release", tint: "blue", onClick: () => void onApprove(), busy: submitting === "approve", disabled: onWrongChain };
    } else if (state === DealState.Released) {
      cta = { label: "Unlock original", tint: "blue", onClick: () => void onUnlock(), busy: unlocking };
    }
  } else if (yourSide === "freelancer") {
    if (state === DealState.Funded) {
      cta = { label: "Encrypt & submit", tint: "lime", href: `/handoff/${dealId.toString()}` };
    } else if (state === DealState.UnderReview) {
      cta = { label: "Awaiting client approval", tint: "blue" };
    } else if (state === DealState.Released) {
      cta = { label: "Paid out", tint: "blue" };
    }
  }

  const tintClass = yourSide === "client" ? "role-banner-client" : yourSide === "freelancer" ? "role-banner-freelancer" : "role-banner-observer";
  const RoleIcon = yourSide === "client" ? Briefcase : yourSide === "freelancer" ? Wallet : Eye;

  return (
    <div className={`role-banner ${tintClass}`}>
      <div className="role-banner-main">
        <div className="role-banner-icon">
          <RoleIcon size={16} />
        </div>
        <div className="role-banner-text">
          {youAreParty ? (
            <>
              <strong>You&apos;re the {yourSide}</strong>
              <span>
                {role && role !== yourSide
                  ? `You signed in as a ${role}, but on this deal you're the ${yourSide}. The actions below match your role in THIS deal.`
                  : state <= 2
                    ? "Here's your next move:"
                    : "This deal is closed."}
              </span>
            </>
          ) : role ? (
            <>
              <strong>You&apos;re observing</strong>
              <span>
                You signed in as a {role} but you&apos;re not a party to this deal. Read the terms and
                timeline — the contract still authorizes every action by the stored parties.
              </span>
            </>
          ) : (
            <>
              <strong>You&apos;re observing</strong>
              <span>
                Sign in to take action on this deal. The client funds and approves; the freelancer
                encrypts and submits.
              </span>
            </>
          )}
        </div>
      </div>

      {cta && (
        <div className="role-banner-cta">
          {cta.href ? (
            <Link className={`btn btn-${cta.tint}`} href={cta.href}>
              {cta.busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {cta.label}
            </Link>
          ) : cta.onClick ? (
            <button
              className={`btn btn-${cta.tint}`}
              onClick={cta.onClick}
              disabled={cta.disabled || cta.busy}
            >
              {cta.busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              {cta.label}
            </button>
          ) : (
            <span className={`pill pill-${cta.tint === "blue" ? "blue" : "green"}`}>
              <CheckCircle2 size={12} /> {cta.label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function BadId() {
  return (
    <>
      <Topbar />
      <main className="container section">
        <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
          <AlertTriangle size={12} /> Invalid deal id
        </div>
        <Link className="btn btn-soft mt-2" href="/create">Create a new deal</Link>
      </main>
    </>
  );
}
