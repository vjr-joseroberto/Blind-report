import type { ChainSpec } from "./wallet.ts";
import type { Role } from "@safe-whistle/newsroom-client";

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const base = (spec: Pick<ChainSpec, "blockExplorerUrls">) => spec.blockExplorerUrls[0]?.replace(/\/+$/, "");

/** Transaction link in the network explorer (to check on the blockchain). */
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

/** First-steps guide by role, with what has already been done marked. */
export function firstSteps(role: Role, f: StepFacts): Step[] {
  if (role === "admin") {
    return [
      { id: "wallet", label: "Wallet connected", done: true },
      { id: "keys", label: "Load the keys (register the newsroom or import the backup)", done: f.keysLoaded },
      { id: "backup", label: "Generate and store the keys backup", done: f.backupDone },
      //{ id: "team", label: "Register the journalists and deliver the keyring", done: f.teamAdded ?? false },
    ];
  }
  if (role === "journalist") {
    return [
      { id: "wallet", label: "Wallet connected", done: true },
      { id: "reader_key", label: "Generate your reader key and send the public one to the administrator", done: f.readerKeyMade ?? f.keysLoaded },
      { id: "keyring", label: "Import the keyring received from the administrator", done: f.keysLoaded },
    ];
  }
  return [];
}
