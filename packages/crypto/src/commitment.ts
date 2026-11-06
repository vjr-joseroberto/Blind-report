import type { Envelope } from "@safe-whistle/core";
import { hashHex } from "./hash.ts";

/** Authorship commitment: hash(text ‖ salt). Only whoever has the text and the salt can reproduce it. */
export function commitmentOf(plaintext: Uint8Array, salt: Uint8Array): string {
  return hashHex(plaintext, salt);
}

export function verifyCommitment(envelope: Envelope, plaintext: Uint8Array, salt: Uint8Array): boolean {
  return commitmentOf(plaintext, salt) === envelope.commitment;
}

/** Does the public hash of the ciphertext match the envelope? */
export function verifyContentHash(envelope: Envelope): boolean {
  return hashHex(envelope.ciphertext) === envelope.contentHash;
}
