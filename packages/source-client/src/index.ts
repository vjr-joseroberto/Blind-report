export { ProofError, SourceError, type ProofFailure, type SourceErrorCode } from "./errors.ts";
export type { IdKitPayload, ProofProvider, ProofRequest, SourceDeps, SourceReceipt } from "./types.ts";
export { parseReceipt, serializeReceipt } from "./receipt.ts";
export { IDKIT_HOSTS, sourceNetworkPolicy } from "./network.ts";
export { createIdKitProofProvider, proofErrorFromIdKit } from "./idkit.ts";
export { createSourceClient } from "./client.ts";
