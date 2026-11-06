import type { Envelope, Receipt } from "@safe-whistle/core";
import { aadOf } from "./aad.ts";
import { commitmentOf } from "./commitment.ts";
import { withDefaults, type Deps } from "./deps.ts";
import { CryptoError } from "./errors.ts";
import { hashHex } from "./hash.ts";
import { sodium } from "./sodium.ts";

export type Recipient = { id: string; publicKey: Uint8Array };

export type SealOptions = {
  newsroom: string;
  pubkeyVersion: number;
  category: string;
  recipients: Recipient[];
  plaintext: Uint8Array;
};

/** Cifra a denúncia para os destinatários da redação e gera o mailbox e o recibo da fonte. */
export function seal(opts: SealOptions, deps?: Partial<Deps>): { envelope: Envelope; receipt: Receipt } {
  const d = withDefaults(deps);
  if (opts.recipients.length === 0) throw new CryptoError("recipients", "É preciso ao menos um destinatário.");
  if (new Set(opts.recipients.map((r) => r.id)).size !== opts.recipients.length) {
    throw new CryptoError("recipients", "Destinatários com o mesmo identificador.");
  }
  for (const r of opts.recipients) {
    if (r.publicKey.length !== sodium.crypto_box_PUBLICKEYBYTES) throw new CryptoError("key", `Chave pública inválida para "${r.id}".`);
  }
  if (opts.plaintext.length === 0) throw new CryptoError("input", "O texto não pode ser vazio.");
  if (!Number.isInteger(opts.pubkeyVersion) || opts.pubkeyVersion < 1) throw new CryptoError("input", "Versão da chave inválida.");

  const contentKey = d.random(sodium.crypto_aead_xchacha20poly1305_ietf_KEYBYTES);
  const nonce = d.random(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const salt = d.random(32);
  const mailbox = sodium.crypto_box_seed_keypair(d.random(sodium.crypto_box_SEEDBYTES));

  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    opts.plaintext,
    aadOf(opts.newsroom, opts.pubkeyVersion, opts.category),
    null,
    nonce,
    contentKey,
  );

  const envelope: Envelope = {
    v: 1,
    newsroom: opts.newsroom,
    pubkeyVersion: opts.pubkeyVersion,
    category: opts.category,
    wrappedKeys: opts.recipients.map((r) => ({ recipient: r.id, sealed: sodium.crypto_box_seal(contentKey, r.publicKey) })),
    nonce,
    ciphertext,
    contentHash: hashHex(ciphertext),
    commitment: commitmentOf(opts.plaintext, salt),
    mailboxPub: mailbox.publicKey,
    clientTs: Math.floor(d.now().getTime() / 1000),
  };
  const receipt: Receipt = { contentHash: envelope.contentHash, salt, mailboxPriv: mailbox.privateKey, mailboxPub: mailbox.publicKey };
  return { envelope, receipt };
}
