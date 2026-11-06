import { withDefaults, type Deps } from "./deps.ts";
import { sodium } from "./sodium.ts";

export type Keypair = { publicKey: Uint8Array; privateKey: Uint8Array };

/** Par de chaves X25519. Com `random` injetado, o resultado é reproduzível. */
export function newKeypair(deps?: Partial<Deps>): Keypair {
  const seed = withDefaults(deps).random(sodium.crypto_box_SEEDBYTES);
  const k = sodium.crypto_box_seed_keypair(seed);
  return { publicKey: k.publicKey, privateKey: k.privateKey };
}
