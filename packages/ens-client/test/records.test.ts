import { toBase64Url } from "@safe-whistle/core";
import { describe, expect, it } from "vitest";
import { RecordsError, parseNewsroomRecords } from "../src/index.ts";

const KEY = new Uint8Array(32).map((_, i) => i + 1);
const custodian = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const policyJson = JSON.stringify({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true });

const raw = (over: Record<string, unknown> = {}) => ({
  name: "investiga.jornal.eth",
  pubkey: toBase64Url(KEY),
  version: "3",
  policy: policyJson,
  relayer: "https://relayer-1.example.org,https://relayer-2.example.org",
  custodian,
  ...over,
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return "sem erro";
  } catch (e) {
    return e instanceof RecordsError ? e.code : "outro erro";
  }
};

describe("RF-02 ler os registros da redação", () => {
  it("interpreta_chave_versao_politica_relayers_e_custodiante", () => {
    const info = parseNewsroomRecords(raw());
    expect(info.name).toBe("investiga.jornal.eth");
    expect(info.publicKey).toEqual(KEY);
    expect(info.pubkeyVersion).toBe(3);
    expect(info.policy).toMatchObject({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true });
    expect(info.relayers).toEqual(["https://relayer-1.example.org", "https://relayer-2.example.org"]);
    expect(info.custodian).toBe(custodian);
  });

  it("relayer_e_opcional", () => {
    expect(parseNewsroomRecords(raw({ relayer: null })).relayers).toEqual([]);
    expect(parseNewsroomRecords(raw({ relayer: "" })).relayers).toEqual([]);
  });

  it("chave_ausente_gera_erro_claro", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: null })))).toBe("pubkey");
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: "" })))).toBe("pubkey");
  });

  it("chave_com_tamanho_ou_formato_errado_gera_erro", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: toBase64Url(new Uint8Array(16)) })))).toBe("pubkey");
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: "isto não é base64url!" })))).toBe("pubkey");
  });

  it("versao_invalida_gera_erro", () => {
    for (const v of [null, "", "0", "-1", "1.5", "abc", "2 "]) expect(codeOf(() => parseNewsroomRecords(raw({ version: v }))), String(v)).toBe("version");
  });

  it("politica_invalida_ou_ausente_gera_erro", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ policy: null })))).toBe("policy");
    expect(codeOf(() => parseNewsroomRecords(raw({ policy: "{nao json" })))).toBe("policy");
    expect(codeOf(() => parseNewsroomRecords(raw({ policy: JSON.stringify({ categories: [] }) })))).toBe("policy");
  });

  it("relayer_so_aceita_https", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ relayer: "http://inseguro.example.org" })))).toBe("relayer");
    expect(codeOf(() => parseNewsroomRecords(raw({ relayer: "nao e url" })))).toBe("relayer");
  });

  it("custodiante_ausente_ou_zero_gera_erro", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ custodian: null })))).toBe("custodian");
    expect(codeOf(() => parseNewsroomRecords(raw({ custodian: "0x0000000000000000000000000000000000000000" })))).toBe("custodian");
  });

  it("a_mensagem_de_erro_diz_qual_registro_falhou", () => {
    try {
      parseNewsroomRecords(raw({ pubkey: null }));
    } catch (e) {
      expect((e as Error).message).toContain("denuncia.pubkey");
    }
  });
});
