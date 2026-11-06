/** Limite de um valor `bytes` no SDK do Arkiv (128 KiB). */
export const ARKIV_MAX_BYTES = 131_072;
/** Maior valor aceito medido no nó local (V-01 confirma na Rabdi). */
export const ARKIV_PRACTICAL_ENTITY_BYTES = 128_960;
/** Dados úteis por parte de um anexo grande; sobra folga para cabeçalho e chaves embrulhadas. */
export const PART_PAYLOAD_BYTES = 120 * 1024;
/** Tamanho máximo total padrão de uma denúncia quando a política não o define. */
export const DEFAULT_MAX_BYTES = 256 * 1024;
/** Teto absoluto aceito para `maxBytes` numa política. */
export const MAX_POLICY_BYTES = 10 * 1024 * 1024;

/** Chaves de texto do ENS usadas pelo sistema. */
export const ENS_KEYS = {
  pubkey: "denuncia.pubkey",
  pubkeyVersion: "denuncia.pubkey.version",
  policy: "denuncia.policy",
  relayer: "denuncia.relayer",
  readerKey: "denuncia.readerkey",
} as const;
