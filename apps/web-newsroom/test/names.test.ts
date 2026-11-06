import { describe, expect, it } from "vitest";
import { createNamesStore } from "../src/names.ts";

const A = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const B = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca";

function memory(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return { data, storage: { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v), removeItem: (k: string) => void delete data[k] } };
}

describe("memória local dos nomes das redações (só nomes, nunca chaves)", () => {
  it("lembra_por_carteira_com_o_mais_recente_primeiro", () => {
    const { storage } = memory();
    const s = createNamesStore(storage);
    s.remember(A, { newsroom: "a.eth" });
    s.remember(A, { newsroom: "b.eth", journalist: "maria" });
    s.remember(B, { newsroom: "c.eth" });
    expect(s.list(A)).toEqual([{ newsroom: "b.eth", journalist: "maria" }, { newsroom: "a.eth" }]);
    expect(s.list(B)).toEqual([{ newsroom: "c.eth" }]);
    expect(s.list(A.toLowerCase() as never)).toHaveLength(2);
  });

  it("nao_repete_e_limita_a_quantidade", () => {
    const s = createNamesStore(memory().storage);
    for (let i = 0; i < 30; i++) s.remember(A, { newsroom: `n${i}.eth` });
    s.remember(A, { newsroom: "n29.eth" });
    expect(s.list(A)).toHaveLength(20);
    expect(s.list(A)[0]).toEqual({ newsroom: "n29.eth" });
    expect(s.list(A).filter((e) => e.newsroom === "n29.eth")).toHaveLength(1);
  });

  it("so_aceita_nomes_validos_e_descarta_qualquer_outro_campo", () => {
    const { storage, data } = memory();
    const s = createNamesStore(storage);
    s.remember(A, { newsroom: "Invalida" });
    s.remember(A, { newsroom: "ok.eth", journalist: "Mar ia!" });
    s.remember(A, { newsroom: "ok2.eth", privateKey: "0xsegredo", password: "x" } as never);
    expect(s.list(A)).toEqual([{ newsroom: "ok2.eth" }]);
    expect(Object.values(data).join("")).not.toMatch(/segredo|password|privateKey/);
  });

  it("esquece_um_nome", () => {
    const s = createNamesStore(memory().storage);
    s.remember(A, { newsroom: "a.eth" });
    s.remember(A, { newsroom: "b.eth" });
    s.forget(A, "a.eth");
    expect(s.list(A)).toEqual([{ newsroom: "b.eth" }]);
  });

  it("conteudo_corrompido_ou_adulterado_vira_lista_vazia_ou_filtrada", () => {
    const key = "sw.names.v1." + A.toLowerCase();
    expect(createNamesStore(memory({ [key]: "lixo{" }).storage).list(A)).toEqual([]);
    expect(createNamesStore(memory({ [key]: JSON.stringify({ a: 1 }) }).storage).list(A)).toEqual([]);
    expect(createNamesStore(memory({ [key]: JSON.stringify([{ newsroom: "<script>.eth" }, { newsroom: "bom.eth", extra: 1 }, 5, null]) }).storage).list(A)).toEqual([{ newsroom: "bom.eth" }]);
  });

  it("sem_armazenamento_ou_com_erro_nao_quebra_nada", () => {
    const none = createNamesStore(undefined);
    none.remember(A, { newsroom: "a.eth" });
    expect(none.list(A)).toEqual([]);
    const broken = createNamesStore({ getItem: () => { throw new Error("bloqueado"); }, setItem: () => { throw new Error("cheio"); }, removeItem: () => { throw new Error("x"); } });
    expect(() => { broken.remember(A, { newsroom: "a.eth" }); broken.forget(A, "a.eth"); }).not.toThrow();
    expect(broken.list(A)).toEqual([]);
  });

  it("usa_uma_chave_propria_com_prefixo_e_versao", () => {
    const { storage, data } = memory();
    createNamesStore(storage).remember(A, { newsroom: "a.eth" });
    expect(Object.keys(data)).toEqual(["sw.names.v1." + A.toLowerCase()]);
  });
});
