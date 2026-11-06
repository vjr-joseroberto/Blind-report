import { ENS_KEYS, toBase64Url } from "@safe-whistle/core";
import { describe, expect, it, vi } from "vitest";
import { InvalidNameError, NewsroomNotFoundError, RecordsError, createReader, type EnsReadClient } from "../src/index.ts";

const UR = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";
const KEY = new Uint8Array(32).fill(9);
const ZERO = "0x0000000000000000000000000000000000000000";
const CUSTODIAN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const SUBREGISTRY = "0x1111111111111111111111111111111111111111";

function fakeClient(texts: Record<string, string | null>, opts: { address?: string | null; subregistry?: string; owner?: string; available?: boolean } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const client: EnsReadClient = {
    getEnsText: vi.fn(async (a) => {
      calls.push({ fn: "getEnsText", args: a });
      return texts[`${a.name}|${a.key}`] ?? null;
    }),
    getEnsAddress: vi.fn(async (a) => {
      calls.push({ fn: "getEnsAddress", args: a });
      return (opts.address === undefined ? CUSTODIAN : opts.address) as `0x${string}` | null;
    }),
    readContract: vi.fn(async (a) => {
      calls.push({ fn: `readContract:${a.functionName}`, args: a });
      if (a.functionName === "getSubregistry") return opts.subregistry ?? SUBREGISTRY;
      if (a.functionName === "findOwner") return opts.owner ?? CUSTODIAN;
      if (a.functionName === "isAvailable") return opts.available ?? true;
      throw new Error("chamada inesperada");
    }),
  };
  return { client, calls };
}

const newsroomTexts = (name = "investiga.jornal.eth") => ({
  [`${name}|${ENS_KEYS.pubkey}`]: toBase64Url(KEY),
  [`${name}|${ENS_KEYS.pubkeyVersion}`]: "2",
  [`${name}|${ENS_KEYS.policy}`]: JSON.stringify({ categories: ["a"] }),
  [`${name}|${ENS_KEYS.relayer}`]: "https://r.example.org",
});

describe("RF-06 resolver a redação pelo nome", () => {
  it("devolve_chave_versao_politica_e_custodiante", async () => {
    const { client } = fakeClient(newsroomTexts());
    const info = await createReader({ client, universalResolver: UR }).resolveNewsroom("investiga.jornal.eth");
    expect(info.pubkeyVersion).toBe(2);
    expect(info.publicKey).toEqual(KEY);
    expect(info.custodian).toBe(CUSTODIAN);
    expect(info.policy.categories).toEqual(["a"]);
  });

  it("so_le_pelo_nome_usando_a_universal_resolver_informada", async () => {
    const { client, calls } = fakeClient(newsroomTexts());
    await createReader({ client, universalResolver: UR }).resolveNewsroom("investiga.jornal.eth");
    const ens = calls.filter((c) => c.fn === "getEnsText" || c.fn === "getEnsAddress");
    expect(ens.length).toBe(5); // 4 textos + 1 endereço
    for (const c of ens) expect((c.args as { universalResolverAddress: string }).universalResolverAddress).toBe(UR);
  });

  it("recusa_nome_invalido_sem_consultar_a_rede", async () => {
    const { client } = fakeClient({});
    const reader = createReader({ client, universalResolver: UR });
    await expect(reader.resolveNewsroom("Investiga.eth")).rejects.toBeInstanceOf(InvalidNameError);
    expect(client.getEnsText).not.toHaveBeenCalled();
  });

  it("nome_sem_nenhum_registro_gera_nao_encontrada", async () => {
    const { client } = fakeClient({}, { address: null });
    await expect(createReader({ client, universalResolver: UR }).resolveNewsroom("vazio.eth")).rejects.toBeInstanceOf(NewsroomNotFoundError);
  });

  it("registros_incompletos_geram_erro_de_registros", async () => {
    const { client } = fakeClient({ [`parcial.eth|${ENS_KEYS.pubkey}`]: toBase64Url(KEY) });
    await expect(createReader({ client, universalResolver: UR }).resolveNewsroom("parcial.eth")).rejects.toBeInstanceOf(RecordsError);
  });
});

describe("chave de leitura do jornalista", () => {
  it("devolve_a_chave_de_32_bytes", async () => {
    const { client } = fakeClient({ [`maria.investiga.jornal.eth|${ENS_KEYS.readerKey}`]: toBase64Url(KEY) });
    expect(await createReader({ client, universalResolver: UR }).resolveReaderKey("maria.investiga.jornal.eth")).toEqual(KEY);
  });

  it("ausente_ou_invalida_gera_erro", async () => {
    const reader = (t: Record<string, string | null>) => createReader({ client: fakeClient(t).client, universalResolver: UR });
    await expect(reader({}).resolveReaderKey("maria.investiga.jornal.eth")).rejects.toBeInstanceOf(RecordsError);
    await expect(reader({ [`maria.investiga.jornal.eth|${ENS_KEYS.readerKey}`]: "curta" }).resolveReaderKey("maria.investiga.jornal.eth")).rejects.toBeInstanceOf(RecordsError);
  });
});

describe("V-04 jornalista ativo é decidido pelo registry, não pelo texto", () => {
  it("ativo_quando_o_subname_tem_dono", async () => {
    const { client, calls } = fakeClient({}, { owner: CUSTODIAN });
    expect(await createReader({ client, universalResolver: UR }).isActiveJournalist("maria.investiga.eth")).toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(["readContract:getSubregistry", "readContract:findOwner"]);
  });

  it("inativo_quando_o_dono_e_o_endereco_zero_mesmo_com_a_chave_ainda_legivel", async () => {
    const { client } = fakeClient({ [`maria.investiga.eth|${ENS_KEYS.readerKey}`]: toBase64Url(KEY) }, { owner: ZERO });
    expect(await createReader({ client, universalResolver: UR }).isActiveJournalist("maria.investiga.eth")).toBe(false);
  });

  it("inativo_quando_a_redacao_nao_tem_registry_de_jornalistas", async () => {
    const { client, calls } = fakeClient({}, { subregistry: ZERO });
    expect(await createReader({ client, universalResolver: UR }).isActiveJournalist("maria.investiga.eth")).toBe(false);
    expect(calls.some((c) => c.fn === "readContract:findOwner")).toBe(false);
  });

  it("so_aceita_o_formato_jornalista_redacao_eth", async () => {
    const reader = createReader({ client: fakeClient({}).client, universalResolver: UR });
    for (const bad of ["investiga.eth", "a.b.c.eth", "Maria.investiga.eth", "maria.investiga.com"]) {
      await expect(reader.isActiveJournalist(bad), bad).rejects.toBeInstanceOf(InvalidNameError);
    }
  });
});

describe("isNameAvailable (o nome .eth está livre para registrar?)", () => {
  it("consulta_o_registrar_com_o_rotulo", async () => {
    const { client, calls } = fakeClient({}, { available: false });
    expect(await createReader({ client }).isNameAvailable("jornalista1.eth")).toBe(false);
    expect(calls.find((c) => c.fn === "readContract:isAvailable")?.args).toMatchObject({ args: ["jornalista1"] });
    expect(await createReader({ client: fakeClient({}, { available: true }).client }).isNameAvailable("livre.eth")).toBe(true);
  });

  it("recusa_nome_que_nao_e_de_segundo_nivel_em_minusculas", async () => {
    const r = createReader({ client: fakeClient({}).client });
    for (const n of ["a.b.eth", "Maiuscula.eth", "sem-tld"]) await expect(r.isNameAvailable(n), n).rejects.toBeInstanceOf(InvalidNameError);
  });
});
