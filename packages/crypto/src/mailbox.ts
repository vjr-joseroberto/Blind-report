import type { Receipt } from "@safe-whistle/core";
import { CryptoError } from "./errors.ts";
import { hashHex } from "./hash.ts";
import { sodium } from "./sodium.ts";

/** Identificador público da caixa de respostas: hash da chave pública efêmera da fonte. */
export function mailboxId(mailboxPub: Uint8Array): string {
  return hashHex(mailboxPub);
}

/** A redação cifra a resposta para a chave efêmera da fonte. */
export function sealReply(mailboxPub: Uint8Array, plaintext: Uint8Array): Uint8Array {
  if (mailboxPub.length !== sodium.crypto_box_PUBLICKEYBYTES) throw new CryptoError("key", "Chave do mailbox inválida.");
  if (plaintext.length === 0) throw new CryptoError("input", "A resposta não pode ser vazia.");
  return sodium.crypto_box_seal(plaintext, mailboxPub);
}

/** A fonte abre a resposta com o recibo. */
export function openReply(sealed: Uint8Array, receipt: Pick<Receipt, "mailboxPub" | "mailboxPriv">): Uint8Array {
  try {
    return sodium.crypto_box_seal_open(sealed, receipt.mailboxPub, receipt.mailboxPriv);
  } catch {
    throw new CryptoError("decrypt", "Não foi possível abrir a resposta: recibo errado ou conteúdo adulterado.");
  }
}
