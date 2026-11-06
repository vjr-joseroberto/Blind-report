import { actionFor } from "@safe-whistle/core";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { GateError } from "./errors.ts";

export type RpContext = { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };

const KEY_RE = /^[0-9a-fA-F]{64}$/;
const RP_RE = /^rp_[A-Za-z0-9]+$/;

/** RP context signer. Runs ONLY on the server: the signing key never goes to the browser. */
export function createRpContextSigner(opts: { signingKeyHex: string; rpId: string; ttlSeconds?: number }) {
  const key = opts.signingKeyHex.replace(/^0x/, "");
  if (!KEY_RE.test(key)) throw new GateError("config", "The RP signing key is invalid (expected 32 bytes in hexadecimal).");
  if (!RP_RE.test(opts.rpId)) throw new GateError("config", "The rp_id must have the format rp_….");
  const ttl = opts.ttlSeconds ?? 300;

  return {
    /** Signed context for the action `submit:<newsroom>:<epoch>`. */
    rpContextFor(a: { newsroom: string; epoch: number }): RpContext {
      const action = actionFor(a.newsroom, a.epoch);
      const sig = signRequest({ signingKeyHex: key, action, ttl });
      return { rp_id: opts.rpId, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig };
    },
  };
}
