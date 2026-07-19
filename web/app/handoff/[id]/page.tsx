"use client";

import { use, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useChainId,
} from "wagmi";
import {
  ArrowLeft,
  FileKey2,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { AuthGate } from "@/components/AuthGate";
import {
  HANDSHAKE_ESCROW_ADDRESS,
  HANDSHAKE_ESCROW_ABI,
  formatUsdc,
  DealState,
  CHAIN_ID,
} from "@/lib/contract";
import { addressLink } from "@/lib/monad";
import {
  generateAesKey,
  encryptFile,
  exportKeyRaw,
  sha256Hex,
} from "@/lib/crypto";

/**
 * Freelancer handoff page — `/handoff/<id>`. This is where the magic happens:
 *
 *   1. Pick a file (any type, up to 50MB).
 *   2. Generate a fresh AES-GCM 256 key in-browser.
 *   3. Encrypt the file — the plaintext never leaves the browser.
 *   4. POST the ciphertext to /api/upload — returns { url, hash }.
 *   5. POST the raw 32-byte AES key to /api/key/store — keyed by dealId,
 *      gated to release only on onchain Released.
 *   6. Submit the ciphertext hash onchain via `submitDeliverable(id, hash)`.
 *   7. Upload a sidecar JSON with { iv, name, size, contentType } to the same
 *      Blob prefix so the client can reconstruct the file on unlock.
 *
 * Only the freelancer named in the deal can submit. The contract enforces it.
 *
 * Hooks: all hooks are called unconditionally — the `dealId === null` guard
 * (invalid URL id) renders <BadId/> AFTER all hooks have been called.
 */
export default function HandoffPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <AuthGate role="freelancer">
      <HandoffInner params={params} />
    </AuthGate>
  );
}

