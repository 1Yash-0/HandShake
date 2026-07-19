import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/blob/list?dealId=<n>
 *
 * Lists the ciphertext blob for a deal. We stored it at a deterministic path
 * `handshake/deal-<id>/<timestamp>.bin` — the most recent one wins.
 *
 * The deal page uses this on the unlock path to find the ciphertext URL after
 * the key has been released. It's read-only and contains no secret — the
 * ciphertext is useless without the AES key.
 */
export async function GET(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "BLOB_READ_WRITE_TOKEN not configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const dealId = url.searchParams.get("dealId");
  if (!dealId) return NextResponse.json({ error: "missing dealId" }, { status: 400 });

  const { list } = await import("@vercel/blob");
  const listed = await list({
    prefix: `handshake/deal-${dealId}/`,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  // Most recent first — the .bin files only (skip .meta.json sidecars).
  const bins = listed.blobs
    .filter((b) => b.pathname.endsWith(".bin"))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  if (bins.length === 0) {
    return NextResponse.json({ error: "no ciphertext blob for this deal" }, { status: 404 });
  }
  return NextResponse.json({ url: bins[0].url, pathname: bins[0].pathname });
}
