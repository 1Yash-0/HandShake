"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Topbar } from "./Topbar";
import { useSession, type Role } from "@/lib/auth";

/**
 * Client-side role gate. Wraps a page that requires a logged-in user with a
 * specific role. If no session → redirect to /login. If session role doesn't
 * match → redirect to the user's own dashboard.
 *
 * Renders a brief loading state during the redirect so the protected content
 * never flashes (no FOUC of the wrong role's UI). The session is read via
 * useSyncExternalStore which hydrates from localStorage synchronously on the
 * client, so the gate resolves in one tick.
 *
 * This is a UI gate only — see lib/auth.ts for the security framing. The
 * contract still authorizes every onchain action by the deal's stored
 * parties, not by this session.
 *
 * No `redirecting` state: the render already gates on `!session ||
 * session.role !== role`, so the loading view shows for any state the effect
 * is navigating away from. `router.replace` in the effect is the canonical
 * "effect updates an external system (the URL bar)" pattern — no setState
 * needed, no cascading render.
 */
export function AuthGate({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(role === "client" ? "/client" : "/freelancer")}`);
      return;
    }
    if (session.role !== role) {
      router.replace(`/${session.role}`);
      return;
    }
  }, [session, role, router]);

  if (!session || session.role !== role) {
    return (
      <>
        <Topbar />
        <main className="container section">
          <div className="row text-muted">
            <Loader2 size={16} className="animate-spin" /> Redirecting…
          </div>
        </main>
      </>
    );
  }

  return <>{children}</>;
}
