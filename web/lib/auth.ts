"use client";

import { useSyncExternalStore } from "react";
import { recoverMessageAddress } from "viem";
import { monadTestnet } from "./monad";

/**
 * Client-side role session for Handshake.
 *
 * The session is a UI preference — the user's role (client or freelancer)
 * plus the wallet address they signed in with. It is stored in localStorage
 * and verified with a Sign-In-with-Ethereum (EIP-4361) signature at login
 * time so we know the connected wallet actually belongs to the user.
 *
 * SECURITY FRAMING (honest, for the README):
 *   The session is NOT a security boundary. The escrow contract is. The role
 *   only controls which screens the UI surfaces — every onchain action is
 *   still authorized by the contract based on the deal's stored parties, not
 *   by this session. A client pretending to be a freelancer in the UI gains
 *   nothing: they can't submit a deliverable on someone else's deal because
 *   `HandshakeEscrow.submitDeliverable` checks `msg.sender == freelancer`.
 *
 *   A real production system would issue a server-side session token after
 *   SIWE verification. We skip the server because there's nothing to protect
 *   — the contract is the trust gate.
 */

export type Role = "client" | "freelancer";

export type Session = {
  address: `0x${string}`;
  role: Role;
  /** Unix ms of login — used to display "session age" if needed, not for auth. */
  loginAt: number;
  /** SIWE signature, kept so the user can re-verify on reload without re-signing. */
  signature: `0x${string}`;
  /** The exact SIWE message that was signed. */
  message: string;
};

const STORAGE_KEY = "handshake:session:v1";

// ─── localStorage as an external store (useSyncExternalStore) ───────────────

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (
      typeof parsed.address === "string" &&
      (parsed.role === "client" || parsed.role === "freelancer") &&
      typeof parsed.signature === "string" &&
      typeof parsed.message === "string"
    ) {
      return parsed as Session;
    }
    return null;
  } catch {
    return null;
  }
}

let currentSession: Session | null = null;
let hydrated = false;

function hydrate() {
  if (hydrated) return;
  hydrated = true;
  currentSession = readSession();
}

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(callback: () => void): () => void {
  hydrate();
  listeners.add(callback);
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function onStorage(e: StorageEvent) {
  if (e.key === STORAGE_KEY) {
    currentSession = readSession();
    emit();
  }
}

function getSnapshot(): Session | null {
  hydrate();
  return currentSession;
}

function getServerSnapshot(): Session | null {
  return null;
}

/** React hook returning the current session, live-updating. */
export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ─── mutations ──────────────────────────────────────────────────────────────

export function saveSession(s: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  currentSession = s;
  emit();
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  currentSession = null;
  emit();
}

// ─── SIWE ────────────────────────────────────────────────────────────────────

/**
 * Build an EIP-4361 (SIWE) message for the given address + role.
 * Minimal but compliant: domain, address, statement, uri, version, chainId,
 * nonce, issuedAt. No expiration, no resources — short and easy to read in
 * the MetaMask sign dialog.
 */
export function buildSiweMessage(args: {
  address: `0x${string}`;
  role: Role;
  nonce: string;
}): string {
  const { address, role, nonce } = args;
  const domain = typeof window !== "undefined" ? window.location.host : "handshake.local";
  const uri = typeof window !== "undefined" ? window.location.origin : "https://handshake.local";
  const statement = `Sign in to Handshake as ${role === "client" ? "a client" : "a freelancer"}.`;
  const issuedAt = new Date().toISOString();
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    "",
    statement,
    "",
    `URI: ${uri}`,
    "Version: 1",
    `Chain ID: ${monadTestnet.id}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

/** Random 8-byte hex nonce. */
export function newNonce(): string {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return Math.random().toString(36).slice(2);
}

/**
 * Verify a SIWE signature client-side: recover the signer address from the
 * signature and check it matches the claimed address. Returns true if it
 * matches.
 *
 * Uses viem's `recoverMessageAddress` which handles the EIP-191 prefix
 * correctly for personal_sign messages.
 */
export async function verifySiweSignature(args: {
  message: string;
  signature: `0x${string}`;
  expectedAddress: `0x${string}`;
}): Promise<boolean> {
  try {
    // `recoverMessageAddress` with a string message handles the EIP-191
    // personal_sign prefix internally — exactly matching what MetaMask signs.
    const recovered = await recoverMessageAddress({
      message: args.message,
      signature: args.signature,
    });
    return recovered.toLowerCase() === args.expectedAddress.toLowerCase();
  } catch {
    return false;
  }
}
