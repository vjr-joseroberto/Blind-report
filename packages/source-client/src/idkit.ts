import { IDKit, proofOfHuman } from "@worldcoin/idkit-core";
import { ProofError } from "./errors.ts";
import type { IdKitPayload, ProofProvider } from "./types.ts";

/** Converte o motivo textual do IDKit em um dos três motivos que a tela sabe explicar. */
export function proofErrorFromIdKit(raw: unknown): ProofError {
  const t = String(raw ?? "").toLowerCase();
  if (/timeout|expire/.test(t)) return new ProofError("expired");
  if (/cancel|abort/.test(t)) return new ProofError("cancelled");
  return new ProofError("denied");
}

/** Fornecedor real: usa o IDKit sem interface. A tela mostra o link (ou QR) recebido em `onLink`. */
export function createIdKitProofProvider(opts: { onLink: (uri: string) => void; timeoutMs?: number }): ProofProvider {
  return async (req) => {
    const request = await IDKit.request({
      app_id: req.appId as `app_${string}`,
      action: req.action,
      rp_context: req.rpContext as never,
      allow_legacy_proofs: false,
      environment: req.environment,
    }).preset(proofOfHuman());
    opts.onLink(request.connectorURI);
    const done = await request.pollUntilCompletion({ timeout: opts.timeoutMs ?? 10 * 60 * 1000 });
    if (!done.success) throw proofErrorFromIdKit(done.error);
    return done.result as unknown as IdKitPayload;
  };
}
