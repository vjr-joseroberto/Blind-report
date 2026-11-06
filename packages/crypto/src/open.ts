import type { Envelope } from "@safe-whistle/core";
import { aadOf } from "./aad.ts";
import { CryptoError } from "./errors.ts";
import type { Keypair } from "./keys.ts";
import { sodium } from "./sodium.ts";

/** Opens the envelope with the recipient's keypair. Fails if not a recipient or if something was tampered with. */
export function open(envelope: Envelope, recipientId: string, keypair: Keypair): Uint8Array {
  const wrapped = envelope.wrappedKeys.find((w) => w.recipient === recipientId);
  if (!wrapped) throw new CryptoError("not_recipient", "This envelope was not encrypted for you.");
  try {
    const contentKey = sodium.crypto_box_seal_open(wrapped.sealed, keypair.publicKey, keypair.privateKey);
    return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      envelope.ciphertext,
      aadOf(envelope.newsroom, envelope.pubkeyVersion, envelope.category),
      envelope.nonce,
      contentKey,
    );
  } catch {
    throw new CryptoError("decrypt", "Could not open the envelope: wrong key or tampered content.");
  }
}
