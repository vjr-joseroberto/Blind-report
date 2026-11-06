export type SourceErrorCode =
  | "invalid_newsroom" | "newsroom_not_found" | "newsroom_misconfigured"
  | "category_not_allowed" | "too_large" | "attachments_not_allowed" | "invalid_size"
  | "proof_denied" | "proof_expired" | "proof_cancelled" | "proof_rejected"
  | "limit_reached" | "epoch_mismatch" | "stale_key_version" | "publish_failed"
  | "network" | "unexpected_response" | "relayer_error"
  | "invalid_receipt" | "invalid_envelope" | "invalid_network";

/** Erro com causa legível para mostrar à pessoa. A mensagem nunca traz o conteúdo da denúncia. */
export class SourceError extends Error {
  constructor(public readonly code: SourceErrorCode, message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export type ProofFailure = "denied" | "expired" | "cancelled";

/** O fornecedor de prova lança isto quando a pessoa nega, o pedido expira ou ela cancela. */
export class ProofError extends Error {
  constructor(public readonly reason: ProofFailure) {
    super(`prova ${reason}`);
    this.name = "ProofError";
  }
}
