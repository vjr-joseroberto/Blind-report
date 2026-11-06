import { ENS_KEYS, toBase64Url } from "@safe-whistle/core";
import { beforeAll, describe, expect, it } from "vitest";
import { NewsroomNotFoundError, RecordsError, createAdmin, createReader, dnsEncode, ABIS, ENSV2_SEPOLIA } from "../../src/index.ts";
import { advance, newWallet, publicClient, uniqueLabel } from "./helpers.ts";

const KEY_V1 = new Uint8Array(32).fill(1);
const KEY_V2 = new Uint8Array(32).fill(2);
const READER = new Uint8Array(32).fill(7);
const policy = { categories: ["corrupcao", "saude"], maxBytes: 100_000, attachments: true, epoch: "monthly" as const };

async function setup() {
  const owner = await newWallet();
  const admin = createAdmin({ publicClient, walletClient: owner.walletClient, wait: advance });
  const reader = createReader({ client: publicClient });
  return { owner, admin, reader };
}

beforeAll(async () => {
  const code = await publicClient.getCode({ address: ENSV2_SEPOLIA.ethRegistrar });
  if (!code || code === "0x") throw new Error("Fork da Sepolia indisponível: rode `npm run nodes:up`.");
});

describe("RF-01 e RF-02 cadastrar a redação e publicar os registros", () => {
  it("cria_resolver_proprio_registra_o_nome_e_publica_a_chave", async () => {
    const { owner, admin, reader } = await setup();
    const label = uniqueLabel();
    const created = await admin.createNewsroom({ label, publicKey: KEY_V1, version: 1, policy, relayers: ["https://relayer.example.org"], custodian: owner.address });
    expect(created.name).toBe(`${label}.eth`);
    expect((await publicClient.getCode({ address: created.resolver }))?.length).toBeGreaterThan(2);

    const available = await publicClient.readContract({ address: ENSV2_SEPOLIA.ethRegistrar, abi: ABIS.ethRegistrar, functionName: "isAvailable", args: [label] });
    expect(available).toBe(false);

    const info = await reader.resolveNewsroom(created.name);
    expect(info.publicKey).toEqual(KEY_V1);
    expect(info.pubkeyVersion).toBe(1);
    expect(info.policy).toEqual(policy);
    expect(info.relayers).toEqual(["https://relayer.example.org"]);
    expect(info.custodian.toLowerCase()).toBe(owner.address.toLowerCase());
  });

  it("nome_inexistente_devolve_erro_tipado", async () => {
    const { reader } = await setup();
    await expect(reader.resolveNewsroom(`${uniqueLabel("inexistente")}.eth`)).rejects.toBeInstanceOf(NewsroomNotFoundError);
  });

  it("um_subnome_sem_registro_resolve_pelo_resolver_do_nome_pai", async () => {
    const { owner, admin, reader } = await setup();
    const label = uniqueLabel();
    const { name, resolver } = await admin.createNewsroom({ label, publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.setText({ name: `maria.${name}`, resolver, key: ENS_KEYS.readerKey, value: toBase64Url(READER) });
    expect(await reader.resolveReaderKey(`maria.${name}`)).toEqual(READER);
  });
});

describe("RN-02 e RN-03 permissões", () => {
  it("quem_nao_tem_role_nao_troca_a_chave_da_redacao", async () => {
    const { owner, admin } = await setup();
    const { name, resolver } = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    const intruso = await newWallet();
    await expect(
      publicClient.simulateContract({ address: resolver, abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(name), ENS_KEYS.pubkey, "x"], account: intruso.account }),
    ).rejects.toThrow();
  });

  it("o_administrador_de_uma_redacao_nao_escreve_no_resolver_de_outra", async () => {
    const a = await setup();
    const b = await setup();
    await a.admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: a.owner.address });
    const nb = await b.admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: b.owner.address });
    await expect(
      publicClient.simulateContract({ address: nb.resolver, abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(nb.name), ENS_KEYS.pubkey, "x"], account: a.owner.account }),
    ).rejects.toThrow();
  });
});

