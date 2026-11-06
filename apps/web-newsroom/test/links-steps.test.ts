import { describe, expect, it } from "vitest";
import { addressLink, firstSteps, txLink } from "../src/links.ts";
import { SEPOLIA_SPEC } from "../src/wallet.ts";

const H = "0x" + "ab".repeat(32);
const A = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";

describe("links para a blockchain", () => {
  it("monta_links_de_transacao_e_endereco_pelo_explorador_da_rede", () => {
    expect(txLink(SEPOLIA_SPEC, H)).toBe(`https://sepolia.etherscan.io/tx/${H}`);
    expect(addressLink(SEPOLIA_SPEC, A)).toBe(`https://sepolia.etherscan.io/address/${A}`);
  });

  it("sem_explorador_nao_devolve_link", () => {
    expect(txLink({ ...SEPOLIA_SPEC, blockExplorerUrls: [] }, H)).toBeUndefined();
  });

  it("recusa_hash_e_endereco_malformados", () => {
    expect(txLink(SEPOLIA_SPEC, "0x12")).toBeUndefined();
    expect(addressLink(SEPOLIA_SPEC, "javascript:alert(1)")).toBeUndefined();
  });

  it("nao_duplica_a_barra_final_do_explorador", () => {
    expect(txLink({ ...SEPOLIA_SPEC, blockExplorerUrls: ["https://x.example.org/"] }, H)).toBe(`https://x.example.org/tx/${H}`);
  });
});

describe("guia de primeiros passos", () => {
  it("administrador_sem_chaves_ve_o_proximo_passo", () => {
    const steps = firstSteps("admin", { keysLoaded: false, backupDone: false, inboxLoaded: false });
    expect(steps.map((s) => [s.id, s.done])).toEqual([["wallet", true], ["keys", false], ["backup", false]]);
    expect(steps.find((s) => !s.done)!.id).toBe("keys");
  });

  it("administrador_com_tudo_feito_termina_o_guia", () => {
    expect(firstSteps("admin", { keysLoaded: true, backupDone: true, inboxLoaded: true, teamAdded: true }).every((s) => s.done)).toBe(true);
  });

  it("jornalista_precisa_gerar_a_chave_e_importar_o_chaveiro", () => {
    const steps = firstSteps("journalist", { keysLoaded: false, backupDone: false, inboxLoaded: false });
    expect(steps.map((s) => s.id)).toEqual(["wallet", "reader_key", "keyring"]);
    expect(firstSteps("journalist", { keysLoaded: true, backupDone: false, inboxLoaded: false, readerKeyMade: true }).every((s) => s.done)).toBe(true);
  });

  it("visitante_nao_tem_guia", () => {
    expect(firstSteps("visitor", { keysLoaded: false, backupDone: false, inboxLoaded: false })).toEqual([]);
  });
});
