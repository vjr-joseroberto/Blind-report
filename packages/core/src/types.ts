/** Política de recebimento publicada pela redação em `denuncia.policy`. */
export type NewsroomPolicy = {
  categories: string[];
  maxBytes: number;
  attachments: boolean;
  epoch: "monthly";
};

export type Part = { index: number; total: number; data: Uint8Array };

/** Chave de conteúdo embrulhada para um destinatário. */
export type WrappedKey = { recipient: string; sealed: Uint8Array };

/** Envelope cifrado. O *ciphertext* é binário (sem base64). Hashes em hexadecimal com prefixo 0x. */
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

/** Recibo: existe só no dispositivo da fonte. */
export type Receipt = {
  contentHash: string;
  salt: Uint8Array;
  mailboxPriv: Uint8Array;
  mailboxPub: Uint8Array;
};
