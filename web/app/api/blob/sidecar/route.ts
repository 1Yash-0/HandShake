import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

/**
 * /api/blob/sidecar?dealId=<n>
 *
 *   GET  — returns the most recent .bin.meta.json sidecar URL for a deal
 *   POST — stores a new sidecar (raw JSON body)
 *
 * The sidecar holds the AES-GCM IV + filename + size + contentType the client
 * needs to reconstruct the decrypted file on the unlock path. It contains no
 * secret — the IV is public by design (AES-GCM assumes the IV is transmitted
 * with the ciphertext; only the key is secret).
 */
export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const dealId = url.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "missing dealId" }, { status: 400 });

  const text = await req.text();
  try {
    JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const pathname = `handshake/deal-${dealId}/${Date.now()}.bin.meta.json`;
  const blob = await put(pathname, text, {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });

  return NextResponse.json({ url: blob.url });
}

export async function GET(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const dealId = url.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "missing dealId" }, { status: 400 });

  const listed = await list({
    prefix: `handshake/deal-${dealId}/`,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  const sidecars = listed.blobs
    .filter((b) => b.pathname.endsWith(".bin.meta.json"))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  if (sidecars.length === 0) {
    return NextResponse.json({ error: "no sidecar for this deal" }, { status: 404 });
  }
  return NextResponse.json({ url: sidecars[0].url });
}
