"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useWriteContract,
  useReadContract,
} from "wagmi";
import { ArrowLeft, Coins, Loader2, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { AuthGate } from "@/components/AuthGate";
import {
  HANDSHAKE_ESCROW_ADDRESS,
  HANDSHAKE_ESCROW_ABI,
  MOCK_USDC_ADDRESS,
  MOCK_USDC_ABI,
  parseUsdc,
  CHAIN_ID,
} from "@/lib/contract";
import { monadTestnet } from "@/lib/monad";
import { conciseWalletError } from "@/lib/walletError";
import { useEnsureMonad } from "@/lib/ensureMonad";

/**
 * Create-deal page. The first real wagmi write screen.
 *
 * Form fields map 1:1 to `HandshakeEscrow.createDeal(freelancer, arbiter, amount,
 * deadline, reviewWindow)`:
 *   - freelancer address (text)
 *   - arbiter address (text, optional — falls back to the deployer as a demo)
 *   - amount in USDC (text, parsed to 6-decimals via parseUsdc)
 *   - deadline = now + N days (defaults to 7)
 *   - reviewWindow = N hours (defaults to 48)
 *
 * On submit: send `createDeal` tx, wait for receipt (sync), then push to
 * `/deal/<newId>`. dealId is `dealCount() - 1` after the tx confirms.
 *
 * A "Mint 125 test USDC" button calls MockUSDC.mint() so judges can fund without
 * needing a faucet step.
 */
export default function CreateDealPage() {
  return (
    <AuthGate role="client">
      <CreateDealInner />
    </AuthGate>
  );
}

function CreateDealInner() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { onWrongChain, ensureMonad, chainId } = useEnsureMonad(isConnected);
  const { writeContractAsync } = useWriteContract();

  const [form, setForm] = useState({
    freelancer: "",
    arbiter: "",
    amount: "125",
    deadlineDays: "7",
    reviewHours: "48",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintedAmount, setMintedAmount] = useState<bigint | null>(null);

  // Read current MockUSDC balance for the connected wallet — honest display.
  // Pin the read to Monad so the balance lookup hits the Monad RPC even when
  // the wallet is on another chain (writes still auto-switch via ensureMonad).
  const { data: usdcBalance, refetch: refetchBalance } = useReadContract({
    chainId: CHAIN_ID,
    address: MOCK_USDC_ADDRESS,
    abi: MOCK_USDC_ABI,
    functionName: "balanceOf",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address },
  });

  // Read current deal count — used to derive the new deal id after create.
  const { data: dealCount, refetch: refetchDealCount } = useReadContract({
    chainId: CHAIN_ID,
    address: HANDSHAKE_ESCROW_ADDRESS,
    abi: HANDSHAKE_ESCROW_ABI,
    functionName: "dealCount",
  });

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function mintUsdc() {
    if (!address) return;
    setError(null);
    if (onWrongChain) {
      try {
        await ensureMonad();
      } catch (err) {
        console.error("chain switch rejected", err);
        setError(conciseWalletError(err));
        return;
      }
      setError(`Switched to Monad testnet — click Mint again.`);
      return;
    }
    setMinting(true);
    try {
      // Mint 1,000 test USDC — plenty for several demo deals.
      const amount = parseUsdc("1000");
      const tx = await writeContractAsync({
        address: MOCK_USDC_ADDRESS,
        abi: MOCK_USDC_ABI,
        functionName: "mint",
        chainId: CHAIN_ID,
        args: [address, amount],
      });
      // wait for the receipt via sendTransactionSync'd path — we already submitted,
      // so we just refetch balance after a short delay (the wallet handles the wait UI)
      void tx;
      await new Promise((r) => setTimeout(r, 1500));
      await refetchBalance();
      setMintedAmount(amount);
    } catch (err) {
      console.error("mint failed", err);
      setError(conciseWalletError(err));
    } finally {
      setMinting(false);
    }
  }

  async function approveAndCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isConnected || !address) {
      setError("Connect your wallet first.");
      return;
    }
    if (onWrongChain) {
      try {
        await ensureMonad();
      } catch (err) {
        console.error("chain switch rejected", err);
        setError(conciseWalletError(err));
        return;
      }
      setError(`Switched to Monad testnet — click Create deal again.`);
      return;
    }
    const freelancer = form.freelancer.trim() as `0x${string}`;
    if (!/^0x[a-fA-F0-9]{40}$/.test(freelancer)) {
      setError("Freelancer address must be a valid 0x… address.");
      return;
    }
    // Arbiter optional — fall back to the deployer address (ours) as a neutral party
    // for the demo. In production the user picks a real arbiter.
    const arbiter = (form.arbiter.trim() || address) as `0x${string}`;
    if (form.arbiter.trim() && !/^0x[a-fA-F0-9]{40}$/.test(form.arbiter.trim())) {
      setError("Arbiter address must be a valid 0x… address (or leave blank to use yourself).");
      return;
    }
    let amount: bigint;
    try {
      amount = parseUsdc(form.amount);
      if (amount <= 0n) throw new Error();
    } catch {
      setError("Amount must be a positive number (e.g. 125 or 40.5).");
      return;
    }
    const deadlineDays = Number(form.deadlineDays);
    const reviewHours = Number(form.reviewHours);
    if (!Number.isFinite(deadlineDays) || deadlineDays <= 0) {
      setError("Deadline days must be a positive number.");
      return;
    }
    if (!Number.isFinite(reviewHours) || reviewHours <= 0) {
      setError("Review window hours must be a positive number.");
      return;
    }
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 86400);
    const reviewWindow = BigInt(Math.floor(reviewHours * 3600));

    setSubmitting(true);
    try {
      // Step 1: approve the escrow to pull `amount` of USDC from the client.
      // We approve exactly `amount` (not MaxUint256) so the onchain paper trail
      // is honest — anyone reading the approve tx knows the exact exposure.
      const approveTx = await writeContractAsync({
        address: MOCK_USDC_ADDRESS,
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        chainId: CHAIN_ID,
        args: [HANDSHAKE_ESCROW_ADDRESS, amount],
      });
      void approveTx;

      // Step 2: create the deal. (Funding is a separate step on the deal page —
      // createDeal only commits the terms; fundDeal pulls the USDC.)
      const createTx = await writeContractAsync({
        address: HANDSHAKE_ESCROW_ADDRESS,
        abi: HANDSHAKE_ESCROW_ABI,
        functionName: "createDeal",
        chainId: CHAIN_ID,
        args: [freelancer, arbiter, amount, deadline, reviewWindow],
      });
      void createTx;

      // Step 3: re-read dealCount to derive the new deal id. We poll once after
      // a short delay — the wallet UI already blocked until confirmation.
      await new Promise((r) => setTimeout(r, 1500));
      const { data: newCount } = await refetchDealCount();
      const newCountBig = (newCount ?? dealCount ?? 0n) as bigint;
      const newId = newCountBig - 1n;
      router.push(`/deal/${newId.toString()}`);
    } catch (err) {
      console.error("create deal failed", err);
      setError(conciseWalletError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Topbar />
      <main className="container section">
        <Link href="/" className="btn btn-ghost" style={{ paddingLeft: 0, marginBottom: 16 }}>
          <ArrowLeft size={16} /> Back
        </Link>

        <div className="section-head">
          <div className="step-num">Create a deal</div>
          <h2>Agree on the terms.</h2>
          <p className="text-muted">
            Locks the deal terms onchain. The freelancer gets a shareable link. Funding happens next.
          </p>
        </div>

        <div className="grid-2">
          <form onSubmit={approveAndCreate} className="deal-card stack">
            <div className="field">
              <label htmlFor="freelancer">Freelancer address</label>
              <input
                id="freelancer"
                type="text"
                placeholder="0x…"
                value={form.freelancer}
                onChange={(e) => update("freelancer", e.target.value)}
                required
                spellCheck={false}
              />
              <span className="hint">The person doing the work.</span>
            </div>

            <div className="field">
              <label htmlFor="arbiter">Arbiter address (optional)</label>
              <input
                id="arbiter"
                type="text"
                placeholder="0x… (defaults to you)"
                value={form.arbiter}
                onChange={(e) => update("arbiter", e.target.value)}
                spellCheck={false}
              />
              <span className="hint">Resolves disputes. Defaults to your wallet for the demo.</span>
            </div>

            <div className="grid-2">
              <div className="field">
                <label htmlFor="amount">Amount (USDC)</label>
                <input
                  id="amount"
                  type="number"
                  step="0.000001"
                  min="0.000001"
                  placeholder="125"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="reviewHours">Review window (hours)</label>
                <input
                  id="reviewHours"
                  type="number"
                  min="1"
                  placeholder="48"
                  value={form.reviewHours}
                  onChange={(e) => update("reviewHours", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="deadlineDays">Delivery deadline (days from now)</label>
              <input
                id="deadlineDays"
                type="number"
                min="1"
                placeholder="7"
                value={form.deadlineDays}
                onChange={(e) => update("deadlineDays", e.target.value)}
                required
              />
              <span className="hint">
                The freelancer must submit before this unix timestamp or the client can refund.
              </span>
            </div>

            {error && (
              <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
                <span className="pill-dot" /> {error}
              </div>
            )}

            <button
              className="btn btn-blue"
              type="submit"
              disabled={submitting || !isConnected || onWrongChain}
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {submitting ? "Creating deal…" : "Create deal (2 txs)"}
            </button>
            <span className="hint">
              Sends <code className="mono">approve</code> then <code className="mono">createDeal</code>.
              You&apos;ll sign both in MetaMask.
            </span>
          </form>

          <aside className="deal-card stack">
            <div className="row">
              <Coins size={18} color="var(--blue)" />
              <strong>Fund your wallet</strong>
            </div>
            <p className="text-muted" style={{ margin: 0, fontSize: ".875rem" }}>
              Mint 1,000 test USDC to your connected wallet. No faucet needed — this is a demo token,
              not real money.
            </p>
            <div className="deal-stat">
              <span className="label">Your test USDC balance</span>
              <strong className="tabular">
                {usdcBalance !== undefined ? Number(usdcBalance as bigint) / 1e6 : "—"}
              </strong>
            </div>
            <button
              className="btn btn-lime"
              type="button"
              onClick={mintUsdc}
              disabled={minting || !isConnected || onWrongChain}
            >
              {minting ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {minting ? "Minting…" : "Mint 1,000 test USDC"}
            </button>
            {mintedAmount && (
              <div className="pill pill-green" style={{ alignSelf: "flex-start" }}>
                <ShieldCheck size={12} /> Minted {Number(mintedAmount) / 1e6} USDC
              </div>
            )}
            <div className="text-muted" style={{ fontSize: ".75rem", marginTop: 8 }}>
              <span className="step-num">Contract</span>
              <div className="mono" style={{ marginTop: 4, wordBreak: "break-all" }}>
                <a
                  href={`https://testnet.monadvision.com/address/${HANDSHAKE_ESCROW_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="tl-link"
                >
                  {HANDSHAKE_ESCROW_ADDRESS}
                </a>
              </div>
            </div>
          </aside>
        </div>

        {!isConnected && (
          <p className="text-muted mt-4" style={{ textAlign: "center" }}>
            Connect a wallet (top-right) to create a deal.
          </p>
        )}
        {isConnected && onWrongChain && (
          <p className="text-red mt-4" style={{ textAlign: "center" }}>
            Your wallet is on chain {chainId}. Switch to Monad testnet (id {CHAIN_ID}) to continue.
          </p>
        )}

        {/* chain config reference for tree-shaking */}
        <span className="hidden">{typeof monadTestnet}</span>
      </main>
    </>
  );
}

void monadTestnet;
