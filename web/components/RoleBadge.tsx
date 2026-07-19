"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAccount, useDisconnect } from "wagmi";
import { LogOut, Briefcase, Wallet } from "lucide-react";
import { useSession, clearSession, type Role } from "@/lib/auth";

/**
 * Compact role + wallet indicator for the topbar. Shown when the user has a
 * Handshake session. Clicking the badge opens a small inline menu with the
 * user's role dashboard and a logout action.
 *
 * Logout = clear the local session AND disconnect the wagmi account, so the
 * next visitor on this browser has to sign in fresh.
 *
 * Anti-slop: this is a single affordance, not a chip + a button + a chip. It
 * reads as one identity pill with a clear state (role + address) and a clear
 * action (logout). The role icon is the state cue (Briefcase for client,
 * Wallet for freelancer) — not decoration.
 */
export function RoleBadge() {
  const session = useSession();
  const { address: connectedAddress } = useAccount();
  const { disconnectAsync } = useDisconnect();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const short = useMemo(() => {
    const a = session?.address ?? connectedAddress;
    if (!a) return "";
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
  }, [session?.address, connectedAddress]);

  if (!session) return null;

  const role: Role = session.role;
  const RoleIcon = role === "client" ? Briefcase : Wallet;
  const roleColor = role === "client" ? "var(--blue)" : "var(--lime)";
  const roleBg = role === "client" ? "oklch(94% .05 274)" : "oklch(92% .12 115)";
  const roleFg = role === "client" ? "var(--blue)" : "oklch(38% .09 115)";

  async function logout() {
    try {
      await disconnectAsync();
    } catch {
      // wallet already disconnected — fine
    }
    clearSession();
    setOpen(false);
    router.push("/");
  }

  return (
    <div className="role-badge" data-open={open}>
      <button
        type="button"
        className="role-badge-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="role-badge-icon" style={{ background: roleBg, color: roleFg }}>
          <RoleIcon size={14} strokeWidth={2.25} />
        </span>
        <span className="role-badge-label">
          <span className="role-badge-role">{role === "client" ? "Client" : "Freelancer"}</span>
          <span className="role-badge-addr mono">{short}</span>
        </span>
      </button>

      {open && (
        <>
          <div className="role-badge-overlay" onClick={() => setOpen(false)} aria-hidden />
          <div className="role-badge-menu" role="menu">
            <Link
              href={role === "client" ? "/client" : "/freelancer"}
              className="role-badge-item"
              onClick={() => setOpen(false)}
              role="menuitem"
            >
              <RoleIcon size={14} color={roleColor} />
              Your {role} dashboard
            </Link>
            <button
              type="button"
              className="role-badge-item role-badge-logout"
              onClick={logout}
              role="menuitem"
            >
              <LogOut size={14} />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

