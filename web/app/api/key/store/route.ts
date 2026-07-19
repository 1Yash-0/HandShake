import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * POST /api/key/store
 *
 * Stores the raw AES key for a deal, uploaded by the freelancer's browser
 * immediately after `submitDeliverable` lands onchain. The key lives at a
 * deterministic Blob path: `handshake/keys/deal-<id>.key`.
 *
 * The key is only ever returned by GET /api/key — and only when the onchain
 * deal state is `Released` (3). So storing the key here is safe: it is inert
 * until the contract unlocks it.
 *
 * Body: raw 32 bytes (Content-Type: application/octet-stream).
 * Headers: x-deal-id: <number>
 */
export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN not configured" },
      { status: 503 },
    );
  }

  const dealId = req.headers.get("x-deal-id");
  if (!dealId) {
    return NextResponse.json({ error: "missing x-deal-id header" }, { status: 400 });
  }

  const body = await req.arrayBuffer();
  if (body.byteLength !== 32) {
    return NextResponse.json(
      { error: `expected 32-byte AES-256 key, got ${body.byteLength}` },
      { status: 400 },
    );
  }

  const pathname = `handshake/keys/deal-${dealId}.key`;
  // The returned URL is intentionally unused — the key is only ever read back
  // via GET /api/key (which fetches the deterministic path, not the returned
  // URL). Keeping `access: "public"` because Blob requires it for put(), but
  // the raw bytes are inert until the onchain Released gate opens.
  try {
    await put(pathname, body, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/octet-stream",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[key/store] blob put failed:", msg);
    return NextResponse.json(
      { error: `blob put failed: ${msg}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ stored: true, dealId, size: body.byteLength });
}
