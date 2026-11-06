import { NewsroomNotFoundError, RecordsError } from "@safe-whistle/ens-client";
import { describe, expect, it, vi } from "vitest";
import { listAdministered } from "../src/index.ts";

const ME = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const OTHER = "0x9999999999999999999999999999999999999999";

function make(custodians: Record<string, string | Error>, labels: string[], incomplete = false) {
  const reader = {
    resolveNewsroom: vi.fn(async (name: string) => {
      const c = custodians[name];
      if (c instanceof Error) throw c;
      if (c === undefined) throw new NewsroomNotFoundError(name);
      return { custodian: c } as never;
    }),
  };
  return { reader, find: vi.fn(async () => ({ labels, incomplete })) };
}

describe("redações administradas pela carteira", () => {
  it("lista_so_as_que_tem_registros_do_safe_whistle_e_o_custodiante_e_a_carteira", async () => {
    const { reader, find } = make({ "a.eth": ME, "b.eth": OTHER, "c.eth": ME.toLowerCase() }, ["a", "b", "c", "d"]);
    const r = await listAdministered({ address: ME, find, reader });
    expect(r.newsrooms.sort()).toEqual(["a.eth", "c.eth"]);
    expect(r.incomplete).toBe(false);
  });

  it("ignora_nomes_sem_registros_ou_com_registros_invalidos", async () => {
    const { reader, find } = make({ "x.eth": new RecordsError("pubkey", "falta") }, ["x", "y"]);
    expect((await listAdministered({ address: ME, find, reader })).newsrooms).toEqual([]);
  });

  it("falha_de_rede_em_um_nome_marca_incompleto_e_segue", async () => {
    const { reader, find } = make({ "a.eth": new Error("rpc fora"), "b.eth": ME }, ["a", "b"]);
    const r = await listAdministered({ address: ME, find, reader });
    expect(r.newsrooms).toEqual(["b.eth"]);
    expect(r.incomplete).toBe(true);
  });

  it("repassa_o_incompleto_da_busca_e_ignora_rotulos_invalidos", async () => {
    const { reader, find } = make({ "a.eth": ME }, ["a", "Inválido!", "a"], true);
    const r = await listAdministered({ address: ME, find, reader });
    expect(r).toEqual({ newsrooms: ["a.eth"], incomplete: true });
    expect(reader.resolveNewsroom).toHaveBeenCalledTimes(1);
  });

  it("falha_total_da_busca_devolve_vazio_e_incompleto", async () => {
    const { reader } = make({}, []);
    const r = await listAdministered({ address: ME, find: async () => { throw new Error("rpc"); }, reader });
    expect(r).toEqual({ newsrooms: [], incomplete: true });
  });
});