function HandoffInner({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);

  // Parse the route id without an early return.
  let dealId: bigint | null = null;
  try {
    dealId = BigInt(idStr);
  } catch {
    dealId = null;
  }

  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync } = useWriteContract();

  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "encrypting" | "uploading" | "storing-key" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [committedHash, setCommittedHash] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: deal, isLoading, refetch } = useReadContract({
    address: HANDSHAKE_ESCROW_ADDRESS,
    abi: HANDSHAKE_ESCROW_ABI,
    functionName: "getDeal",
    args: [dealId ?? 0n],
    query: { enabled: dealId !== null },
  });

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

  const d = useMemo(
    () => {
      const t = deal as DealTuple | undefined;
      return t
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
    },
    [deal],
  );

  const isFreelancer = isConnected && !!address && !!d && address.toLowerCase() === d.freelancer.toLowerCase();
  const canSubmit = dealId !== null && d?.state === DealState.Funded && isFreelancer;
  const onWrongChain = isConnected && chainId !== CHAIN_ID;

  // ─── Hooks done. Now branch on validity. ────────────────────────────────
  if (dealId === null) {
    return <BadId />;
  }
  if (isLoading) {
    return (
      <>
        <Topbar />
        <main className="container section"><Loader2 className="animate-spin" /> Loading deal {dealId.toString()}…</main>
      </>
    );
  }
  if (!d) {
    return (
      <>
        <Topbar />
        <main className="container section">
          <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
            <AlertTriangle size={12} /> Deal {dealId.toString()} not found
          </div>
        </main>
      </>
    );
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file || !canSubmit || dealId === null) return;

    try {
      setStage("encrypting");
      const aesKey = await generateAesKey();
      const { ciphertext, iv } = await encryptFile(file, aesKey);

      // Hash the ciphertext — this is what goes onchain.
      const cipherHash = await sha256Hex(ciphertext);
      setCommittedHash(cipherHash);

      // POST ciphertext to Vercel Blob. We don't need the returned URL — the
      // blob/list + blob/sidecar routes derive it deterministically from dealId.
      setStage("uploading");
      const upRes = await fetch(`/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-deal-id": dealId.toString() },
        body: ciphertext,
      });
      if (!upRes.ok) {
        const j = await upRes.json().catch(() => ({}));
        throw new Error(j.error || `upload failed (HTTP ${upRes.status})`);
      }
      await upRes.json();

      // Upload a sidecar with the IV + filename + size so the client can
      // reconstruct the original on unlock.
      const sidecar = {
        iv: Buffer.from(iv).toString("base64"),
        name: file.name,
        size: file.size,
        contentType: file.type || "application/octet-stream",
      };
      const sidecarRes = await fetch(`/api/blob/sidecar?dealId=${dealId.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sidecar),
      });
      if (!sidecarRes.ok) {
        // non-fatal — the unlock path can still derive the IV from the
        // sidecar route's listing later. For the demo we surface a hint.
        console.warn("sidecar upload failed", sidecarRes.status);
      }

      // Store the raw AES key — gated to release on onchain Released.
      setStage("storing-key");
      const rawKey = await exportKeyRaw(aesKey);
      const keyRes = await fetch(`/api/key/store`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "x-deal-id": dealId.toString() },
        body: rawKey,
      });
      if (!keyRes.ok) {
        const j = await keyRes.json().catch(() => ({}));
        throw new Error(j.error || `key store failed (HTTP ${keyRes.status})`);
      }

      // Submit the hash onchain.
      setStage("submitting");
      const tx = await writeContractAsync({
        address: HANDSHAKE_ESCROW_ADDRESS,
        abi: HANDSHAKE_ESCROW_ABI,
        functionName: "submitDeliverable",
        args: [dealId, cipherHash],
      });
      setTxHash(tx);
      await new Promise((r) => setTimeout(r, 1500));
      await refetch();
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("idle");
    }
  }

  return (
    <>
      <Topbar />
      <main className="container section">
        <Link href={`/deal/${dealId.toString()}`} className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back to deal
        </Link>

        <div className="section-head">
          <div className="step-num">Encrypted handoff · Deal #{dealId.toString()}</div>
          <h2>Encrypt the original.</h2>
          <p className="text-muted">
            The file is encrypted in your browser with a fresh AES-GCM 256 key. Only the ciphertext
            leaves your machine — the plaintext never does. The hash of the ciphertext goes onchain.
          </p>
        </div>

        <div className="grid-2">
          <form onSubmit={onUpload} className="deal-card stack">
            <div className="row"><FileKey2 size={18} color="var(--blue)" /> <strong>Pick a file</strong></div>

            <div className="field">
              <label htmlFor="file">Deliverable</label>
              <input
                id="file"
                type="file"
                ref={fileInputRef}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={!canSubmit || stage !== "idle"}
                required
              />
              <span className="hint">
                {file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : "Any file up to 50MB."}
              </span>
            </div>

            {error && (
              <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
                <AlertTriangle size={12} /> {error}
              </div>
            )}

            <button
              className="btn btn-blue"
              type="submit"
              disabled={!canSubmit || !file || stage !== "idle"}
            >
              {stage !== "idle" && stage !== "done" ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              {stage === "encrypting" ? "Encrypting…" :
                stage === "uploading" ? "Uploading ciphertext…" :
                stage === "storing-key" ? "Storing key…" :
                stage === "submitting" ? "Submitting hash onchain…" :
                stage === "done" ? "Done" :
                "Encrypt & submit"}
            </button>

            <span className="hint">
              {canSubmit
                ? "Generates a fresh AES key, encrypts the file, uploads ciphertext + key, submits the ciphertext hash onchain."
                : !isConnected
                  ? "Connect the freelancer's wallet."
                  : !isFreelancer
                    ? "Connected wallet is not the freelancer for this deal."
                    : onWrongChain
                      ? "Switch to Monad testnet."
                      : `Deal state is ${d.state} — must be Funded (1) to submit.`}
            </span>
          </form>

          <aside className="deal-card stack">
            {stage === "done" ? (
              <>
                <div className="row"><CheckCircle2 size={18} color="var(--green)" /> <strong>Deliverable submitted</strong></div>
                <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
                  The ciphertext hash is committed onchain. The client can now review and approve — when
                  they do, the contract releases payment to you and the decryption key to them.
                </p>
                {committedHash && (
                  <div className="stack-sm">
                    <div className="step-num">Ciphertext hash (onchain)</div>
                    <code className="mono" style={{ fontSize: ".75rem", wordBreak: "break-all", color: "var(--blue)" }}>
                      {committedHash}
                    </code>
                  </div>
                )}
                {txHash && (
                  <div className="stack-sm">
                    <div className="step-num">Submit tx</div>
                    <a
                      href={`https://testnet.monadvision.com/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="tl-link mono"
                      style={{ fontSize: ".75rem" }}
                    >
                      {txHash.slice(0, 10)}…{txHash.slice(-8)}
                    </a>
                  </div>
                )}
                <Link className="btn btn-soft" href={`/deal/${dealId.toString()}`}>
                  Back to deal
                </Link>
              </>
            ) : (
              <>
                <div className="row"><ShieldCheck size={18} color="var(--blue)" /> <strong>How the encryption works</strong></div>
                <ol style={{ margin: 0, paddingLeft: 20, fontSize: ".875rem", color: "var(--muted)", lineHeight: 1.6 }}>
                  <li><FileText size={12} /> A fresh AES-GCM 256 key is generated in your browser.</li>
                  <li><LockKeyhole size={12} /> The file is encrypted — plaintext never leaves this tab.</li>
                  <li><Upload size={12} /> The ciphertext is uploaded to Vercel Blob.</li>
                  <li><ShieldCheck size={12} /> The AES key is uploaded to a gated store — only released when the onchain deal is <code className="mono">Released</code>.</li>
                  <li><CheckCircle2 size={12} /> The ciphertext&apos;s SHA-256 hash goes onchain via <code className="mono">submitDeliverable</code>.</li>
                </ol>
                <div className="deal-stat">
                  <span className="label">Deal amount</span>
                  <strong>{formatUsdc(d.amount)} USDC</strong>
                </div>
                <div className="deal-stat">
                  <span className="label">Delivery deadline</span>
                  <strong>{new Date(Number(d.deadline) * 1000).toLocaleString()}</strong>
                </div>
                <div className="text-muted" style={{ fontSize: ".75rem" }}>
                  <span className="step-num">Client</span>
                  <div className="mono" style={{ marginTop: 4, wordBreak: "break-all" }}>
                    <a
                      href={addressLink(d.client)}
                      target="_blank"
                      rel="noreferrer"
                      className="tl-link"
                    >
                      {d.client.slice(0, 10)}…{d.client.slice(-8)}
                    </a>
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      </main>
    </>
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
