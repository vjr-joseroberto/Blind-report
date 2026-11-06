import { sodium } from "./sodium.ts";

/** Dependências injetáveis: aleatoriedade e relógio (testes determinísticos). */
export type Deps = {
  random: (n: number) => Uint8Array;
  now: () => Date;
};

export const defaultDeps: Deps = {
  random: (n) => sodium.randombytes_buf(n),
  now: () => new Date(),
};

export const withDefaults = (deps?: Partial<Deps>): Deps => ({ ...defaultDeps, ...deps });
