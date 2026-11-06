import { describe, expect, it } from "vitest";
import { createMemoryChain } from "../src/index.ts";
import { defineBackendContract } from "./backend-contract.ts";

defineBackendContract("em memória (dublê)", async () => {
  const chain = createMemoryChain();
  return {
    relayer: chain.backendFor("0x1111111111111111111111111111111111111111"),
    newsroom: chain.backendFor("0x2222222222222222222222222222222222222222"),
    stranger: chain.backendFor("0x3333333333333333333333333333333333333333"),
    advance: async (seconds) => chain.advanceSeconds(seconds),
  };
});

describe("detalhes do dublê em memória", () => {
  it("cada_criacao_avanca_um_bloco_e_a_cadeia_e_compartilhada_entre_contas", async () => {
    const chain = createMemoryChain();
    const a = chain.backendFor("0x1111111111111111111111111111111111111111");
    const b = chain.backendFor("0x2222222222222222222222222222222222222222");
    const t0 = (await a.timing()).currentBlock;
    await a.create("resposta", { newsroom: "x.eth", mailboxId: "0x" + "aa".repeat(32) }, new Uint8Array([1]), { expirationSeconds: 100, readonly: true, permissionlessExtension: false });
    expect((await b.timing()).currentBlock).toBe(t0 + 1n);
    expect(await b.select("resposta", { newsroom: "x.eth" }, { offset: 0, limit: 5 })).toHaveLength(1);
  });

  it("recusa_atributo_desconhecido_para_o_tipo", async () => {
    const chain = createMemoryChain();
    const a = chain.backendFor("0x1111111111111111111111111111111111111111");
    await expect(a.create("resposta", { newsroom: "x.eth", mailboxId: "0x" + "aa".repeat(32), ip: "1.2.3.4" }, new Uint8Array([1]), { expirationSeconds: 100, readonly: true, permissionlessExtension: false })).rejects.toThrow(/atributo/i);
  });

  it("recusa_dados_acima_do_limite_do_arkiv", async () => {
    const chain = createMemoryChain();
    const a = chain.backendFor("0x1111111111111111111111111111111111111111");
    await expect(a.create("resposta", { newsroom: "x.eth", mailboxId: "0x" + "aa".repeat(32) }, new Uint8Array(131_073), { expirationSeconds: 100, readonly: true, permissionlessExtension: false })).rejects.toThrow(/tamanho/i);
  });
});
