import { describe, expect, it, vi } from "vitest";
import { NewsroomNotFoundError, RecordsError } from "@safe-whistle/ens-client";
import { ACTIONS, canDo, detectRole } from "../src/index.ts";

const ADMIN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const MARIA = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca";
const STRANGER = "0x9999999999999999999999999999999999999999";
const NR = "investiga.eth";

function reader(over: { owners?: Record<string, string | null>; resolve?: () => Promise<unknown>; available?: boolean | Error } = {}) {
  return {
    resolveNewsroom: vi.fn(over.resolve ?? (async () => ({ custodian: ADMIN }) as never)) as never,
    journalistOwner: vi.fn(async (n: string) => (over.owners ?? { [`maria.${NR}`]: MARIA })[n] ?? null) as never,
    isNameAvailable: vi.fn(async () => { if (over.available instanceof Error) throw over.available; return over.available ?? true; }) as never,
  };
}
const detect = (address: string, journalist?: string, r = reader()) => detectRole({ address: address as never, newsroom: NR, journalist, reader: r });

describe("papel de quem conectou a carteira", () => {
  it("custodiante_da_redacao_e_administrador_ignorando_maiusculas", async () => {
    expect(await detect(ADMIN)).toEqual({ role: "admin", newsroom: NR });
    expect((await detect(ADMIN.toLowerCase())).role).toBe("admin");
  });

  it("dono_de_subnome_ativo_e_jornalista_com_nome_curto_ou_completo", async () => {
    expect(await detect(MARIA, "maria")).toEqual({ role: "journalist", newsroom: NR, journalistName: `maria.${NR}` });
    expect((await detect(MARIA, ` Maria.${NR} `)).role).toBe("journalist");
  });

  it("administrador_nao_precisa_informar_nome", async () => {
    const r = reader();
    expect((await detect(ADMIN, "maria", r)).role).toBe("admin");
    expect((r as any).journalistOwner).not.toHaveBeenCalled();
  });

  it("carteira_estranha_sem_nome_pede_o_nome", async () => {
    expect(await detect(STRANGER)).toMatchObject({ role: "visitor", reason: "name_required" });
  });

  it("carteira_diferente_do_dono_do_subnome_e_visitante", async () => {
    expect(await detect(STRANGER, "maria")).toMatchObject({ role: "visitor", reason: "wrong_wallet" });
  });

  it("jornalista_revogado_ou_inexistente_e_visitante", async () => {
    expect(await detect(MARIA, "joao")).toMatchObject({ role: "visitor", reason: "journalist_inactive" });
  });

  it("nome_de_jornalista_de_outra_redacao_ou_malformado_e_recusado_sem_consultar_o_ens", async () => {
    const r = reader();
    for (const j of ["maria.outra.eth", "a.b.investiga.eth", "Mar ia", "maria!"]) expect(await detect(MARIA, j, r), j).toMatchObject({ role: "visitor", reason: "invalid_name" });
    expect((r as any).journalistOwner).not.toHaveBeenCalled();
  });

  it("nome_ja_registrado_no_ens_sem_dados_do_safe_whistle_nao_oferece_cadastro", async () => {
    const r = reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); }, available: false });
    const v = await detect(ADMIN, undefined, r);
    expect(v).toMatchObject({ role: "visitor", reason: "name_taken" });
    expect(v.role === "visitor" && v.message).toMatch(/já está registrado/i);
  });

  it("nome_livre_oferece_cadastro_e_sem_a_consulta_de_disponibilidade_tambem", async () => {
    expect(await detect(ADMIN, undefined, reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); }, available: true }))).toMatchObject({ reason: "newsroom_not_found" });
    const noCheck = { resolveNewsroom: vi.fn(async () => { throw new NewsroomNotFoundError(NR); }) as never, journalistOwner: vi.fn() as never };
    expect(await detect(ADMIN, undefined, noCheck as never)).toMatchObject({ reason: "newsroom_not_found" });
  });

  it("falha_ao_consultar_a_disponibilidade_nao_vira_papel", async () => {
    await expect(detect(ADMIN, undefined, reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); }, available: new Error("rpc fora") }))).rejects.toThrow();
  });

  it("redacao_inexistente_ou_com_registros_invalidos_e_visitante_com_causa", async () => {
    expect(await detect(ADMIN, undefined, reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); } }))).toMatchObject({ role: "visitor", reason: "newsroom_not_found" });
    expect(await detect(ADMIN, undefined, reader({ resolve: async () => { throw new RecordsError("pubkey", "x"); } }))).toMatchObject({ role: "visitor", reason: "newsroom_misconfigured" });
  });

  it("nome_de_redacao_invalido_e_visitante", async () => {
    expect(await detectRole({ address: ADMIN as never, newsroom: "Invalida", reader: reader() })).toMatchObject({ role: "visitor", reason: "invalid_name" });
  });

  it("falha_de_rede_nao_vira_papel", async () => {
    await expect(detect(ADMIN, undefined, reader({ resolve: async () => { throw new Error("rpc fora"); } }))).rejects.toThrow();
  });

  it("todo_visitante_traz_mensagem_com_o_que_fazer", async () => {
    const v = await detect(STRANGER);
    expect(v.role === "visitor" && v.message.length).toBeGreaterThan(10);
  });
});

describe("permissões por papel", () => {
  const adminOnly = ["register_newsroom_admin_ops", "manage_team", "rotate_key", "edit_policy", "backup"] as const;

  it("administrador_pode_tudo", () => {
    for (const a of ACTIONS) expect(canDo("admin", a), a).toBe(true);
  });

  it("jornalista_le_anota_responde_e_renova_mas_nao_administra", () => {
    for (const a of ["read_inbox", "decrypt", "set_status", "reply", "renew", "reader_key", "import_shared_keyring"] as const) expect(canDo("journalist", a), a).toBe(true);
    for (const a of ["manage_team", "rotate_key", "edit_policy", "backup"] as const) expect(canDo("journalist", a), a).toBe(false);
  });

  it("visitante_nao_pode_nada_alem_de_cadastrar_a_redacao_que_nao_existe", () => {
    for (const a of ACTIONS) expect(canDo("visitor", a), a).toBe(a === "register_newsroom");
    void adminOnly;
  });
});
