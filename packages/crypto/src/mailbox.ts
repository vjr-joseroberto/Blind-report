import type { Receipt } from "@safe-whistle/core";
import { CryptoError } from "./errors.ts";
import { hashHex } from "./hash.ts";
import { sodium } from "./sodium.ts";

/** Public identifier of the reply mailbox: hash of the source's ephemeral public key. */
export function mailboxId(mailboxPub: Uint8Array): string {
  return hashHex(mailboxPub);
}

/** The newsroom encrypts the reply to the source's ephemeral key. */
export function sealReply(mailboxPub: Uint8Array, plaintext: Uint8Array): Uint8Array {
  if (mailboxPub.length !== sodium.crypto_box_PUBLICKEYBYTES) throw new CryptoError("key", "Invalid mailbox key.");
  if (plaintext.length === 0) throw new CryptoError("input", "The reply cannot be empty.");
  return sodium.crypto_box_seal(plaintext, mailboxPub);
}

/** The source opens the reply with the receipt. */
export function openReply(sealed: Uint8Array, receipt: Pick<Receipt, "mailboxPub" | "mailboxPriv">): Uint8Array {
  try {
    return sodium.crypto_box_seal_open(sealed, receipt.mailboxPub, receipt.mailboxPriv);
  } catch {
    throw new CryptoError("decrypt", "Could not open the reply: wrong receipt or tampered content.");
  }
}
