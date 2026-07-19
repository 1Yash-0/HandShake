"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";
import { ConnectButton } from "./ConnectButton";
import { RoleBadge } from "./RoleBadge";
import { useSession } from "@/lib/auth";

/**
 * Site topbar — brand left, nav middle, identity right.
 *
 * Identity is session-aware:
 *   - logged in  → <RoleBadge> (role + address + logout menu)
 *   - logged out → <ConnectButton> (raw wallet connect)
 *
 * Nav links adapt to the session role:
 *   - logged in as client    → "My deals" + "Create a deal"
 *   - logged in as freelancer → "My deals" + "Find work" (hint, no-op for now)
 *   - logged out             → landing-page section links
 *
 * Anti-slop: nav is a single horizontal row, no second row, no chip cluster.
 */
export function Topbar() {
  const session = useSession();
  const role = session?.role;

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link href="/" className="brand" aria-label="Handshake home">
          <span className="brand-mark">
            <Handshake size={20} color="var(--lime)" strokeWidth={2} />
          </span>
          <span>Handshake</span>
        </Link>

        <nav className="navlinks" aria-label="Sections">
          {role === "client" && (
            <>
              <Link href="/client">My deals</Link>
              <Link href="/create">Create a deal</Link>
            </>
          )}
          {role === "freelancer" && (
            <>
              <Link href="/freelancer">My deals</Link>
            </>
          )}
          {!role && (
            <>
              <Link href="/#how">How it works</Link>
              <Link href="/#rules">Deal rules</Link>
              <Link href="/login">Sign in</Link>
            </>
          )}
        </nav>

        {session ? <RoleBadge /> : <ConnectButton />}
      </div>
    </header>
  );
}
