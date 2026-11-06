/** Limit of a `bytes` value in the Arkiv SDK (128 KiB). */
export const ARKIV_MAX_BYTES = 131_072;
/** Largest accepted value measured on the local node (V-01 confirms on Rabdi). */
export const ARKIV_PRACTICAL_ENTITY_BYTES = 128_960;
/** Payload bytes per part of a large attachment; leaves room for header and wrapped keys. */
export const PART_PAYLOAD_BYTES = 120 * 1024;
/** Default total maximum size of a tip when the policy does not define it. */
export const DEFAULT_MAX_BYTES = 256 * 1024;
/** Absolute cap accepted for `maxBytes` in a policy. */
export const MAX_POLICY_BYTES = 10 * 1024 * 1024;

/** ENS text keys used by the system. */
export const ENS_KEYS = {
  pubkey: "denuncia.pubkey",
  pubkeyVersion: "denuncia.pubkey.version",
  policy: "denuncia.policy",
  relayer: "denuncia.relayer",
  readerKey: "denuncia.readerkey",
} as const;
