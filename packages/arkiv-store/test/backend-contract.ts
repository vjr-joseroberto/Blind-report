// Contrato do Backend: a MESMA suíte roda contra o backend em memória (unitário) e contra o nó Arkiv real (integração).
import { describe, expect, it } from "vitest";
import { ARKIV_MAX_RETENTION_SECONDS, type Backend } from "../src/index.ts";

export type World = {
  /** Conta que cria as entidades (o relayer). */
  relayer: Backend;
  /** Conta que passa a ser dona depois da transferência (a redação). */
  newsroom: Backend;
  /** Conta sem nenhum direito. */
  stranger: Backend;
  /** Faz o tempo andar `seconds` (memória: instantâneo; nó real: dorme). Opcional. */
  advance?: (seconds: number) => Promise<void>;
};

const rand32 = () => "0x" + [...globalThis.crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const nid = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const flags = (over: { expirationSeconds?: number; readonly?: boolean; permissionlessExtension?: boolean } = {}) => ({ expirationSeconds: 3600, readonly: true, permissionlessExtension: false, ...over });
const bytes = (n: number, v = 7) => new Uint8Array(n).fill(v);

export function defineBackendContract(label: string, makeWorld: () => Promise<World>): void {
  describe(`contrato do Backend: ${label}`, () => {
    it("guarda_o_atributo_authorName_em_anotacao_e_resposta", async () => {
      const w = await makeWorld();
      const newsroom = `${nid()}.eth`;
      await w.newsroom.create("anotacao", { newsroom, denunciaKey: rand32(), status: "review", byJournalist: w.newsroom.account.toLowerCase(), authorName: "maria.investiga.eth" }, bytes(1), flags());
      await w.newsroom.create("resposta", { newsroom, mailboxId: rand32(), authorName: "maria.investiga.eth" }, bytes(20), flags());
      expect((await w.stranger.select("anotacao", { newsroom }, { offset: 0, limit: 10 }))[0]!.attrs.authorName).toBe("maria.investiga.eth");
      expect((await w.stranger.select("resposta", { newsroom }, { offset: 0, limit: 10 }))[0]!.attrs.authorName).toBe("maria.investiga.eth");
    });

    it("cria_e_seleciona_por_filtro_com_dados_e_atributos_intactos", async () => {
      const w = await makeWorld();
      const newsroom = `${nid()}.eth`;
      const { key } = await w.relayer.create("denuncia", { newsroom, category: "saude", status: "new", epoch: 202611n, contentHash: "0x" + "ab".repeat(32), pubkeyVersion: 1n, part: 0n, parts: 1n }, bytes(100, 9), flags());
      const rows = await w.stranger.select("denuncia", { newsroom }, { offset: 0, limit: 10 });
      expect(rows).toHaveLength(1);
      const r = rows[0]!;
      expect(r.key).toBe(key);
      expect(r.attrs.category).toBe("saude");
      expect(r.attrs.epoch).toBe(202611n);
      expect(r.data).toEqual(bytes(100, 9));
      expect(r.creator.toLowerCase()).toBe(w.relayer.account.toLowerCase());
      expect(r.owner.toLowerCase()).toBe(w.relayer.account.toLowerCase());
    });

    it("outro_filtro_nao_devolve_nada", async () => {
      const w = await makeWorld();
      await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId: rand32() }, bytes(10), flags());
      expect(await w.relayer.select("resposta", { mailboxId: rand32() }, { offset: 0, limit: 10 })).toEqual([]);
    });

    it("selecao_sem_nenhum_filtro_e_recusada", async () => {
      const w = await makeWorld();
      await expect(w.relayer.select("denuncia", {}, { offset: 0, limit: 10 })).rejects.toThrow();
    });

    it("pagina_com_offset_e_limit_sem_repetir_nem_perder", async () => {
      const w = await makeWorld();
      const newsroom = `${nid()}.eth`;
      for (let i = 0; i < 5; i++) {
        await w.relayer.create("anotacao", { newsroom, denunciaKey: `k${i}`, status: "review", byJournalist: w.relayer.account.toLowerCase() }, bytes(1), flags());
      }
      const a = await w.relayer.select("anotacao", { newsroom }, { offset: 0, limit: 2 });
      const b = await w.relayer.select("anotacao", { newsroom }, { offset: 2, limit: 2 });
      const c = await w.relayer.select("anotacao", { newsroom }, { offset: 4, limit: 2 });
      const keys = [...a, ...b, ...c].map((r) => r.key);
      expect([a.length, b.length, c.length]).toEqual([2, 2, 1]);
      expect(new Set(keys).size).toBe(5);
    });

    it("so_o_dono_transfere_a_propriedade", async () => {
      const w = await makeWorld();
      const mailboxId = rand32();
      const { key } = await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId }, bytes(5), flags());
      await expect(w.stranger.changeOwnership(key, w.stranger.account)).rejects.toThrow();
      await w.relayer.changeOwnership(key, w.newsroom.account);
      const [row] = await w.relayer.select("resposta", { mailboxId }, { offset: 0, limit: 1 });
      expect(row!.owner.toLowerCase()).toBe(w.newsroom.account.toLowerCase());
      expect(row!.creator.toLowerCase()).toBe(w.relayer.account.toLowerCase()); // o criador não muda
      await expect(w.relayer.changeOwnership(key, w.relayer.account)).rejects.toThrow(); // quem criou já não é dono
    });

    it("estender_exige_ser_dono_ou_a_entidade_aceitar_extensao_livre", async () => {
      const w = await makeWorld();
      const plain = await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId: rand32() }, bytes(5), flags());
      await w.relayer.changeOwnership(plain.key, w.newsroom.account);
      await expect(w.relayer.extend(plain.key, 7200)).rejects.toThrow(); // não é dono e a extensão não é livre
      await w.newsroom.extend(plain.key, 7200); // a dona estende

      const free = await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId: rand32() }, bytes(5), flags({ permissionlessExtension: true }));
      await w.relayer.changeOwnership(free.key, w.newsroom.account);
      await w.relayer.extend(free.key, 7200); // o relayer estende sem ser dono
      await w.stranger.extend(free.key, 7200); // qualquer conta pode (só aumenta a retenção)
    });

    it("get_devolve_a_entidade_pela_chave_ou_nulo", async () => {
      const w = await makeWorld();
      const mailboxId = rand32();
      const { key } = await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId }, bytes(8, 3), flags());
      const row = await w.stranger.get("resposta", key);
      expect(row?.key).toBe(key);
      expect(row?.attrs.mailboxId).toBe(mailboxId);
      expect(row?.data).toEqual(bytes(8, 3));
      expect(await w.stranger.get("resposta", ("0x" + "00".repeat(32)) as `0x${string}`)).toBeNull();
    });

    it("a_cadeia_recusa_vida_alem_do_maximo_ao_criar_e_ao_estender", async () => {
      const w = await makeWorld();
      const att = { newsroom: `${nid()}.eth`, mailboxId: rand32() };
      await expect(w.relayer.create("resposta", att, bytes(5), flags({ expirationSeconds: ARKIV_MAX_RETENTION_SECONDS + 10 }))).rejects.toThrow();
      const { key } = await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId: rand32() }, bytes(5), flags());
      await expect(w.relayer.extend(key, ARKIV_MAX_RETENTION_SECONDS + 10)).rejects.toThrow();
    });

    it("o_tempo_atual_avanca", async () => {
      const w = await makeWorld();
      const a = await w.relayer.timing();
      await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId: rand32() }, bytes(5), flags());
      const b = await w.relayer.timing();
      expect(b.currentBlock).toBeGreaterThan(a.currentBlock);
      expect(b.blockSeconds).toBeGreaterThan(0);
    });

    it("entidade_expirada_some_da_consulta", async () => {
      const w = await makeWorld();
      if (!w.advance) return;
      const mailboxId = rand32();
      await w.relayer.create("resposta", { newsroom: `${nid()}.eth`, mailboxId }, bytes(5), { expirationSeconds: 10, readonly: true, permissionlessExtension: false });
      expect(await w.relayer.select("resposta", { mailboxId }, { offset: 0, limit: 5 })).toHaveLength(1);
      await w.advance(20);
      expect(await w.relayer.select("resposta", { mailboxId }, { offset: 0, limit: 5 })).toEqual([]);
    });
  });
}
