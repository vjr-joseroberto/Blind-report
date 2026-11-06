import { decodeFunctionData, isAddress, type Abi } from "viem";
import { describe, expect, it } from "vitest";
import { ABIS, ENSV2_SEPOLIA, dnsEncode, setTextCalldata, setterFor } from "../src/index.ts";

describe("chamadas ao resolver", () => {
  it("setTextCalldata_monta_setText_com_o_nome_em_formato_dns", () => {
    const data = setTextCalldata("investiga.jornal.eth", "denuncia.pubkey", "abc");
    const decoded = decodeFunctionData({ abi: ABIS.permissionedResolver as Abi, data });
    expect(decoded.functionName).toBe("setText");
    expect(decoded.args).toEqual([dnsEncode("investiga.jornal.eth"), "denuncia.pubkey", "abc"]);
  });

  it("setterFor_usa_valor_vazio_para_identificar_so_a_chave", () => {
    const data = setterFor("maria.investiga.jornal.eth", "denuncia.readerkey");
    const decoded = decodeFunctionData({ abi: ABIS.permissionedResolver as Abi, data });
    expect(decoded.args).toEqual([dnsEncode("maria.investiga.jornal.eth"), "denuncia.readerkey", ""]);
  });
});

describe("implantação do ENSv2 na Sepolia", () => {
  it("todos_os_enderecos_sao_validos", () => {
    for (const [k, v] of Object.entries(ENSV2_SEPOLIA)) expect(isAddress(v, { strict: false }), k).toBe(true);
  });

  it("os_abis_tem_as_funcoes_que_o_codigo_usa", () => {
    const names = (abi: Abi) => new Set(abi.filter((x) => x.type === "function").map((x) => (x as { name: string }).name));
    expect(names(ABIS.permissionedResolver as Abi)).toEqual(expect.objectContaining(new Set(["initialize", "setText", "setAddress", "grantSetterRoles"])));
    for (const fn of ["initialize", "setText", "setAddress", "grantSetterRoles"]) expect(names(ABIS.permissionedResolver as Abi).has(fn), fn).toBe(true);
    for (const fn of ["commit", "register", "makeCommitment", "getRegisterPrice", "isAvailable", "MIN_COMMITMENT_AGE"]) expect(names(ABIS.ethRegistrar as Abi).has(fn), fn).toBe(true);
    for (const fn of ["getTokenId", "setSubregistry", "getSubregistry"]) expect(names(ABIS.ethRegistry as Abi).has(fn), fn).toBe(true);
    for (const fn of ["initialize", "register", "unregister", "renew", "findOwner", "getStatus"]) expect(names(ABIS.userRegistry as Abi).has(fn), fn).toBe(true);
    expect(names(ABIS.verifiableFactory as Abi).has("deployProxy")).toBe(true);
    expect(names(ABIS.mockUSDC as Abi).has("mint")).toBe(true);
  });
});
