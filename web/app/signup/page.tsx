"use client";

import { Suspense } from "react";
import LoginPage from "../login/page";

/**
 * /signup — same flow as /login with the "Join" copy variant.
 *
 * There is no actual account creation in Handshake: the wallet IS the
 * identity, and the role is a UI preference stored client-side. So signup
 * and login are functionally identical — we just frame the language
 * differently for first-time visitors.
 *
 * The login page reads `?mode=signup` from the search params to switch copy.
 * We wrap in <Suspense> because useSearchParams must be inside a Suspense
 * boundary during static prerender.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
