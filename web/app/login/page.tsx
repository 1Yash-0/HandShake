"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useConnect, useChainId, useSignMessage } from "wagmi";
import {
  ArrowRight,
  Briefcase,
  Wallet,
  Loader2,
  ShieldCheck,
  LockKeyhole,
  FileKey2,
  ArrowLeft,
  AlertTriangle,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import {
  buildSiweMessage,
  newNonce,
  saveSession,
  verifySiweSignature,
  type Role,
} from "@/lib/auth";
import { monadTestnet } from "@/lib/monad";

/**
 * Login / signup page — the entry to the role-aware app.
 *
 * Layout: a two-pane "choose your side" split. The two panes are deliberately
 * NOT identical mirror cards (that's the identical-card-grid slop tell):
 *   - Left pane (Client): blue tint, "I'm hiring" copy, list of what a client
 *     sees (create deal, fund escrow, approve & release, unlock original).
 *   - Right pane (Freelancer): lime tint, "I'm working" copy, list of what a
 *     freelancer sees (accept deal, encrypt & submit, get paid on release).
 *
 * Selecting a pane promotes that role and reveals the wallet-connect form
 * in-place (no modal — modals are a last resort per impeccable). The other
 * pane recedes. A back button returns to the choice.
 *
 * On connect + SIWE sign, the session is stored and the user is redirected
 * to their role dashboard (`next` query param overrides).
 *
 * `/signup` is the same flow with different copy — we read the `?mode`
 * search param to switch "Sign in" / "Join" framing. Functionally identical
 * (the wallet IS the account; there's nothing to "create").
 *
 * `useSearchParams` requires a Suspense boundary during static prerender
 * (Next.js throws otherwise). We export a wrapper that suspends the inner
 * component; /signup reuses the same wrapper via dynamic import.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginInner />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <>
      <Topbar />
      <main className="login-page">
        <div className="container login-shell">
          <div className="row text-muted">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        </div>
      </main>
    </>
  );
}

function LoginInner() {
  const search = useSearchParams();
  const mode: "signin" | "signup" = search.get("mode") === "signup" ? "signup" : "signin";
  const next = search.get("next") ?? "";

  const [selectedRole, setSelectedRole] = useState<Role | null>(null);

  return (
    <>
      <Topbar />
      <main className="login-page">
        <div className="container login-shell">
          <div className="login-header">
            <Link href="/" className="login-back">
              <ArrowLeft size={14} /> Back to home
            </Link>
            <div className="login-eyebrow">
              {mode === "signup" ? "Join Handshake" : "Sign in"}
            </div>
            <h1 className="login-title">
              {mode === "signup" ? (
                <>
                  Two sides.
                  <br />
                  <span>One handshake.</span>
                </>
              ) : (
                <>
                  Pick your
                  <br />
                  <span>side of the deal.</span>
                </>
              )}
            </h1>
            <p className="login-lead text-muted">
              {mode === "signup"
                ? "No account to create — your wallet is your identity. Pick the side you're playing, sign once, and you're in."
                : "Handshake is a two-sided tool. Clients hire. Freelancers deliver. The contract holds the risk for both. Pick a side to see the right screens."}
            </p>
          </div>

          {!selectedRole ? (
            <RoleChoice onPick={setSelectedRole} mode={mode} />
          ) : (
            <WalletConnect
              role={selectedRole}
              mode={mode}
              next={next}
              onBack={() => setSelectedRole(null)}
            />
          )}

          <p className="login-foot text-muted">
            <ShieldCheck size={12} /> Your wallet stays yours. We never see your key —
            you sign a one-time{" "}
            <Link href="https://eips.ethereum.org/EIPS/eip-4361" target="_blank" rel="noreferrer">
              SIWE
            </Link>{" "}
            message to prove ownership. The escrow contract is the real trust gate, not this sign-in.
          </p>
        </div>
      </main>
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 1: role choice — two deliberately different panes.
// ────────────────────────────────────────────────────────────────────────────

function RoleChoice({
  onPick,
  mode,
}: {
  onPick: (role: Role) => void;
  mode: "signin" | "signup";
}) {
  return (
    <div className="role-split">
      <button
        type="button"
        className="role-pane role-pane-client"
        onClick={() => onPick("client")}
        aria-label="Continue as a client"
      >
        <div className="role-pane-head">
          <span className="role-pane-mark">
            <Briefcase size={22} strokeWidth={2.1} />
          </span>
          <span className="role-pane-tag">Client</span>
        </div>
        <h2 className="role-pane-title">I&apos;m hiring.</h2>
        <p className="role-pane-lead">
          Fund escrow, review the encrypted preview, approve to release payment and unlock the
          original.
        </p>
        <ul className="role-pane-list">
          <li><span className="role-pane-bullet" /> Create a deal with terms onchain</li>
          <li><span className="role-pane-bullet" /> Lock USDC in escrow — funds held by code</li>
          <li><span className="role-pane-bullet" /> Review the preview, never the source</li>
          <li><span className="role-pane-bullet" /> Approve & release, or open a dispute</li>
        </ul>
        <span className="role-pane-cta">
          {mode === "signup" ? "Join as a client" : "Sign in as a client"}
          <ArrowRight size={16} />
        </span>
      </button>

      <div className="role-split-axis" aria-hidden>
        <span className="role-split-mark">
          <LockKeyhole size={14} />
        </span>
      </div>

      <button
        type="button"
        className="role-pane role-pane-freelancer"
        onClick={() => onPick("freelancer")}
        aria-label="Continue as a freelancer"
      >
        <div className="role-pane-head">
          <span className="role-pane-mark">
            <Wallet size={22} strokeWidth={2.1} />
          </span>
          <span className="role-pane-tag">Freelancer</span>
        </div>
        <h2 className="role-pane-title">I&apos;m working.</h2>
        <p className="role-pane-lead">
          Encrypt the original in your browser. Submit only the ciphertext hash. Get paid on
          approval or auto-release.
        </p>
        <ul className="role-pane-list">
          <li><span className="role-pane-bullet" /> Accept a deal link from your client</li>
          <li><span className="role-pane-bullet" /> Encrypt the file — plaintext never leaves</li>
          <li><span className="role-pane-bullet" /> Submit the ciphertext hash onchain</li>
          <li><span className="role-pane-bullet" /> Paid on approval, or on review-window timeout</li>
        </ul>
        <span className="role-pane-cta">
          {mode === "signup" ? "Join as a freelancer" : "Sign in as a freelancer"}
          <ArrowRight size={16} />
        </span>
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Stage 2: wallet connect + SIWE sign for the chosen role.
// ────────────────────────────────────────────────────────────────────────────

type Stage = "connect" | "signing" | "verifying" | "redirecting" | "error";

function WalletConnect({
  role,
  mode,
  next,
  onBack,
}: {
  role: Role;
  mode: "signin" | "signup";
  next: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync } = useConnect();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const [stage, setStage] = useState<Stage>("connect");
  const [error, setError] = useState<string | null>(null);

  const metaMask =
    connectors.find((c) => c.id === "io.metamask" || c.name.toLowerCase().includes("metamask")) ??
    connectors[0];

  const onWrongChain = isConnected && chainId !== monadTestnet.id;
  const RoleIcon = role === "client" ? Briefcase : Wallet;
  const roleAccent = role === "client" ? "var(--blue)" : "oklch(60% .15 115)";

  // If already connected, jump straight to signing.
  useEffect(() => {
    if (isConnected && !onWrongChain && stage === "connect") {
      void beginSign();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, onWrongChain]);

  async function connectAndSign() {
    setError(null);
    if (!metaMask) {
      setError("No wallet found. Install MetaMask or use a web3-enabled browser.");
      return;
    }
    setStage("signing");
    try {
      try {
        await connectAsync({ connector: metaMask, chainId: monadTestnet.id });
      } catch {
        // user rejected the chain-add prompt — fall back to plain connect
        await connectAsync({ connector: metaMask });
      }
      // after connect, the effect above will fire beginSign once `isConnected`
      // is true. But also call it here for the case where they were already
      // connected but on the wrong chain (we just switched).
      await beginSign();
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function beginSign() {
    if (!address) return;
    setStage("signing");
    setError(null);
    try {
      const nonce = newNonce();
      const message = buildSiweMessage({ address, role, nonce });
      const signature = await signMessageAsync({ message });
      setStage("verifying");
      const ok = await verifySiweSignature({ message, signature, expectedAddress: address });
      if (!ok) {
        setStage("error");
        setError("Signature verification failed. Try again.");
        return;
      }
      saveSession({
        address,
        role,
        loginAt: Date.now(),
        signature,
        message,
      });
      setStage("redirecting");
      const dest = next || (role === "client" ? "/client" : "/freelancer");
      router.replace(dest);
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className={`connect-panel connect-panel-${role}`}>
      <button type="button" className="login-back" onClick={onBack}>
        <ArrowLeft size={14} /> Choose the other side
      </button>

      <div className="connect-panel-head">
        <span className="connect-panel-mark">
          <RoleIcon size={22} strokeWidth={2.1} />
        </span>
        <div>
          <div className="connect-panel-role">
            {mode === "signup" ? "Joining as" : "Signing in as"}{" "}
            <strong>{role === "client" ? "Client" : "Freelancer"}</strong>
          </div>
          <p className="text-muted">
            {role === "client"
              ? "You'll see the create-deal flow, your funded escrows, and the unlock path."
              : "You'll see deals sent to you, the encrypted-handoff flow, and your payouts."}
          </p>
        </div>
      </div>

      <div className="connect-panel-body">
        {stage === "connect" && !isConnected && (
          <>
            <button className="btn btn-dark connect-wallet-btn" onClick={connectAndSign}>
              <Wallet size={16} /> Connect MetaMask
            </button>
            <p className="connect-hint text-muted">
              Connects your wallet to Monad testnet (id {monadTestnet.id}). You&apos;ll sign once to
              prove ownership.
            </p>
          </>
        )}

        {isConnected && onWrongChain && (
          <>
            <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
              <AlertTriangle size={12} /> Your wallet is on chain {chainId}. Switch to Monad testnet.
            </div>
            <button
              className="btn btn-blue"
              onClick={async () => {
                if (!metaMask) return;
                await connectAsync({ connector: metaMask, chainId: monadTestnet.id });
              }}
            >
              Switch to Monad testnet
            </button>
          </>
        )}

        {stage === "signing" && (
          <div className="connect-step">
            <Loader2 size={16} className="animate-spin" />
            <span>
              {isConnected
                ? "Waiting on your wallet — sign the sign-in message."
                : "Waiting on your wallet — connect to continue."}
            </span>
          </div>
        )}

        {stage === "verifying" && (
          <div className="connect-step">
            <Loader2 size={16} className="animate-spin" />
            <span>Verifying your signature…</span>
          </div>
        )}

        {stage === "redirecting" && (
          <div className="connect-step">
            <ShieldCheck size={16} color="var(--green)" />
            <span>Signed in. Taking you to your {role} dashboard…</span>
          </div>
        )}

        {stage === "error" && (
          <>
            <div className="pill pill-red" style={{ alignSelf: "flex-start" }}>
              <AlertTriangle size={12} /> {error ?? "Something went wrong."}
            </div>
            <button
              className="btn btn-soft"
              onClick={() => {
                setError(null);
                setStage("connect");
              }}
            >
              Try again
            </button>
          </>
        )}

        {/* Already connected but idle — let them kick off the sign */}
        {isConnected && !onWrongChain && stage === "connect" && (
          <>
            <div className="connect-connected-row">
              <span className="pill pill-green">
                <span className="pill-dot" /> Connected
              </span>
              <span className="mono" style={{ fontSize: ".8125rem" }}>
                {address?.slice(0, 10)}…{address?.slice(-8)}
              </span>
            </div>
            <button className="btn btn-blue connect-wallet-btn" onClick={beginSign}>
              <FileKey2 size={16} /> Sign in to continue
            </button>
          </>
        )}
      </div>

      <div className="connect-panel-side">
        <div className="connect-panel-promise">
          <RoleIcon size={14} color={roleAccent} />
          <span>
            {role === "client"
              ? "The contract holds your USDC until you approve. Nothing is released without your sign-off — or a review-window timeout the freelancer can call."
              : "The contract pays you the moment the client approves, or the moment the review window times out. The key never leaves the gate until then."}
          </span>
        </div>
      </div>
    </div>
  );
}
