import { describe, expect, it, vi } from "vitest";
import { findLabelsMintedTo, type LogClient } from "../src/index.ts";

const ME = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const OTHER = "0x9999999999999999999999999999999999999999";

type Fake = { block: bigint; kind: "transfer" | "label"; to?: string; id: bigint; label?: string };

function fake(head: bigint, logs: Fake[], opts: { maxRange?: bigint } = {}) {
  const calls: { from: bigint; to: bigint; event: string }[] = [];
  const client: LogClient = {
    getBlockNumber: vi.fn(async () => head),
    getLogs: vi.fn(async (a: Parameters<LogClient["getLogs"]>[0]) => {
      calls.push({ from: a.fromBlock, to: a.toBlock, event: a.event.name });
      const span = a.toBlock - a.fromBlock + 1n;
      if (opts.maxRange !== undefined && span > opts.maxRange) throw new Error("block range too large");
      return logs
        .filter((l) => l.block >= a.fromBlock && l.block <= a.toBlock)
        .filter((l) => (a.event.name === "TransferSingle" ? l.kind === "transfer" && (!a.args || (a.args as any).to.toLowerCase() === l.to!.toLowerCase()) : l.kind === "label"))
        .map((l) => ({ args: l.kind === "transfer" ? { id: l.id, to: l.to } : { tokenId: l.id, label: l.label } }));
    }),
  };
  return { client, calls };
}

const mint = (block: bigint, id: bigint, label: string, to = ME): Fake[] => [
  { block, kind: "transfer", to, id },
  { block, kind: "label", id, label },
];

describe("descoberta das redações de uma carteira pelos eventos do registry", () => {
  it("acha_os_rotulos_registrados_para_a_carteira_e_ignora_os_de_outros", async () => {
    const { client } = fake(1000n, [...mint(900n, 1n, "jornalista1"), ...mint(950n, 2n, "de-outro", OTHER), ...mint(990n, 3n, "jornalista2")]);
    const r = await findLabelsMintedTo({ client, address: ME, maxBlocks: 1000n, chunk: 500n });
    expect(r.labels.sort()).toEqual(["jornalista1", "jornalista2"]);
    expect(r.incomplete).toBe(false);
  });

  it("varre_de_tras_para_frente_em_blocos_do_tamanho_pedido_ate_o_limite", async () => {
    const { client, calls } = fake(1000n, []);
    await findLabelsMintedTo({ client, address: ME, maxBlocks: 450n, chunk: 200n });
    const ranges = [...new Set(calls.map((c) => `${c.from}-${c.to}`))];
    expect(ranges).toEqual(["801-1000", "601-800", "550-600"]);
  });

  it("nao_busca_rotulos_nos_blocos_sem_transferencia_para_a_carteira", async () => {
    const { client, calls } = fake(100n, []);
    await findLabelsMintedTo({ client, address: ME, maxBlocks: 100n, chunk: 100n });
    expect(calls.every((c) => c.event === "TransferSingle")).toBe(true);
  });

  it("reduz_o_bloco_quando_o_rpc_limita_o_intervalo_e_continua_completo", async () => {
    const { client } = fake(1000n, mint(100n, 7n, "antiga"), { maxRange: 120n });
    const r = await findLabelsMintedTo({ client, address: ME, maxBlocks: 1000n, chunk: 500n, minChunk: 50n });
    expect(r.labels).toEqual(["antiga"]);
    expect(r.incomplete).toBe(false);
  });

  it("se_nem_o_menor_bloco_funciona_marca_incompleto_e_segue", async () => {
    const { client } = fake(1000n, mint(990n, 1n, "recente"), { maxRange: 10n });
    const r = await findLabelsMintedTo({ client, address: ME, maxBlocks: 400n, chunk: 100n, minChunk: 50n });
    expect(r.incomplete).toBe(true);
    expect(r.labels).toEqual([]);
  });

  it("nao_repete_rotulos_e_nao_passa_do_bloco_zero", async () => {
    const { client, calls } = fake(30n, [...mint(5n, 1n, "a"), ...mint(6n, 1n, "a")]);
    const r = await findLabelsMintedTo({ client, address: ME, maxBlocks: 10_000n, chunk: 20n });
    expect(r.labels).toEqual(["a"]);
    expect(Math.min(...calls.map((c) => Number(c.from)))).toBe(0);
  });

  it("recusa_endereco_invalido", async () => {
    await expect(findLabelsMintedTo({ client: fake(10n, []).client, address: "0x12" as never })).rejects.toThrow();
  });
});
