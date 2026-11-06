/** IDKit result (World ID 4.0): we keep only the fields we use; the rest is forwarded to the World API. */
export type IdKitPayload = {
  protocol_version?: string;
  nonce?: string;
  action: string;
  environment: string;
  responses: { identifier?: string; nullifier: string; [k: string]: unknown }[];
  [k: string]: unknown;
};

export type VerifyResult = {
  success: boolean;
  environment?: string;
  action?: string;
  nullifier?: string;
  /** Reason, when `success` is false. */
  error?: string;
};

/** Never throws for a rejected proof or network failure: returns `success: false` with the reason. */
export type Verifier = (payload: IdKitPayload) => Promise<VerifyResult>;

export type NullifierStore = {
  has(key: string): Promise<boolean>;
  /** Claims the key. Returns `true` only for whoever claimed it first. */
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
};
