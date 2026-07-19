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

  const { list, issueSignedToken, presignUrl } = await import("@vercel/blob");
  let listed;
  try {
    listed = await list({
      prefix: `handshake/deal-${dealId}/`,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[blob/list] list failed:", msg);
    return NextResponse.json(
      { error: `blob list failed: ${msg}` },
      { status: 502 },
    );
  }
  // Most recent first — the .bin files only (skip .meta.json sidecars).
  const bins = listed.blobs
    .filter((b) => b.pathname.endsWith(".bin"))
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

  if (bins.length === 0) {
    return NextResponse.json({ error: "no ciphertext blob for this deal" }, { status: 404 });
  }

  // Private store: the raw blob URL isn't fetchable from the browser. Issue a
  // short-lived signed token scoped to this pathname, presign a GET URL, and
  // hand that to the client. The unlock flow fetches this URL in the browser.
  const target = bins[0];
  try {
    const token = await issueSignedToken({
      pathname: target.pathname,
      operations: ["get"],
      validUntil: Date.now() + 60 * 60 * 1000, // 1 hour
    });
    const { presignedUrl } = await presignUrl(token, {
      operation: "get",
      pathname: target.pathname,
      access: "private",
    });
    return NextResponse.json({ url: presignedUrl, pathname: target.pathname });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[blob/list] sign failed:", msg);
    return NextResponse.json(
      { error: `blob sign failed: ${msg}` },
      { status: 502 },
    );
  }
}
