import { toBase64Url } from "@safe-whistle/core";
import { newKeypair, openReply } from "@safe-whistle/crypto";
import type { AdminStep } from "@safe-whistle/ens-client";
import { describe, expect, it } from "vitest";
import { NewsroomError, createNewsroomClient } from "../src/index.ts";
import { createStore } from "@safe-whistle/arkiv-store";
import { ENS, JOURNALIST, NEWSROOM_ACCOUNT, POLICY, STRANGER, makeDeps, publishAs } from "./helpers.ts";

const registered = async (f = makeDeps()) => {
  const client = createNewsroomClient(f.deps);
  await client.registerNewsroom({ label: "investiga", policy: POLICY });
  return { f, client };
};
const bytesIn = (v: unknown, needle: Uint8Array): boolean => {
  const hay = JSON.stringify(v, (_k, x) => (x instanceof Uint8Array ? `B64:${toBase64Url(x)}` : typeof x === "bigint" ? x.toString() : x));
  return hay.includes(toBase64Url(needle)) || hay.includes(Buffer.from(needle).toString("hex"));
};

describe("1. registration", () => {
  it("registers_the_newsroom_and_reports_the_commit_wait", async () => {
    const client = createNewsroomClient(makeDeps().deps);
    const steps: AdminStep[] = [];
    const n = await client.registerNewsroom({ label: "investiga", policy: POLICY, onProgress: (e) => steps.push(e) });
    expect(n.name).toBe("investiga.eth");
    expect(steps.map((s) => s.step)).toEqual(["resolver", "commit", "commit_wait", "register", "records", "registry", "done"]);
    expect(steps.find((s) => s.step === "commit_wait")?.seconds).toBe(65);
  });

  it("publishes_key_and_policy_with_version_1_and_the_account_as_custodian", async () => {
    const { f, client } = await registered();
    expect(f.admin.createNewsroom).toHaveBeenCalledWith(expect.objectContaining({ label: "investiga", version: 1, policy: POLICY, custodian: NEWSROOM_ACCOUNT }));
    expect(f.admin.createNewsroom.mock.calls[0]![0].publicKey).toEqual(client.currentKey().publicKey);
    expect(client.currentKey().version).toBe(1);
  });

  it("refuses_invalid_policy_before_spending_gas", async () => {
    const f = makeDeps();
    await expect(createNewsroomClient(f.deps).registerNewsroom({ label: "investiga", policy: { ...POLICY, categories: [] } })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.admin.createNewsroom).not.toHaveBeenCalled();
  });

  it("without_a_newsroom_dependent_operations_fail_with_a_clear_error", async () => {
    const client = createNewsroomClient(makeDeps().deps);
    await expect(client.listInbox({})).rejects.toMatchObject({ code: "no_newsroom" });
    await expect(client.rotateKey()).rejects.toMatchObject({ code: "no_newsroom" });
    expect(() => client.currentKey()).toThrow(NewsroomError);
  });
});

describe("2. keys", () => {
  it("generates_the_private_key_locally_and_never_sends_it", async () => {
    const { f, client } = await registered();
    const priv = client.exportKeyringForTest().keys[0]!.privateKey;
    await client.rotateKey();
    await client.addJournalist({ label: "maria", address: JOURNALIST, readerPublicKey: newKeypair().publicKey });
    expect(f.calls.length).toBeGreaterThan(2);
    for (const call of f.calls) expect(bytesIn(call, priv)).toBe(false);
  });

  it("rotates_with_a_higher_version_and_keeps_the_old_keys", async () => {
    const { f, client } = await registered();
    const old = client.currentKey();
    await client.rotateKey();
    expect(client.currentKey().version).toBe(2);
    expect(f.admin.rotateKey).toHaveBeenCalledWith(expect.objectContaining({ version: 2, resolver: ENS.resolver, name: "investiga.eth" }));
    expect(client.currentKey().publicKey).not.toEqual(old.publicKey);
    expect(client.keyVersions()).toEqual([1, 2]);
  });

  it("if_publishing_the_new_key_fails_the_key_does_not_enter_the_keyring", async () => {
    const { f, client } = await registered();
    f.admin.rotateKey.mockRejectedValueOnce(new Error("rpc down"));
    await expect(client.rotateKey()).rejects.toThrow();
    expect(client.keyVersions()).toEqual([1]);
  });

  it("exports_the_key_protected_by_password_and_imports_and_restores", async () => {
    const { f, client } = await registered();
    await client.rotateKey();
    const blob = await client.exportBackup("senha-forte-123");
    expect(blob).not.toContain(toBase64Url(client.exportKeyringForTest().keys[0]!.privateKey));
    const other = createNewsroomClient(makeDeps().deps);
    await other.importBackup(blob, "senha-forte-123");
    expect(other.keyVersions()).toEqual([1, 2]);
    expect(other.currentKey().publicKey).toEqual(client.currentKey().publicKey);
    expect(other.newsroom()).toEqual(ENS);
    void f;
  });

  it("wrong_password_fails", async () => {
    const { client } = await registered();
    const blob = await client.exportBackup("senha-forte-123");
    await expect(createNewsroomClient(makeDeps().deps).importBackup(blob, "errada-errada")).rejects.toMatchObject({ code: "wrong_password" });
  });

  it("malformed_or_wrong_type_backup_is_refused", async () => {
    const c = createNewsroomClient(makeDeps().deps);
    await expect(c.importBackup("lixo", "senha-forte-123")).rejects.toMatchObject({ code: "invalid_backup" });
    const { lockWithPassword } = await import("@safe-whistle/crypto");
    const wrong = await lockWithPassword(new TextEncoder().encode('{"v":1}'), "senha-forte-123", { iterations: 1000 });
    await expect(c.importBackup(wrong, "senha-forte-123")).rejects.toMatchObject({ code: "invalid_backup" });
  });

  it("exporting_without_keys_fails", async () => {
    await expect(createNewsroomClient(makeDeps().deps).exportBackup("senha-forte-123")).rejects.toMatchObject({ code: "no_newsroom" });
  });
});

