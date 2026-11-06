import { describe, expect, it } from "vitest";
import { createMemoryChain } from "../src/index.ts";
import { defineBackendContract } from "./backend-contract.ts";

defineBackendContract("in memory (double)", async () => {
  const chain = createMemoryChain();
  return {
    relayer: chain.backendFor("0x1111111111111111111111111111111111111111"),
    newsroom: chain.backendFor("0x2222222222222222222222222222222222222222"),
    stranger: chain.backendFor("0x3333333333333333333333333333333333333333"),
    advance: async (seconds) => chain.advanceSeconds(seconds),
  };
});

describe("in-memory double details", () => {
  it("each_creation_advances_one_block_and_the_chain_is_shared_between_accounts", async () => {
    const chain = createMemoryChain();
    const a = chain.backendFor("0x1111111111111111111111111111111111111111");
    const b = chain.backendFor("0x2222222222222222222222222222222222222222");
    const t0 = (await a.timing()).currentBlock;
    await a.create("resposta", { newsroom: "x.eth", mailboxId: "0x" + "aa".repeat(32) }, new Uint8Array([1]), { expirationSeconds: 100, readonly: true, permissionlessExtension: false });
    expect((await b.timing()).currentBlock).toBe(t0 + 1n);
    expect(await b.select("resposta", { newsroom: "x.eth" }, { offset: 0, limit: 5 })).toHaveLength(1);
  });

  it("rejects_unknown_attribute_for_the_kind", async () => {
    const chain = createMemoryChain();
    const a = chain.backendFor("0x1111111111111111111111111111111111111111");
    await expect(a.create("resposta", { newsroom: "x.eth", mailboxId: "0x" + "aa".repeat(32), ip: "1.2.3.4" }, new Uint8Array([1]), { expirationSeconds: 100, readonly: true, permissionlessExtension: false })).rejects.toThrow(/attribute/i);
  });

  it("rejects_data_above_the_arkiv_limit", async () => {
    const chain = createMemoryChain();
    const a = chain.backendFor("0x1111111111111111111111111111111111111111");
    await expect(a.create("resposta", { newsroom: "x.eth", mailboxId: "0x" + "aa".repeat(32) }, new Uint8Array(131_073), { expirationSeconds: 100, readonly: true, permissionlessExtension: false })).rejects.toThrow(/size/i);
  });
});
