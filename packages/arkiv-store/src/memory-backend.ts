import { ARKIV_MAX_BYTES } from "@safe-whistle/core";
import type { Address, Hex } from "viem";
import type { Attrs, Backend, CreateOptions, EntityRow } from "./backend.ts";
import { ARKIV_BLOCK_SECONDS, ARKIV_MAX_LIFETIME_BLOCKS, KIND_ATTRS, type EntityKind } from "./constants.ts";

type Stored = EntityRow & { flags: { readonly: boolean; permissionlessExtension: boolean } };

export type MemoryChain = {
  backendFor(account: Address): Backend;
  advanceSeconds(seconds: number): void;
  /** Sinalizadores da n-ésima entidade criada (para testes). */
  flagsOf(index: number): { readonly: boolean; permissionlessExtension: boolean };
};

/** Cadeia Arkiv em memória, compartilhada entre contas. Imita permissões, expiração em blocos e paginação. */
export function createMemoryChain(): MemoryChain {
  let block = 1000n;
  let counter = 0;
  const entities: Stored[] = [];
  const live = (e: Stored) => e.expiresAtBlock > block;
  const blocksFor = (seconds: number) => {
    const n = BigInt(Math.max(1, Math.ceil(seconds / ARKIV_BLOCK_SECONDS)));
    if (n > BigInt(ARKIV_MAX_LIFETIME_BLOCKS)) throw new Error(`A vida pedida excede o máximo da cadeia (${ARKIV_MAX_LIFETIME_BLOCKS} blocos).`);
    return n;
  };
  const hexKey = (n: number) => ("0x" + n.toString(16).padStart(64, "0")) as Hex;

  function checkAttrs(kind: EntityKind, attrs: Attrs): void {
    for (const k of Object.keys(attrs)) {
      if (!(k in KIND_ATTRS[kind])) throw new Error(`Atributo desconhecido para ${kind}: ${k}`);
    }
  }

  function backendFor(account: Address): Backend {
    const find = (key: Hex) => entities.find((e) => e.key === key && live(e));
    return {
      account,
      async create(kind, attrs, data, options: CreateOptions) {
        checkAttrs(kind, attrs);
        if (data.length > ARKIV_MAX_BYTES) throw new Error(`Tamanho acima do limite do Arkiv: ${data.length}`);
        block += 1n;
        const key = hexKey(++counter);
        entities.push({
          key, kind, owner: account, creator: account, createdAtBlock: block, expiresAtBlock: block + blocksFor(options.expirationSeconds),
          attrs: { ...attrs }, data: new Uint8Array(data), flags: { readonly: options.readonly, permissionlessExtension: options.permissionlessExtension },
        });
        return { key };
      },
      async changeOwnership(key, newOwner) {
        const e = find(key);
        if (!e) throw new Error("Entidade inexistente ou expirada.");
        if (e.owner.toLowerCase() !== account.toLowerCase()) throw new Error(`A entidade pertence a ${e.owner}, não a ${account}.`);
        e.owner = newOwner;
      },
      async extend(key, seconds) {
        const e = find(key);
        if (!e) throw new Error("Entidade inexistente ou expirada.");
        if (e.owner.toLowerCase() !== account.toLowerCase() && !e.flags.permissionlessExtension) throw new Error(`A entidade pertence a ${e.owner}.`);
        const next = block + blocksFor(seconds);
        if (next < e.expiresAtBlock) throw new Error("A nova expiração é anterior à atual.");
        e.expiresAtBlock = next;
      },
      async get(kind, key) {
        const e = find(key);
        return e && e.kind === kind ? toRow(e) : null;
      },
      async select(kind, filter, page) {
        const keys = Object.keys(filter);
        if (keys.length === 0) throw new Error("A consulta exige ao menos um filtro.");
        checkAttrs(kind, filter);
        const matches = entities.filter((e) => e.kind === kind && live(e) && keys.every((k) => e.attrs[k] === filter[k]));
        return matches.slice(page.offset, page.offset + page.limit).map(toRow);
      },
      async timing() {
        return { currentBlock: block, blockSeconds: ARKIV_BLOCK_SECONDS };
      },
    };
  }

  const toRow = ({ flags: _flags, ...row }: Stored): EntityRow => ({ ...row, attrs: { ...row.attrs }, data: new Uint8Array(row.data) });

  return {
    backendFor,
    advanceSeconds(seconds) {
      block += BigInt(Math.floor(seconds / ARKIV_BLOCK_SECONDS));
    },
    flagsOf(index) {
      const e = entities[index];
      if (!e) throw new Error(`Sem entidade no índice ${index}`);
      return { ...e.flags };
    },
  };
}
