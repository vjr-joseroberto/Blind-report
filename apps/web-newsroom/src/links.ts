import type { ChainSpec } from "./wallet.ts";
import type { Role } from "@safe-whistle/newsroom-client";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const base = (spec: Pick<ChainSpec, "blockExplorerUrls">) => spec.blockExplorerUrls[0]?.replace(/\/+$/, "");

/** Link da transação no explorador da rede (para conferir na blockchain). */
export function txLink(spec: Pick<ChainSpec, "blockExplorerUrls">, hash: string): string | undefined {
  const b = base(spec);
  return b && HASH_RE.test(hash) ? `${b}/tx/${hash}` : undefined;
}

export function addressLink(spec: Pick<ChainSpec, "blockExplorerUrls">, address: string): string | undefined {
  const b = base(spec);
  return b && ADDR_RE.test(address) ? `${b}/address/${address}` : undefined;
}

export type StepFacts = { keysLoaded: boolean; backupDone: boolean; inboxLoaded: boolean; teamAdded?: boolean; readerKeyMade?: boolean };
export type Step = { id: string; label: string; done: boolean };

/** Guia de primeiros passos por papel, com o que já foi feito marcado. */
export function firstSteps(role: Role, f: StepFacts): Step[] {
  if (role === "admin") {
    return [
      { id: "wallet", label: "Carteira conectada", done: true },
      { id: "keys", label: "Carregar as chaves (cadastrar a redação ou importar o backup)", done: f.keysLoaded },
      { id: "backup", label: "Gerar e guardar o backup das chaves", done: f.backupDone },
      //{ id: "team", label: "Cadastrar os jornalistas e entregar o chaveiro", done: f.teamAdded ?? false },
    ];
  }
  if (role === "journalist") {
    return [
      { id: "wallet", label: "Carteira conectada", done: true },
      { id: "reader_key", label: "Gerar a sua chave de leitura e enviar a pública ao administrador", done: f.readerKeyMade ?? f.keysLoaded },
      { id: "keyring", label: "Importar o chaveiro recebido do administrador", done: f.keysLoaded },
    ];
  }
  return [];
}