describe("newsroom policy", () => {
  it("updates_the_policy_in_ens_of_the_newsroom_resolver", async () => {
    const { f, client } = await registered();
    const policy = { categories: ["saude"], maxBytes: 50_000, attachments: false, epoch: "monthly" as const };
    await client.updatePolicy(policy);
    expect(f.admin.setText).toHaveBeenCalledWith({ name: ENS.name, resolver: ENS.resolver, key: "denuncia.policy", value: JSON.stringify(policy) });
  });

  it("refuses_invalid_policy_before_spending_gas", async () => {
    const { f, client } = await registered();
    await expect(client.updatePolicy({ categories: [], maxBytes: 1, attachments: false, epoch: "monthly" })).rejects.toMatchObject({ code: "invalid_input" });
    expect(f.admin.setText).not.toHaveBeenCalled();
  });

  it("requires_the_newsroom_loaded", async () => {
    await expect(createNewsroomClient(makeDeps().deps).updatePolicy(POLICY)).rejects.toMatchObject({ code: "no_newsroom" });
  });
});

describe("3. journalists", () => {
  it("registers_and_revokes", async () => {
    const { f, client } = await registered();
    const reader = newKeypair();
    await client.addJournalist({ label: "maria", address: JOURNALIST, readerPublicKey: reader.publicKey, validForSeconds: 1000 });
    expect(f.admin.addJournalist).toHaveBeenCalledWith({ newsroom: ENS, label: "maria", address: JOURNALIST, readerKey: reader.publicKey, validForSeconds: 1000 });
    const r = await client.revokeJournalist("maria");
    expect(f.admin.revokeJournalist).toHaveBeenCalledWith({ newsroom: ENS, label: "maria" });
    expect(r.rotateRecommended).toBe(true);
  });

  it("renews_the_journalist", async () => {
    const { f, client } = await registered();
    await client.renewJournalist("maria", 3600);
    expect(f.admin.renewJournalist).toHaveBeenCalledWith({ newsroom: ENS, label: "maria", validForSeconds: 3600 });
  });

  it("the_journalist_receives_the_keyring_encrypted_for_their_key_and_decrypts", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await client.rotateKey();
    const sub1 = await publishAs(f, { version: 1, publicKey: client.keyFor(1).publicKey }, { text: "antiga" });
    const sub2 = await publishAs(f, client.currentKey(), { text: "nova" });
    const reader = newKeypair();
    const shared = client.shareKeyring(reader.publicKey);
    expect(shared).not.toContain(toBase64Url(client.keyFor(1).privateKey));

    const journalist = createNewsroomClient({ ...f.deps, account: JOURNALIST });
    journalist.importSharedKeyring(shared, reader);
    expect(journalist.newsroom()).toEqual(ENS);
    expect(journalist.keyVersions()).toEqual([1, 2]);
    expect((await journalist.decrypt((await journalist.listInbox({})).items.find((i) => i.key === sub1.entity)!)).text).toBe("antiga");
    expect((await journalist.decrypt((await journalist.listInbox({})).items.find((i) => i.key === sub2.entity)!)).text).toBe("nova");
  });

  it("shared_keyring_with_another_key_does_not_open", async () => {
    const { client } = await registered();
    const shared = client.shareKeyring(newKeypair().publicKey);
    const j = createNewsroomClient(makeDeps().deps);
    expect(() => j.importSharedKeyring(shared, newKeypair())).toThrow(NewsroomError);
  });
});

