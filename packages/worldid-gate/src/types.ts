/** Resultado do IDKit (World ID 4.0): mantemos só os campos que usamos; o restante é repassado à API do World. */
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
  /** Motivo, quando `success` é falso. */
  error?: string;
};

/** Nunca lança por prova recusada ou falha de rede: devolve `success: false` com o motivo. */
export type Verifier = (payload: IdKitPayload) => Promise<VerifyResult>;

export type NullifierStore = {
  has(key: string): Promise<boolean>;
  /** Reserva a chave. Devolve `true` só para quem a reservou primeiro. */
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
};
