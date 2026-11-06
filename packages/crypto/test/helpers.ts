import { newKeypair, type Keypair } from "../src/index.ts";

export const utf8 = (s: string) => new TextEncoder().encode(s);
export const text = (b: Uint8Array) => new TextDecoder().decode(b);

export const NEWSROOM = "investiga.jornal.eth";

export function people(): { redacao: Keypair; maria: Keypair; intruso: Keypair } {
  return { redacao: newKeypair(), maria: newKeypair(), intruso: newKeypair() };
}

/** Source of predictable "randomness" for determinism tests. */
export function seededRandom(start = 1): (n: number) => Uint8Array {
  let counter = start;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (counter++ * 31 + i * 17) & 0xff;
    return out;
  };
}