describe("3b. reader key", () => {
  it("each_journalist_generates_their_own_keypair", () => {
    const c = createNewsroomClient(makeDeps().deps);
    const a = c.newReaderKey();
    expect(a.publicKey).toHaveLength(32);
    expect(c.newReaderKey().privateKey).not.toEqual(a.privateKey);
  });
});

describe("4. list", () => {
  it("lists_by_status_and_category", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const a = await publishAs(f, client.currentKey(), { category: "saude" });
    await publishAs(f, client.currentKey(), { category: "corrupcao" });
    await client.setStatus(a.entity, "review");
    expect((await client.listInbox({})).items).toHaveLength(2);
    expect((await client.listInbox({ category: "corrupcao" })).items).toHaveLength(1);
    const reviewed = await client.listInbox({ status: "review" });
    expect(reviewed.items.map((i) => i.key)).toEqual([a.entity]);
    expect((await client.listInbox({ status: "new" })).items).toHaveLength(1);
  });

  it("paginates_in_blocks", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    for (let i = 0; i < 5; i++) await publishAs(f, client.currentKey());
    const p1 = await client.listInbox({ limit: 2, offset: 0 });
    const p3 = await client.listInbox({ limit: 2, offset: 4 });
    expect(p1.items).toHaveLength(2);
    expect(p1.hasMore).toBe(true);
    expect(p3.items).toHaveLength(1);
    expect(p3.hasMore).toBe(false);
  });
});

describe("5. decryption", () => {
  it("decrypts_text_and_attachment", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const data = new Uint8Array([1, 2, 3, 250]);
    await publishAs(f, client.currentKey(), { text: "olá ção", attachment: { name: "a.bin", data } });
    const item = (await client.listInbox({})).items[0]!;
    const out = await client.decrypt(item);
    expect(out.text).toBe("olá ção");
    expect(out.attachment?.name).toBe("a.bin");
    expect([...out.attachment!.data]).toEqual([...data]);
    expect(out.category).toBe("saude");
  });

  it("old_version_envelope_uses_the_old_key", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const v1 = client.currentKey();
    await publishAs(f, v1, { text: "da versão 1" });
    await client.rotateKey();
    const item = (await client.listInbox({})).items[0]!;
    expect(item.pubkeyVersion).toBe(1);
    expect((await client.decrypt(item)).text).toBe("da versão 1");
  });

  it("does_not_decrypt_without_the_version_key", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await publishAs(f, { version: 7, publicKey: newKeypair().publicKey });
    const item = (await client.listInbox({})).items[0]!;
    await expect(client.decrypt(item)).rejects.toMatchObject({ code: "missing_key" });
  });

  it("envelope_encrypted_for_another_key_with_the_same_version_fails_with_a_clear_error", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await publishAs(f, { version: 1, publicKey: newKeypair().publicKey });
    await expect(client.decrypt((await client.listInbox({})).items[0]!)).rejects.toMatchObject({ code: "cannot_decrypt" });
  });
});

describe("6. status", () => {
  it("records_note_without_changing_the_envelope", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const before = (await client.listInbox({})).items[0]!;
    await client.setStatus(sub.entity, "verified");
    const after = (await client.listInbox({})).items[0]!;
    expect(after.status).toBe("verified");
    expect(after.envelope).toEqual(before.envelope);
    expect(after.contentHash).toBe(before.contentHash);
    expect(await client.statusOf(sub.entity)).toBe("verified");
  });
});

