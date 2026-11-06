import type { Envelope } from "@safe-whistle/core";
import { aadOf } from "./aad.ts";
import { CryptoError } from "./errors.ts";
import type { Keypair } from "./keys.ts";
import { sodium } from "./sodium.ts";

/** Abre o envelope com o par de chaves do destinatário. Falha se não for destinatário ou se algo foi adulterado. */
export function open(envelope: Envelope, recipientId: string, keypair: Keypair): Uint8Array {
  const wrapped = envelope.wrappedKeys.find((w) => w.recipient === recipientId);
  if (!wrapped) throw new CryptoError("not_recipient", "Este envelope não foi cifrado para você.");
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
    throw new CryptoError("decrypt", "Não foi possível abrir o envelope: chave errada ou conteúdo adulterado.");
  }
}
