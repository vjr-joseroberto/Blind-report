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
  if (!code || code === "0x") throw new Error("Sepolia fork unavailable: run `npm run nodes:up`.");
});

describe("RF-01 and RF-02 register the newsroom and publish the records", () => {
  it("creates_its_own_resolver_registers_the_name_and_publishes_the_key", async () => {
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

  it("nonexistent_name_returns_typed_error", async () => {
    const { reader } = await setup();
    await expect(reader.resolveNewsroom(`${uniqueLabel("inexistente")}.eth`)).rejects.toBeInstanceOf(NewsroomNotFoundError);
  });

  it("a_subname_without_record_resolves_through_the_parent_name_resolver", async () => {
    const { owner, admin, reader } = await setup();
    const label = uniqueLabel();
    const { name, resolver } = await admin.createNewsroom({ label, publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.setText({ name: `maria.${name}`, resolver, key: ENS_KEYS.readerKey, value: toBase64Url(READER) });
    expect(await reader.resolveReaderKey(`maria.${name}`)).toEqual(READER);
  });
});

describe("RN-02 and RN-03 permissions", () => {
  it("whoever_has_no_role_cannot_change_the_newsroom_key", async () => {
    const { owner, admin } = await setup();
    const { name, resolver } = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    const intruso = await newWallet();
    await expect(
      publicClient.simulateContract({ address: resolver, abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(name), ENS_KEYS.pubkey, "x"], account: intruso.account }),
    ).rejects.toThrow();
  });

  it("the_administrator_of_one_newsroom_does_not_write_to_another_resolver", async () => {
    const a = await setup();
    const b = await setup();
    await a.admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: a.owner.address });
    const nb = await b.admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: b.owner.address });
    await expect(
      publicClient.simulateContract({ address: nb.resolver, abi: ABIS.permissionedResolver, functionName: "setText", args: [dnsEncode(nb.name), ENS_KEYS.pubkey, "x"], account: a.owner.account }),
    ).rejects.toThrow();
  });
});

describe("RF-03 key rotation", () => {
  it("rotates_the_key_and_increments_the_version", async () => {
    const { owner, admin, reader } = await setup();
    const { name, resolver } = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.rotateKey({ name, resolver, publicKey: KEY_V2, version: 2 });
    const info = await reader.resolveNewsroom(name);
    expect(info.publicKey).toEqual(KEY_V2);
    expect(info.pubkeyVersion).toBe(2);
  });

  it("rejects_rotation_without_increasing_the_version", async () => {
    const { owner, admin } = await setup();
    const { name, resolver } = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 3, policy, custodian: owner.address });
    await expect(admin.rotateKey({ name, resolver, publicKey: KEY_V2, version: 3 })).rejects.toThrow(/version/i);
    await expect(admin.rotateKey({ name, resolver, publicKey: KEY_V2, version: 2 })).rejects.toThrow(/version/i);
  });
});

describe("RF-04 and RF-05 journalists (result of V-04)", () => {
  it("registers_active_journalist_with_reader_key_and_no_transfer_power", async () => {
    const { owner, admin, reader } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    const name = `maria.${nr.name}`;
    expect(await reader.isActiveJournalist(name)).toBe(true);
    expect(await reader.resolveReaderKey(name)).toEqual(READER);
    // without CAN_TRANSFER_ADMIN: the journalist cannot pass the subname on
    const outro = await newWallet();
    const token = (await publicClient.readContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "getTokenId", args: [BigInt(await keccakLabel("maria"))] })) as bigint;
    await expect(
      publicClient.simulateContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "unsafeTransfer", args: [outro.address, token, "0x"], account: maria.account }),
    ).rejects.toThrow();
  });

  it("revokes_with_unregister_and_clears_the_reader_key", async () => {
    const { owner, admin, reader } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    await admin.revokeJournalist({ newsroom: nr, label: "maria" });
    const name = `maria.${nr.name}`;
    expect(await reader.isActiveJournalist(name)).toBe(false);
    await expect(reader.resolveReaderKey(name)).rejects.toBeInstanceOf(RecordsError); // the key was cleared
  });

  it("third_party_cannot_revoke_or_renew", async () => {
    const { owner, admin } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    const intruso = await newWallet();
    const token = (await publicClient.readContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "getTokenId", args: [BigInt(await keccakLabel("maria"))] })) as bigint;
    await expect(publicClient.simulateContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "unregister", args: [token], account: intruso.account })).rejects.toThrow();
    await expect(publicClient.simulateContract({ address: nr.subRegistry, abi: ABIS.userRegistry, functionName: "renew", args: [token, BigInt(Math.floor(Date.now() / 1000) + 10 ** 7)], account: intruso.account })).rejects.toThrow();
  });

  it("renews_the_deadline_and_after_expiring_the_journalist_stops_being_active_and_can_be_reregistered", async () => {
    const { owner, admin, reader } = await setup();
    const maria = await newWallet();
    const nr = await admin.createNewsroom({ label: uniqueLabel(), publicKey: KEY_V1, version: 1, policy, custodian: owner.address });
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER, validForSeconds: 3600 });
    await admin.renewJournalist({ newsroom: nr, label: "maria", validForSeconds: 3 * 3600 });
    await advance(2 * 3600); // past the original deadline, but not the renewed one
    expect(await reader.isActiveJournalist(`maria.${nr.name}`)).toBe(true);
    await advance(2 * 3600); // now it has expired
    expect(await reader.isActiveJournalist(`maria.${nr.name}`)).toBe(false);
    // the reader key remains readable: that is why the decision belongs to the registry
    expect(await reader.resolveReaderKey(`maria.${nr.name}`)).toEqual(READER);
    await admin.addJournalist({ newsroom: nr, label: "maria", address: maria.address, readerKey: READER });
    expect(await reader.isActiveJournalist(`maria.${nr.name}`)).toBe(true);
  });
});

async function keccakLabel(label: string): Promise<`0x${string}`> {
  const { keccak256, toHex } = await import("viem");
  return keccak256(toHex(label));
}
