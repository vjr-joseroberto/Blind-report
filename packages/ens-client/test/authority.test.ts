import { describe, expect, it, vi } from "vitest";
import { InvalidNameError, createAuthority, createReader, type EnsReadClient } from "../src/index.ts";

const NEWSROOM = "investiga.eth";
const ADMIN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const MARIA = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca";
const STRANGER = "0x9999999999999999999999999999999999999999";
const ZERO = "0x0000000000000000000000000000000000000000";

function stubReader(owners: Record<string, string | null>, custodian = ADMIN) {
  return {
    resolveNewsroom: vi.fn(async (name: string) => ({ name, custodian }) as never),
    journalistOwner: vi.fn(async (name: string) => (owners[name] ?? null) as `0x${string}` | null),
  };
}

describe("journalistOwner (leitor)", () => {
  const client = (owner: string, subregistry = "0x1111111111111111111111111111111111111111"): EnsReadClient => ({
    getEnsText: vi.fn(async () => null),
    getEnsAddress: vi.fn(async () => ADMIN as never),
    readContract: vi.fn(async (a) => (a.functionName === "getSubregistry" ? subregistry : owner)),
  });

  it("devolve_o_dono_do_subnome_ativo", async () => {
    expect(await createReader({ client: client(MARIA) }).journalistOwner(`maria.${NEWSROOM}`)).toBe(MARIA);
  });

  it("devolve_nulo_se_nao_ha_dono_ou_registry", async () => {
    expect(await createReader({ client: client(ZERO) }).journalistOwner(`maria.${NEWSROOM}`)).toBeNull();
    expect(await createReader({ client: client(MARIA, ZERO) }).journalistOwner(`maria.${NEWSROOM}`)).toBeNull();
  });

  it("recusa_nome_que_nao_e_de_jornalista", async () => {
    await expect(createReader({ client: client(MARIA) }).journalistOwner("investiga.eth")).rejects.toBeInstanceOf(InvalidNameError);
  });

  it("isActiveJournalist_continua_valendo", async () => {
    expect(await createReader({ client: client(MARIA) }).isActiveJournalist(`maria.${NEWSROOM}`)).toBe(true);
    expect(await createReader({ client: client(ZERO) }).isActiveJournalist(`maria.${NEWSROOM}`)).toBe(false);
  });
});

describe("autoridade da redação (A2)", () => {
  const make = (owners: Record<string, string | null> = { [`maria.${NEWSROOM}`]: MARIA }, custodian = ADMIN) => {
    const reader = stubReader(owners, custodian);
    return { reader, authority: createAuthority({ reader, newsroom: NEWSROOM }) };
  };

  it("administrador_vale_sem_nome", async () => {
    expect(await make().authority.isAuthorized({ creator: ADMIN as never })).toBe(true);
  });

  it("administrador_vale_mesmo_com_o_endereco_em_outra_caixa", async () => {
    expect(await make().authority.isAuthorized({ creator: ADMIN.toLowerCase() as never, authorName: "qualquer.investiga.eth" })).toBe(true);
  });

  it("jornalista_ativo_com_dono_correto_vale", async () => {
    expect(await make().authority.isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` })).toBe(true);
  });

  it("nome_de_jornalista_com_dono_diferente_do_criador_nao_vale", async () => {
    expect(await make().authority.isAuthorized({ creator: STRANGER as never, authorName: `maria.${NEWSROOM}` })).toBe(false);
  });

  it("subnome_de_outra_redacao_nao_vale", async () => {
    const { authority, reader } = make({ "maria.outra.eth": STRANGER });
    expect(await authority.isAuthorized({ creator: STRANGER as never, authorName: "maria.outra.eth" })).toBe(false);
    expect(reader.journalistOwner).not.toHaveBeenCalled();
  });

  it("jornalista_revogado_nao_vale", async () => {
    expect(await make({ [`maria.${NEWSROOM}`]: null }).authority.isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` })).toBe(false);
  });

  it("sem_nome_e_criador_diferente_do_custodiante_nao_vale", async () => {
    expect(await make().authority.isAuthorized({ creator: MARIA as never })).toBe(false);
  });

  it("nome_malformado_ou_com_niveis_extras_nao_vale", async () => {
    const { authority } = make();
    for (const authorName of ["maria", "a.b.investiga.eth", `.${NEWSROOM}`, `Maria.${NEWSROOM}`]) {
      expect(await authority.isAuthorized({ creator: MARIA as never, authorName }), authorName).toBe(false);
    }
  });

  it("consulta_o_ens_uma_vez_por_nome_e_o_custodiante_uma_vez", async () => {
    const { authority, reader } = make();
    for (let i = 0; i < 3; i++) await authority.isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` });
    await authority.isAuthorized({ creator: ADMIN as never });
    expect(reader.journalistOwner).toHaveBeenCalledTimes(1);
    expect(reader.resolveNewsroom).toHaveBeenCalledTimes(1);
  });

  it("falha_de_rede_nao_vira_autorizado", async () => {
    const reader = stubReader({});
    reader.journalistOwner.mockRejectedValueOnce(new Error("rpc fora"));
    await expect(createAuthority({ reader, newsroom: NEWSROOM }).isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` })).rejects.toThrow();
  });

  it("recusa_nome_de_redacao_invalido", () => {
    expect(() => createAuthority({ reader: stubReader({}), newsroom: "Invalida" })).toThrow(InvalidNameError);
  });
});
