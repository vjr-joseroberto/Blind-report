import type { Envelope } from "@safe-whistle/core";
import { hashHex } from "./hash.ts";

/** Compromisso de autoria: hash(texto ‖ sal). Só quem tem o texto e o sal o reproduz. */
export function commitmentOf(plaintext: Uint8Array, salt: Uint8Array): string {
  return hashHex(plaintext, salt);
}

export function verifyCommitment(envelope: Envelope, plaintext: Uint8Array, salt: Uint8Array): boolean {
  return commitmentOf(plaintext, salt) === envelope.commitment;
}

/** O hash público do ciphertext confere com o envelope? */
export function verifyContentHash(envelope: Envelope): boolean {
  return hashHex(envelope.ciphertext) === envelope.contentHash;
}
