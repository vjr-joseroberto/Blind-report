import { actionFor } from "@safe-whistle/core";
import { signRequest } from "@worldcoin/idkit-core/signing";
import { GateError } from "./errors.ts";

export type RpContext = { rp_id: string; nonce: string; created_at: number; expires_at: number; signature: string };

const KEY_RE = /^[0-9a-fA-F]{64}$/;
const RP_RE = /^rp_[A-Za-z0-9]+$/;

/** Assinador do contexto RP. Roda SÓ no servidor: a chave de assinatura nunca vai ao navegador. */
export function createRpContextSigner(opts: { signingKeyHex: string; rpId: string; ttlSeconds?: number }) {
  const key = opts.signingKeyHex.replace(/^0x/, "");
  if (!KEY_RE.test(key)) throw new GateError("config", "A chave de assinatura RP é inválida (esperado 32 bytes em hexadecimal).");
  if (!RP_RE.test(opts.rpId)) throw new GateError("config", "O rp_id deve ter o formato rp_….");
  const ttl = opts.ttlSeconds ?? 300;

  return {
    /** Contexto assinado para a ação `submit:<redação>:<época>`. */
    rpContextFor(a: { newsroom: string; epoch: number }): RpContext {
      const action = actionFor(a.newsroom, a.epoch);
      const sig = signRequest({ signingKeyHex: key, action, ttl });
      return { rp_id: opts.rpId, nonce: sig.nonce, created_at: sig.createdAt, expires_at: sig.expiresAt, signature: sig.sig };
    },
  };
}