describe("A3 note authorship", () => {
  const MARIA = `maria.${ENS.name}`;
  const asJournalist = (f: ReturnType<typeof makeDeps>, authorName: string | undefined = MARIA) =>
    createNewsroomClient({ ...f.deps, account: JOURNALIST, store: createStore(f.chain.backendFor(JOURNALIST)), authorName });

  it("status_forged_by_any_wallet_does_not_appear", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    await createStore(f.chain.backendFor(STRANGER)).annotate({ newsroom: ENS.name, denunciaKey: sub.entity, status: "discarded", journalist: JOURNALIST, authorName: MARIA });
    const r = await client.listInbox({});
    expect(r.items[0]!.status).toBe("new");
    expect(await client.statusOf(sub.entity)).toBe("new");
  });

  it("active_journalist_status_appears_and_carries_their_name", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    f.owners[MARIA] = JOURNALIST;
    const sub = await publishAs(f, client.currentKey());
    const journalist = asJournalist(f);
    journalist.useNewsroom(ENS);
    await journalist.setStatus(sub.entity, "review");
    expect((await client.listInbox({})).items[0]!.status).toBe("review");
    expect((await createStore(f.chain.backendFor(JOURNALIST)).listAnnotations({ newsroom: ENS.name }))[0]).toMatchObject({ authorName: MARIA });
  });

  it("administrator_status_is_valid_without_a_name", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    await client.setStatus(sub.entity, "verified");
    expect((await client.listInbox({})).items[0]!.status).toBe("verified");
  });

  it("revoked_journalist_status_is_ignored", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    f.owners[MARIA] = JOURNALIST;
    const sub = await publishAs(f, client.currentKey());
    const journalist = asJournalist(f);
    journalist.useNewsroom(ENS);
    await journalist.setStatus(sub.entity, "review");
    f.owners[MARIA] = null; // revoked
    const r = await client.listInbox({});
    expect(r.items[0]!.status).toBe("new");
    expect(r.ignoredAnnotations).toBe(1);
  });

  it("inbox_reports_how_many_notes_were_ignored", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const stranger = createStore(f.chain.backendFor(STRANGER));
    for (const status of ["discarded", "verified"] as const) await stranger.annotate({ newsroom: ENS.name, denunciaKey: sub.entity, status, journalist: JOURNALIST });
    expect((await client.listInbox({})).ignoredAnnotations).toBe(2);
  });

  it("journalist_without_declared_name_is_ignored_if_not_the_custodian", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const journalist = asJournalist(f, undefined);
    journalist.useNewsroom(ENS);
    await journalist.setStatus(sub.entity, "review");
    expect((await client.listInbox({})).items[0]!.status).toBe("new");
  });
});

describe("7. reply", () => {
  it("encrypts_for_the_tip_mailbox_and_only_the_source_opens_it", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    await client.reply((await client.listInbox({})).items[0]!, "Recebemos. Podemos conversar?");
    const { mailboxId } = await import("@safe-whistle/crypto");
    const rows = await f.relayerStore.getReplies(mailboxId(sub.receipt.mailboxPub));
    expect(rows).toHaveLength(1);
    const { decodeReply } = await import("@safe-whistle/core");
    expect(decodeReply(openReply(rows[0]!.sealed, sub.receipt))).toEqual({ newsroom: ENS.name, text: "Recebemos. Podemos conversar?" });
    expect(rows[0]!.creator.toLowerCase()).toBe(NEWSROOM_ACCOUNT.toLowerCase());
    expect(() => openReply(rows[0]!.sealed, newKeypair() as never)).toThrow();
  });

  it("journalist_reply_carries_the_name_and_the_real_creator", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    const journalist = createNewsroomClient({ ...f.deps, account: JOURNALIST, store: createStore(f.chain.backendFor(JOURNALIST)), authorName: `maria.${ENS.name}` });
    journalist.useNewsroom(ENS);
    await journalist.reply((await client.listInbox({})).items[0]!, "Olá, aqui é a Maria.");
    const { mailboxId } = await import("@safe-whistle/crypto");
    const [row] = await f.relayerStore.getReplies(mailboxId(sub.receipt.mailboxPub));
    expect(row!.creator.toLowerCase()).toBe(JOURNALIST.toLowerCase());
    expect(row!.authorName).toBe(`maria.${ENS.name}`);
  });

  it("empty_reply_is_refused", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    await publishAs(f, client.currentKey());
    await expect(client.reply((await client.listInbox({})).items[0]!, "")).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("8. retention", () => {
  it("lists_tips_near_expiry_and_renews", async () => {
    const f = makeDeps();
    const { client } = await registered(f);
    const sub = await publishAs(f, client.currentKey());
    expect(await client.listExpiring(10 * 24 * 3600)).toHaveLength(0);
    f.chain.advanceSeconds(145 * 24 * 3600);
    const soon = await client.listExpiring(10 * 24 * 3600);
    expect(soon.map((s) => s.key)).toEqual([sub.entity]);
    expect(await client.renew(sub.entity, 150 * 24 * 3600)).toBe("extended");
    expect(await client.listExpiring(10 * 24 * 3600)).toHaveLength(0);
  });
});

describe("check against ENS", () => {
  it("checks_whether_the_published_key_is_the_device_one", async () => {
    const { f, client } = await registered();
    const k = client.currentKey();
    f.reader.resolveNewsroom.mockResolvedValueOnce({ pubkeyVersion: 1, publicKey: k.publicKey } as never);
    expect(await client.verifyPublished()).toEqual({ ok: true, onChainVersion: 1 });
    f.reader.resolveNewsroom.mockResolvedValueOnce({ pubkeyVersion: 2, publicKey: k.publicKey } as never);
    expect((await client.verifyPublished()).ok).toBe(false);
    f.reader.resolveNewsroom.mockResolvedValueOnce({ pubkeyVersion: 1, publicKey: newKeypair().publicKey } as never);
    expect((await client.verifyPublished()).ok).toBe(false);
  });
});
