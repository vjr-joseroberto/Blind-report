import { ENS_KEYS, isNewsroomName } from "@safe-whistle/core";
import type { Address } from "viem";
import { ABIS, ENSV2_SEPOLIA } from "./deployments.ts";
import { InvalidNameError, NewsroomNotFoundError, RecordsError } from "./errors.ts";
import { decodePublicKey, parseNewsroomRecords, type NewsroomInfo } from "./records.ts";

/** The minimum read client (a viem PublicClient suffices); injectable for tests. */
export type EnsReadClient = {
  getEnsText(args: { name: string; key: string; universalResolverAddress: Address }): Promise<string | null>;
  getEnsAddress(args: { name: string; universalResolverAddress: Address }): Promise<Address | null>;
  readContract(args: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }): Promise<unknown>;
};

export type ReaderOptions = {
  client: EnsReadClient;
  universalResolver?: Address;
  ethRegistry?: Address;
  ethRegistrar?: Address;
};

const ZERO = "0x0000000000000000000000000000000000000000";
const JOURNALIST_RE = /^([a-z0-9][a-z0-9-]*)\.([a-z0-9][a-z0-9-]*)\.eth$/;

export function createReader(options: ReaderOptions) {
  const { client } = options;
  const universalResolver = options.universalResolver ?? (ENSV2_SEPOLIA.universalResolver as Address);
  const ethRegistry = options.ethRegistry ?? (ENSV2_SEPOLIA.ethRegistry as Address);
  const ethRegistrar = options.ethRegistrar ?? (ENSV2_SEPOLIA.ethRegistrar as Address);
  const text = (name: string, key: string) => client.getEnsText({ name, key, universalResolverAddress: universalResolver });

  const reader = {
    /** Resolves the newsroom by name only (Universal Resolver). */
    async resolveNewsroom(name: string): Promise<NewsroomInfo> {
      if (!isNewsroomName(name)) throw new InvalidNameError(name, "expected a lowercase .eth name");
      const [pubkey, version, policy, relayer, custodian] = await Promise.all([
        text(name, ENS_KEYS.pubkey),
        text(name, ENS_KEYS.pubkeyVersion),
        text(name, ENS_KEYS.policy),
        text(name, ENS_KEYS.relayer),
        client.getEnsAddress({ name, universalResolverAddress: universalResolver }),
      ]);
      if (!pubkey && !version && !policy && !relayer && !custodian) throw new NewsroomNotFoundError(name);
      return parseNewsroomRecords({ name, pubkey, version, policy, relayer, custodian });
    },

    /** Is the second-level `.eth` name free to register? (The registrar is the source of truth.) */
    async isNameAvailable(name: string): Promise<boolean> {
      if (!isNewsroomName(name) || name.slice(0, -4).includes(".")) throw new InvalidNameError(name, "expected a second-level .eth name, in lowercase");
      return (await client.readContract({ address: ethRegistrar, abi: ABIS.ethRegistrar, functionName: "isAvailable", args: [name.slice(0, -4)] })) as boolean;
    },

    /** Journalist reader key. Note: it remains readable after revoking or expiring (use isActiveJournalist). */
    async resolveReaderKey(name: string): Promise<Uint8Array> {
      return decodePublicKey(await text(name, ENS_KEYS.readerKey), "readerkey", ENS_KEYS.readerKey);
    },

    /** Owner of the journalist subname in the registry, or `null` if not active. Decided by the registry, never by text. */
    async journalistOwner(name: string): Promise<Address | null> {
      const m = JOURNALIST_RE.exec(name);
      if (!m) throw new InvalidNameError(name, "expected <journalist>.<newsroom>.eth");
      const [, journalist, newsroom] = m as unknown as [string, string, string];
      const subregistry = (await client.readContract({ address: ethRegistry, abi: ABIS.ethRegistry, functionName: "getSubregistry", args: [newsroom] })) as string;
      if (subregistry.toLowerCase() === ZERO) return null;
      const owner = (await client.readContract({ address: subregistry as Address, abi: ABIS.userRegistry, functionName: "findOwner", args: [journalist] })) as string;
      return owner.toLowerCase() === ZERO ? null : (owner as Address);
    },

    /** Is the journalist active? */
    async isActiveJournalist(name: string): Promise<boolean> {
      return (await reader.journalistOwner(name)) !== null;
    },
  };
  return reader;
}
export { RecordsError };
