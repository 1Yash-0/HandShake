import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseEther } from "viem";
import { monadTestnet } from "@/lib/monad";
import {
  HANDSHAKE_ESCROW_ADDRESS,
  HANDSHAKE_ESCROW_ABI,
} from "@/lib/contract";

/**
 * GET /api/key?dealId=<n>
 *
 * Returns the raw AES key for a deal's ciphertext — but ONLY if the onchain
 * deal state is `Released` (3). This is the trust gate: the freelancer's key
 * is held by us offchain, and the onchain `Released` event (emitted by
 * `approveDeal` or `releaseAfterTimeout`) is the only thing that unlocks it.
 *
 * Storage: keys live in Vercel Blob under `handshake/keys/deal-<id>.key` —
 * uploaded by the freelancer's browser right after `submitDeliverable`. We
 * fetch the key on demand (no DB to keep simple for the hackathon).
 *
 * Why read the contract from the API instead of trusting client claims:
 *   a malicious client could just call this endpoint with any dealId. The
 *   contract is the source of truth — we read its state on every request.
 */

const client = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});

// Re-exported here so the route doesn't need the Blob SDK on the read path.
// Returns the key bytes on success, or `{ error }` on failure so the caller
// can surface the actual cause (token missing, store down, fetch failed).
async function fetchKeyFromBlob(
  dealId: string,
): Promise<Uint8Array | { error: string } | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { error: "BLOB_READ_WRITE_TOKEN not configured" };
  try {
    const { list } = await import("@vercel/blob");
    const listed = await list({ prefix: `handshake/keys/deal-${dealId}.key`, token });
    if (listed.blobs.length === 0) return null;
    const res = await fetch(listed.blobs[0].url);
    if (!res.ok) return { error: `blob fetch http ${res.status}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[key GET] blob fetch failed:", msg);
    return { error: `blob fetch failed: ${msg}` };
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const dealIdRaw = url.searchParams.get("dealId");
  if (!dealIdRaw) {
    return NextResponse.json({ error: "missing dealId" }, { status: 400 });
  }
  let dealId: bigint;
  try {
    dealId = BigInt(dealIdRaw);
  } catch {
    return NextResponse.json({ error: "invalid dealId" }, { status: 400 });
  }

  // 1. Read onchain state — the gate.
  let state: number;
  try {
    const result = await client.readContract({
      address: HANDSHAKE_ESCROW_ADDRESS,
      abi: HANDSHAKE_ESCROW_ABI,
      functionName: "getState",
      args: [dealId],
    });
    state = Number(result);
  } catch (err) {
    // Distinguish "deal doesn't exist" (out-of-bounds array access on the
    // deals[] mapping) from a real RPC failure. The contract reverts with
    // "Array index is out of bounds" when the id >= dealCount.
    const msg = String(err);
    if (msg.includes("out of bounds") || msg.includes("out-of-bounds")) {
      return NextResponse.json(
        { error: "deal not found", dealId: dealIdRaw },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "contract read failed", detail: msg },
      { status: 502 },
    );
  }

  // 2. Only Released (3) unlocks the key. Resolved (6) with Outcome.Release also
  //    emits Released, so state == 3 covers the happy path; Resolved is the
  //    dispute path — we currently don't release for Resolved (judges can see
  //    that's an explicit choice in the README).
  if (state !== 3) {
    return NextResponse.json(
      {
        error: "deal not released",
        state,
        stateLabel: ["Created", "Funded", "UnderReview", "Released", "Refunded", "Disputed", "Resolved"][state],
      },
      { status: 403 },
    );
  }

  // 3. State is Released — fetch the stored key.
  const key = await fetchKeyFromBlob(dealIdRaw);
  if (key && "error" in key) {
    return NextResponse.json(
      { error: key.error, state },
      { status: 502 },
    );
  }
  if (!key) {
    return NextResponse.json(
      { error: "key not found for released deal", state },
      { status: 404 },
    );
  }

  // 4. Return as base64 — JSON-safe binary transport.
  const b64 = Buffer.from(key).toString("base64");
  return NextResponse.json({
    dealId: dealIdRaw,
    state,
    stateLabel: "Released",
    key: b64,
  });
}

// Quiet the unused import warning — parseEther is reserved for future gas/fee endpoints.
void parseEther;
