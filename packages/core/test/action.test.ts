import { describe, expect, it } from "vitest";
import { InvalidNewsroomNameError, actionFor, isNewsroomName } from "../src/index.ts";

describe("RN-09 ação da prova: submit:<redação>:<época>", () => {
  it("formata_submit_redacao_epoca", () => {
    expect(actionFor("investiga.jornal.eth", 202611)).toBe("submit:investiga.jornal.eth:202611");
  });

  it("redacoes_diferentes_geram_acoes_diferentes", () => {
    expect(actionFor("a.eth", 202611)).not.toBe(actionFor("b.eth", 202611));
  });

  it("epocas_diferentes_geram_acoes_diferentes", () => {
    expect(actionFor("a.eth", 202611)).not.toBe(actionFor("a.eth", 202612));
  });

  it("recusa_nome_de_redacao_invalido", () => {
    for (const bad of ["", "Investiga.eth", "a..eth", "-a.eth", "a.com", "a b.eth", "submit:x.eth", ".eth"]) {
      expect(() => actionFor(bad, 202611), bad).toThrow(InvalidNewsroomNameError);
    }
  });

  it("recusa_epoca_invalida", () => {
    expect(() => actionFor("a.eth", 202613)).toThrow(RangeError);
  });

  it("isNewsroomName_aceita_nomes_e_subnomes_eth_em_minusculas", () => {
    expect(isNewsroomName("jornal.eth")).toBe(true);
    expect(isNewsroomName("investiga.jornal.eth")).toBe(true);
    expect(isNewsroomName("a-b.c1.eth")).toBe(true);
    expect(isNewsroomName("JORNAL.eth")).toBe(false);
  });
});
