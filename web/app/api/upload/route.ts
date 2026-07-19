import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

/**
 * POST /api/upload
 *
 * Stores an encrypted deliverable (ciphertext bytes) in Vercel Blob and returns
 * the blob URL + a SHA-256 the freelancer commits onchain as `ciphertextHash`.
 *
 * The request body is the raw ciphertext bytes (Content-Type: application/octet-stream).
 * We deliberately do NOT accept JSON here — ciphertext is binary, and base64-encoding
 * it would inflate the payload by 33% for no reason.
 *
 * Auth: none. The ciphertext is useless without the AES key, which is stored by
 * /api/key and only released when the onchain deal is `Released`. The hash committed
 * onchain is what proves this blob is the right one.
 *
 * Env: BLOB_READ_WRITE_TOKEN (set in Vercel project settings).
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
  if (body.byteLength === 0) {
    return NextResponse.json({ error: "empty body" }, { status: 400 });
  }
  if (body.byteLength > 50 * 1024 * 1024) {
    return NextResponse.json({ error: "file > 50MB cap" }, { status: 413 });
  }

  // SHA-256 the ciphertext server-side too — the freelancer trusts this over the
  // client-computed hash because it's computed on the bytes that actually got stored.
  const digest = await crypto.subtle.digest("SHA-256", body);
  const hashHex =
    "0x" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

  const pathname = `handshake/deal-${dealId}/${Date.now()}.bin`;
  let blob;
  try {
    blob = await put(pathname, body, {
      access: "private",
      addRandomSuffix: false,
      contentType: "application/octet-stream",
    });
  } catch (err) {
    // Surface the actual Blob error to the client + logs — without this
    // the route returns a generic 500 and the real cause (bad token, store
    // not found, billing limit, etc.) is invisible.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload] blob put failed:", msg);
    return NextResponse.json(
      { error: `blob put failed: ${msg}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    url: blob.url,
    hash: hashHex,
    size: body.byteLength,
  });
}
