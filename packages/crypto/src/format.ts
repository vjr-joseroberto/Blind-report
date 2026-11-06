import type { Envelope } from "@safe-whistle/core";
import { CryptoError } from "./errors.ts";
import { sodium } from "./sodium.ts";

// Binary container: "SW" | version (1 byte) | header size (4 bytes, big-endian) | JSON header | raw ciphertext.
// The ciphertext is not base64-encoded, which would avoid ~33% inflation on the Arkiv 128 KiB limit.
const MAGIC = [0x53, 0x57];
const FORMAT_VERSION = 1;
const PREAMBLE = 7;
const MAX_HEADER_BYTES = 64 * 1024;
const B64 = sodium.base64_variants.URLSAFE_NO_PADDING;
const HASH_RE = /^0x[0-9a-f]{64}$/;

type Header = {
  v: 1;
  newsroom: string;
  pubkeyVersion: number;
  category: string;
  wrappedKeys: { recipient: string; sealed: string }[];
  nonce: string;
  contentHash: string;
  commitment: string;
  mailboxPub: string;
  clientTs: number;
};

export function encodeEnvelope(e: Envelope): Uint8Array {
  const header: Header = {
    v: 1,
    newsroom: e.newsroom,
    pubkeyVersion: e.pubkeyVersion,
    category: e.category,
    wrappedKeys: e.wrappedKeys.map((w) => ({ recipient: w.recipient, sealed: sodium.to_base64(w.sealed, B64) })),
    nonce: sodium.to_base64(e.nonce, B64),
    contentHash: e.contentHash,
    commitment: e.commitment,
    mailboxPub: sodium.to_base64(e.mailboxPub, B64),
    clientTs: e.clientTs,
  };
  const head = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(PREAMBLE + head.length + e.ciphertext.length);
  out.set(MAGIC, 0);
  out[2] = FORMAT_VERSION;
  new DataView(out.buffer).setUint32(3, head.length, false);
  out.set(head, PREAMBLE);
  out.set(e.ciphertext, PREAMBLE + head.length);
  return out;
}

const bad = (msg: string) => new CryptoError("format", msg);

function b64(value: unknown, field: string, length?: number): Uint8Array {
  if (typeof value !== "string") throw bad(`Invalid field: ${field}`);
  let bytes: Uint8Array;
  try {
    bytes = sodium.from_base64(value, B64);
  } catch {
    throw bad(`Invalid field: ${field}`);
  }
  if (length !== undefined && bytes.length !== length) throw bad(`Invalid length: ${field}`);
  return bytes;
}

export function decodeEnvelope(bytes: Uint8Array): Envelope {
  if (bytes.length < PREAMBLE || bytes[0] !== MAGIC[0] || bytes[1] !== MAGIC[1]) throw bad("Not a Safe Whistle envelope.");
  if (bytes[2] !== FORMAT_VERSION) throw bad(`Unknown format version: ${bytes[2]}`);
  const headLen = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(3, false);
  if (headLen > MAX_HEADER_BYTES || PREAMBLE + headLen > bytes.length) throw bad("Invalid or truncated envelope header.");

  let h: Partial<Header>;
  try {
    h = JSON.parse(new TextDecoder().decode(bytes.subarray(PREAMBLE, PREAMBLE + headLen))) as Partial<Header>;
  } catch {
    throw bad("Unreadable envelope header.");
  }
  if (h.v !== 1) throw bad("Unsupported envelope version.");
  if (typeof h.newsroom !== "string" || typeof h.category !== "string") throw bad("Invalid text fields.");
  if (!Number.isInteger(h.pubkeyVersion) || (h.pubkeyVersion as number) < 1) throw bad("Invalid key version.");
  if (!Number.isInteger(h.clientTs)) throw bad("Invalid timestamp.");
  if (typeof h.contentHash !== "string" || !HASH_RE.test(h.contentHash)) throw bad("Invalid content hash.");
  if (typeof h.commitment !== "string" || !HASH_RE.test(h.commitment)) throw bad("Invalid commitment.");
  if (!Array.isArray(h.wrappedKeys) || h.wrappedKeys.length === 0) throw bad("No wrapped keys.");

  return {
    v: 1,
    newsroom: h.newsroom,
    pubkeyVersion: h.pubkeyVersion as number,
    category: h.category,
    wrappedKeys: h.wrappedKeys.map((w, i) => {
      if (typeof w?.recipient !== "string") throw bad(`Invalid wrapped key: ${i}`);
      return { recipient: w.recipient, sealed: b64(w.sealed, `wrappedKeys[${i}]`) };
    }),
    nonce: b64(h.nonce, "nonce", sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES),
    ciphertext: bytes.slice(PREAMBLE + headLen),
    contentHash: h.contentHash,
    commitment: h.commitment,
    mailboxPub: b64(h.mailboxPub, "mailboxPub", sodium.crypto_box_PUBLICKEYBYTES),
    clientTs: h.clientTs as number,
  };
}
