export type SourceErrorCode =
  | "invalid_newsroom" | "newsroom_not_found" | "newsroom_misconfigured"
  | "category_not_allowed" | "too_large" | "attachments_not_allowed" | "invalid_size"
  | "proof_denied" | "proof_expired" | "proof_cancelled" | "proof_rejected"
  | "limit_reached" | "epoch_mismatch" | "stale_key_version" | "publish_failed"
  | "network" | "unexpected_response" | "relayer_error"
  | "invalid_receipt" | "invalid_envelope" | "invalid_network";

/** Error with a readable cause to show to the person. The message never carries the content of the tip. */
export class SourceError extends Error {
  constructor(public readonly code: SourceErrorCode, message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export type ProofFailure = "denied" | "expired" | "cancelled";

/** The proof provider throws this when the person denies, the request expires, or they cancel. */
export class ProofError extends Error {
  constructor(public readonly reason: ProofFailure) {
    super(`proof ${reason}`);
    this.name = "ProofError";
  }
}
