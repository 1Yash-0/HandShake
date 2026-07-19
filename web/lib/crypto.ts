/**
 * Web Crypto AES-GCM helpers for the Handshake handoff flow.
 *
 * Lifecycle of a deal's file:
 *   1. Freelancer picks a file. We generate a fresh AES-GCM 256 key in-browser.
 *   2. `encryptFile()` produces { ciphertext, iv } — the file never leaves the
 *      freelancer's browser unencrypted.
 *   3. `sha256Hex()` of the ciphertext becomes `ciphertextHash` committed onchain
 *      via `HandshakeEscrow.submitDeliverable(id, hash)` — the client can later
 *      verify the ciphertext they fetch matches what was committed.
 *   4. The raw AES key is sent to `/api/key` storage, keyed by dealId. It is
 *      ONLY returned when the onchain deal state is `Released` (3).
 *   5. The client downloads the ciphertext from Vercel Blob, fetches the key
 *      from `/api/key?dealId=`, and `decryptFile()` reconstructs the original.
 *
 * All of this runs in the browser. The key is held in memory between encrypt
 * and upload, then POSTed to the key-release API once — never stored client-side.
 */

/**
 * Coerce any typed array to a `Uint8Array` backed by a plain `ArrayBuffer`
 * (not `SharedArrayBuffer`). TS 5.7+ tightened `Uint8Array` to be generic
 * over `ArrayBufferLike`, but `crypto.subtle` only accepts `BufferSource`
 * backed by a real `ArrayBuffer`. Copying through `slice()` guarantees the
 * backing buffer is a fresh `ArrayBuffer` we can pass to Web Crypto.
 */
function toBytes(x: ArrayBuffer | Uint8Array | ArrayBufferView): Uint8Array<ArrayBuffer> {
  if (x instanceof ArrayBuffer) return new Uint8Array(x.slice(0));
  const view = x instanceof Uint8Array ? x : new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  // slice() returns a fresh Uint8Array backed by a fresh ArrayBuffer
  return view.slice() as Uint8Array<ArrayBuffer>;
}

const SUBTLE = typeof crypto !== "undefined" && crypto.subtle ? crypto.subtle : null;

if (!SUBTLE) {
  // SSR: bail. All functions below are client-only by construction.
  throw new Error("crypto.subtle unavailable — Handshake crypto requires a secure browser context.");
}

/**
 * AES-GCM 256, extractable — the raw key MUST be exportable so we can ship the
 * 32 bytes to /api/key/store, which gates release to onchain `Released`. The
 * key never touches disk on the client; exportKeyRaw() pulls it just long
 * enough to POST it, then the request body is GC'd.
 */
export async function generateAesKey(): Promise<CryptoKey> {
  return SUBTLE!.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Export the key as raw bytes — only used to ship to the key-release API, never to disk. */
export async function exportKeyRaw(key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const raw = await SUBTLE!.exportKey("raw", key);
  return toBytes(raw);
}

/** Import a raw 32-byte key back into a CryptoKey for the client decrypt path. */
export async function importKeyRaw(raw: Uint8Array): Promise<CryptoKey> {
  return SUBTLE!.importKey("raw", toBytes(raw), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

export type EncryptedFile = {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
};

/** Encrypt a file. 96-bit IV is the AES-GCM standard — 12 bytes, never reused with the same key. */
export async function encryptFile(file: File, key: CryptoKey): Promise<EncryptedFile> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = toBytes(await file.arrayBuffer());
  const ciphertext = toBytes(
    await SUBTLE!.encrypt({ name: "AES-GCM", iv }, key, plaintext),
  );
  return { ciphertext, iv };
}

/** Decrypt a ciphertext blob using the key released by `/api/key`. */
export async function decryptFile(ciphertext: Uint8Array, iv: Uint8Array, key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  return toBytes(await SUBTLE!.decrypt({ name: "AES-GCM", iv: toBytes(iv) }, key, toBytes(ciphertext)));
}

/** SHA-256 of a byte array, returned as a 0x-prefixed lowercase hex string — goes onchain as `ciphertextHash`. */
export async function sha256Hex(bytes: Uint8Array): Promise<`0x${string}`> {
  const digest = await SUBTLE!.digest("SHA-256", toBytes(bytes));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}` as `0x${string}`;
}

/** Stable id for the AES key stored against a deal — we key by onchain deal id only. */
export function keyStoreId(dealId: bigint | number): string {
  return `deal-${dealId.toString()}`;
}