describe("RF-03 rotação de chave", () => {
  it("rotaciona_a_chave_e_incrementa_a_versao", async () => {
    const { owner, admin, reader } = await setup();
    const { name, resolver } = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.rotateKey({ name, resolver, publicKey: KEY_V2, version: 2 });
    const info = await reader.resolveNewsroom(name);
    expect(info.publicKey).toEqual(KEY_V2);
    expect(info.pubkeyVersion).toBe(2);
  });

  it("recusa_rotacao_sem_aumentar_a_versao", async () => {
    const { owner, admin } = await setup();
    const { name, resolver } = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 3, policy, custodian: owner.address });
    await expect(admin.rotateKey({ name, resolver, publicKey: KEY_V2, version: 3 })).rejects.toThrow(/versão/i);
    await expect(admin.rotateKey({ name, resolver, publicKey: KEY_V2, version: 2 })).rejects.toThrow(/versão/i);
  });
});

describe("RF-04 e RF-05 jornalistas (resultado de V-04)", () => {
  it("cadastra_jornalista_ativo_com_chave_de_leitura_e_sem_poder_de_transferir", async () => {
    const { owner, admin, reader } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    const name = `maria.${nr.name}`;
    expect(await reader.isActiveJournalist(name)).toBe(true);
    expect(await reader.resolveReaderKey(name)).toEqual(READER);
    // sem CAN_TRANSFER_ADMIN: o jornalista não consegue passar o subname adiante
    const outro = await newWallet();
    const token = (await publicClient.readContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "getTokenId", args: [BigInt(await keccakLabel("maria"))] })) as bigint;
    await expect(
      publicClient.simulateContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "unsafeTransfer", args: [outro.address, token, "0x"], account: maria.account }),
    ).rejects.toThrow();
  });

  it("revoga_com_unregister_e_limpa_a_chave_de_leitura", async () => {
    const { owner, admin, reader } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    await admin.revokeJournalist({ newsroom: nr, label: "maria" });
    const name = `maria.${nr.name}`;
    expect(await reader.isActiveJournalist(name)).toBe(false);
    await expect(reader.resolveReaderKey(name)).rejects.toBeInstanceOf(RecordsError); // a chave foi limpa
  });

  it("terceiro_nao_revoga_nem_renova", async () => {
    const { owner, admin } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    const intruso = await newWallet();
    const token = (await publicClient.readContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "getTokenId", args: [BigInt(await keccakLabel("maria"))] })) as bigint;
    await expect(publicClient.simulateContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "unregister", args: [token], account: intruso.account })).rejects.toThrow();
    await expect(publicClient.simulateContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "renew", args: [token, BigInt(Math.floor(Date.now() / 1000) + 10 ** 7)], account: intruso.account })).rejects.toThrow();
  });

  it("renova_o_prazo_e_apos_expirar_o_jornalista_deixa_de_estar_ativo_e_pode_ser_recadastrado", async () => {
    const { owner, admin, reader } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER, validForSeconds: 3600 });
    await admin.renewJournalist({ newsroom: nr, label: "maria", validForSeconds: 3 * 3600 });
    await advance(2 * 3600); // passou do prazo original, mas não do renovado
    expect(await reader.isActiveJournalist(`maria.${nr.name}`)).toBe(true);
    await advance(2 * 3600); // agora expirou
    expect(await reader.isActiveJournalist(`maria.${nr.name}`)).toBe(false);
    // a chave de leitura continua legível: por isso a decisão é do registry
    expect(await reader.resolveReaderKey(`maria.${nr.name}`)).toEqual(READER);
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    expect(await reader.isActiveJournalist(`maria.${nr.name}`)).toBe(true);
  });
});

async function keccakLabel(label: string): Promise<`0x${string}`> {
  const { keccak256, toHex } = await import("viem");
  return keccak256(toHex(label));
}
