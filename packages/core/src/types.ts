/** Submission policy published by the newsroom in `denuncia.policy`. */
export type NewsroomPolicy = {
  categories: string[];
  maxBytes: number;
  attachments: boolean;
  epoch: "monthly";
};

export type Part = { index: number; total: number; data: Uint8Array };

/** Content key wrapped for a recipient. */
export type WrappedKey = { recipient: string; sealed: Uint8Array };

/** Encrypted envelope. The *ciphertext* is binary (not base64). Hashes in hexadecimal with the 0x prefix. */
export type Envelope = {
  v: 1;
  newsroom: string;
  pubkeyVersion: number;
  category: string;
  wrappedKeys: WrappedKey[];
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  contentHash: string;
  commitment: string;
  mailboxPub: Uint8Array;
  clientTs: number;
};

/** Receipt: exists only on the source's device. */
export type Receipt = {
  contentHash: string;
  salt: Uint8Array;
  mailboxPriv: Uint8Array;
  mailboxPub: Uint8Array;
};
