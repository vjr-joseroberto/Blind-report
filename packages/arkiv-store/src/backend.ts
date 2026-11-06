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
 * O que a loja precisa do Arkiv. Implementações: `createSdkBackend` (nó real) e `createMemoryChain` (dublê).
 * As duas passam pela mesma suíte de contrato (test/backend-contract.ts).
 */
export interface Backend {
  /** Conta que assina as escritas. */
  readonly account: Address;
  create(kind: EntityKind, attrs: Attrs, data: Uint8Array, options: CreateOptions): Promise<{ key: Hex }>;
  changeOwnership(key: Hex, newOwner: Address): Promise<void>;
  /** Estende a expiração para `seconds` a contar de agora. */
  extend(key: Hex, seconds: number): Promise<void>;
  get(kind: EntityKind, key: Hex): Promise<EntityRow | null>;
  /** Exige ao menos um filtro (restrição do Arkiv). Página máxima: 100. */
  select(kind: EntityKind, filter: Attrs, page: { offset: number; limit: number }): Promise<EntityRow[]>;
  timing(): Promise<{ currentBlock: bigint; blockSeconds: number }>;
}
