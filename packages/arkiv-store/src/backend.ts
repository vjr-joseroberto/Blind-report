import type { Address, Hex } from "viem";
import type { EntityKind } from "./constants.ts";

export type AttrValue = string | bigint;
export type Attrs = Record<string, AttrValue>;

export type EntityRow = {
  key: Hex;
  kind: EntityKind;
  owner: Address;
  creator: Address;
  createdAtBlock: bigint;
  expiresAtBlock: bigint;
  attrs: Attrs;
  data: Uint8Array;
};

export type CreateOptions = { expirationSeconds: number; readonly: boolean; permissionlessExtension: boolean };

/**
 * What the store needs from Arkiv. Implementations: `createSdkBackend` (real node) and `createMemoryChain` (double).
 * Both go through the same contract suite (test/backend-contract.ts).
 */
export interface Backend {
  /** Account that signs writes. */
  readonly account: Address;
  create(kind: EntityKind, attrs: Attrs, data: Uint8Array, options: CreateOptions): Promise<{ key: Hex }>;
  changeOwnership(key: Hex, newOwner: Address): Promise<void>;
  /** Extends expiration to `seconds` from now. */
  extend(key: Hex, seconds: number): Promise<void>;
  get(kind: EntityKind, key: Hex): Promise<EntityRow | null>;
  /** Requires at least one filter (Arkiv restriction). Maximum page: 100. */
  select(kind: EntityKind, filter: Attrs, page: { offset: number; limit: number }): Promise<EntityRow[]>;
  timing(): Promise<{ currentBlock: bigint; blockSeconds: number }>;
}
