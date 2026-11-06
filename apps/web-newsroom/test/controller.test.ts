import { NewsroomError } from "@safe-whistle/newsroom-client";
import { describe, expect, it, vi } from "vitest";
import { createPanelController } from "../src/controller.ts";

const ITEM = { key: "0x01", category: "saude", status: "new", epoch: 202611, pubkeyVersion: 1, envelope: new Uint8Array([1]), contentHash: "0xaa" };
const ENS = { name: "investiga.eth", label: "investiga", resolver: "0x1", subRegistry: "0x2" };

function make(over: Record<string, any> = {}, role: "admin" | "journalist" | "visitor" = "admin") {
  const client = {
    newsroom: vi.fn(() => undefined as any),
    keyVersions: vi.fn(() => [1]),
    updatePolicy: vi.fn(async (_p: any) => {}),
    newReaderKey: vi.fn(() => ({ publicKey: new Uint8Array([1]), privateKey: new Uint8Array([2]) })),
    shareKeyring: vi.fn((_k: Uint8Array) => "SHARED"),
    importSharedKeyring: vi.fn((_b: string, _r: any) => {}),
    currentKey: vi.fn(() => ({ version: 1, publicKey: new Uint8Array(32) })),
    registerNewsroom: vi.fn(async (a: any) => { a.onProgress?.({ step: "commit_wait", seconds: 65 }); a.onProgress?.({ step: "done" }); return ENS; }),
    rotateKey: vi.fn(async () => 2),
    exportBackup: vi.fn(async (_p: string) => "BLOB"),
    importBackup: vi.fn(async (_b: string, _p: string) => {}),
    listInbox: vi.fn(async (_q: any) => ({ items: [ITEM], hasMore: false, skippedIncomplete: 0, ignoredAnnotations: 0 })),
    decrypt: vi.fn(async (_i: any) => ({ text: "olá", category: "saude", epoch: 202611, key: "0x01" })),
    statusOf: vi.fn(async (_k: string) => "new"),
    setStatus: vi.fn(async (_k: string, _s: string) => {}),
    reply: vi.fn(async (_i: any, _t: string) => {}),
    addJournalist: vi.fn(async (_a: any) => {}),
    revokeJournalist: vi.fn(async (_l: string) => ({ rotateRecommended: true as const })),
    listExpiring: vi.fn(async (_w: number) => [ITEM]),
    renew: vi.fn(async (_k: string, _r: number) => "extended" as const),
    ...over,
  };
  return { c: createPanelController(client as never, { role }), client };
}

describe("registration and keys", () => {
  it("shows_the_registration_progress_and_ends_with_the_newsroom_and_the_version", async () => {
    const { c } = make();
    const seen: string[] = [];
    c.subscribe((s) => s.progress && seen.push(s.progress.step));
    await c.register({ label: "investiga", categories: ["saude"], maxBytes: 50_000, attachments: false });
    expect(seen).toContain("commit_wait");
    expect(c.state).toMatchObject({ busy: false, newsroom: { name: "investiga.eth" }, keyVersion: 1, progress: undefined });
  });

  it("passes_the_policy_to_the_client", async () => {
    const { c, client } = make();
    await c.register({ label: "investiga", categories: ["saude", "corrupcao"], maxBytes: 50_000, attachments: true });
    expect(client.registerNewsroom).toHaveBeenCalledWith(expect.objectContaining({ label: "investiga", policy: { categories: ["saude", "corrupcao"], maxBytes: 50_000, attachments: true, epoch: "monthly" } }));
  });

  it("client_error_appears_with_the_cause", async () => {
    const { c } = make({ registerNewsroom: vi.fn(async () => { throw new NewsroomError("invalid_input", "The policy needs at least one category."); }) });
    await c.register({ label: "x", categories: [], maxBytes: 1, attachments: false });
    expect(c.state.error).toEqual({ code: "invalid_input", message: "The policy needs at least one category." });
    expect(c.state.busy).toBe(false);
  });

  it("unexpected_error_becomes_a_generic_message_without_details", async () => {
    const { c } = make({ rotateKey: vi.fn(async () => { throw new Error("rpc 10.0.0.1 went down"); }) });
    await c.rotate();
    expect(c.state.error?.message).not.toContain("10.0.0.1");
    expect(c.state.error?.code).toBe("unexpected");
  });

  it("rotates_and_updates_the_version", async () => {
    const { c } = make();
    await c.rotate();
    expect(c.state.keyVersion).toBe(2);
    expect(c.state.notice).toMatch(/version 2/);
  });

  it("exports_the_backup_and_imports_updating_the_newsroom", async () => {
    const { c, client } = make();
    await c.exportBackup("senha-forte-123");
    expect(c.state.backupText).toBe("BLOB");
    client.newsroom.mockReturnValue(ENS);
    await c.importBackup("BLOB", "senha-forte-123");
    expect(c.state).toMatchObject({ newsroom: { name: "investiga.eth" }, keyVersion: 1 });
  });

  it("wrong_password_on_import_shows_the_error", async () => {
    const { c } = make({ importBackup: vi.fn(async () => { throw new NewsroomError("wrong_password", "Incorrect password or tampered backup."); }) });
    await c.importBackup("BLOB", "errada-errada");
    expect(c.state.error?.code).toBe("wrong_password");
  });
});

describe("inbox", () => {
  it("loads_the_list_with_the_filters", async () => {
    const { c, client } = make();
    await c.loadInbox({ status: "new", category: "saude" });
    expect(client.listInbox).toHaveBeenCalledWith(expect.objectContaining({ status: "new", category: "saude" }));
    expect(c.state.inbox?.items).toHaveLength(1);
  });

  it("opening_decrypts_locally_and_shows_the_status", async () => {
    const { c } = make();
    await c.loadInbox({});
    await c.open("0x01");
    expect(c.state.opened).toMatchObject({ text: "olá", status: "new", key: "0x01" });
    expect(c.state.opened?.envelope).toEqual(new Uint8Array([1]));
  });

  it("missing_key_shows_the_cause_and_does_not_open", async () => {
    const { c } = make({ decrypt: vi.fn(async () => { throw new NewsroomError("missing_key", "The key for version 1 is missing."); }) });
    await c.loadInbox({});
    await c.open("0x01");
    expect(c.state.opened).toBeUndefined();
    expect(c.state.error?.code).toBe("missing_key");
  });

  it("opening_an_item_that_is_not_in_the_list_is_ignored", async () => {
    const { c, client } = make();
    await c.open("0xff");
    expect(client.decrypt).not.toHaveBeenCalled();
  });

  it("changing_the_status_records_a_note_and_updates_the_screen", async () => {
    const { c, client } = make();
    await c.loadInbox({});
    await c.open("0x01");
    client.statusOf.mockResolvedValue("review");
    await c.setStatus("0x01", "review");
    expect(client.setStatus).toHaveBeenCalledWith("0x01", "review");
    expect(c.state.opened?.status).toBe("review");
  });

  it("replying_sends_to_the_mailbox_and_notifies", async () => {
    const { c, client } = make();
    await c.loadInbox({});
    await c.reply("0x01", "Recebemos.");
    expect(client.reply).toHaveBeenCalledWith(ITEM, "Recebemos.");
    expect(c.state.notice).toMatch(/reply sent/i);
  });
});

describe("journalist reader keys", () => {
  it("generates_the_pair_in_base64url_for_the_journalist_to_keep", () => {
    const { c } = make();
    expect(c.newReaderKey()).toEqual({ publicKey: "AQ", privateKey: "Ag" });
  });

  it("shares_the_keyring_for_the_given_public_key", async () => {
    const { c, client } = make();
    await c.shareKeyring("AQ");
    expect(client.shareKeyring).toHaveBeenCalledWith(new Uint8Array([1]));
    expect(c.state.sharedText).toBe("SHARED");
  });

  it("imports_the_keyring_and_updates_the_newsroom", async () => {
    const { c, client } = make();
    client.newsroom.mockReturnValue(ENS);
    await c.importShared("SHARED", { publicKey: "AQ", privateKey: "Ag" });
    expect(c.state).toMatchObject({ newsroom: { name: "investiga.eth" }, keyVersion: 1 });
  });

  it("keyring_for_another_key_shows_the_error", async () => {
    const { c } = make({ importSharedKeyring: vi.fn(() => { throw new NewsroomError("cannot_decrypt", "This keyring was not encrypted for your reader key."); }) });
    await c.importShared("SHARED", { publicKey: "AQ", privateKey: "Ag" });
    expect(c.state.error?.code).toBe("cannot_decrypt");
  });
});

describe("team and retention", () => {
  it("registers_journalist", async () => {
    const { c, client } = make();
    const pub = new Uint8Array(32).fill(3);
    await c.addJournalist({ label: "maria", address: "0xa63A63047e362EE0B8af09489DCA1dc172E507ca", readerPublicKey: pub });
    expect(client.addJournalist).toHaveBeenCalledWith({ label: "maria", address: "0xa63A63047e362EE0B8af09489DCA1dc172E507ca", readerPublicKey: pub });
    expect(c.state.notice).toMatch(/maria/);
  });

  it("revoking_warns_to_rotate_the_key", async () => {
    const { c } = make();
    await c.revokeJournalist("maria");
    expect(c.state.notice).toMatch(/rotate the key/i);
  });

  it("lists_what_expires_and_renews_everything", async () => {
    const { c, client } = make();
    await c.loadExpiring(30 * 24 * 3600);
    expect(c.state.expiring).toHaveLength(1);
    await c.renewAll(150 * 24 * 3600);
    expect(client.renew).toHaveBeenCalledWith("0x01", 150 * 24 * 3600);
    expect(c.state.notice).toMatch(/1 tip/);
  });
});

describe("roles: the rule holds in the code", () => {
  const forbidden = (c: ReturnType<typeof make>["c"]) => expect(c.state.error?.code).toBe("forbidden");

  it("journalist_does_not_administer_the_newsroom", async () => {
    const { c, client } = make({}, "journalist");
    await c.rotate(); forbidden(c);
    await c.exportBackup("senha-forte-123"); forbidden(c);
    await c.importBackup("B", "senha-forte-123"); forbidden(c);
    await c.addJournalist({ label: "x", address: "0xa63A63047e362EE0B8af09489DCA1dc172E507ca", readerPublicKey: new Uint8Array(32) }); forbidden(c);
    await c.revokeJournalist("x"); forbidden(c);
    await c.shareKeyring("AQ"); forbidden(c);
    await c.updatePolicy({ categories: ["a"], maxBytes: 1, attachments: false, epoch: "monthly" }); forbidden(c);
    await c.register({ label: "x", categories: ["a"], maxBytes: 1, attachments: false }); forbidden(c);
    for (const fn of [client.rotateKey, client.exportBackup, client.importBackup, client.addJournalist, client.revokeJournalist, client.shareKeyring, client.updatePolicy, client.registerNewsroom]) expect(fn).not.toHaveBeenCalled();
  });

  it("journalist_works_the_inbox", async () => {
    const { c, client } = make({}, "journalist");
    await c.loadInbox({});
    await c.open("0x01");
    await c.setStatus("0x01", "review");
    await c.reply("0x01", "oi");
    await c.loadExpiring(1);
    expect(c.state.error).toBeUndefined();
    expect(client.reply).toHaveBeenCalled();
    expect(c.newReaderKey()).toEqual({ publicKey: "AQ", privateKey: "Ag" });
    await c.importShared("S", { publicKey: "AQ", privateKey: "Ag" });
    expect(c.state.error).toBeUndefined();
  });

  it("visitor_can_only_register_the_newsroom", async () => {
    const { c, client } = make({}, "visitor");
    await c.loadInbox({}); forbidden(c);
    await c.open("0x01");
    expect(client.listInbox).not.toHaveBeenCalled();
    expect(c.newReaderKey()).toBeUndefined();
    await c.register({ label: "nova", categories: ["a"], maxBytes: 10, attachments: false });
    expect(client.registerNewsroom).toHaveBeenCalled();
  });

  it("with_no_defined_role_nothing_is_allowed", async () => {
    const c = createPanelController(make().client as never);
    await c.loadInbox({});
    forbidden(c);
  });

  it("changing_the_role_applies_to_the_next_actions", async () => {
    const { c } = make({}, "visitor");
    await c.loadInbox({});
    forbidden(c);
    c.setRole("journalist");
    await c.loadInbox({});
    expect(c.state.error).toBeUndefined();
  });
});

describe("progress, transactions and alerts", () => {
  it("counts_the_registration_transactions_and_keeps_the_links", async () => {
    const { c } = make();
    c.addTx({ hash: "0x" + "01".repeat(32) as `0x${string}`, chainId: "0xaa36a7" });
    c.addTx({ hash: "0x" + "02".repeat(32) as `0x${string}`, chainId: "0xaa36a7" });
    expect(c.state.txCount).toBe(2);
    expect(c.state.txs.map((t) => t.hash.slice(2, 4))).toEqual(["01", "02"]);
  });

  it("the_registration_resets_the_counter_at_the_start", async () => {
    const { c } = make();
    c.addTx({ hash: ("0x" + "01".repeat(32)) as `0x${string}`, chainId: "0xaa36a7" });
    await c.register({ label: "investiga", categories: ["saude"], maxBytes: 1000, attachments: false });
    expect(c.state.txCount).toBe(0);
  });

  it("reports_ignored_notes_in_the_inbox", async () => {
    const { c } = make({ listInbox: vi.fn(async () => ({ items: [ITEM], hasMore: false, skippedIncomplete: 0, ignoredAnnotations: 3 })) });
    await c.loadInbox({});
    expect(c.state.ignoredAnnotations).toBe(3);
  });

  it("marks_the_backup_as_done_and_rotating_the_key_undoes_that", async () => {
    const { c } = make();
    await c.exportBackup("senha-forte-123");
    expect(c.state.backupDone).toBe(true);
    await c.rotate();
    expect(c.state.backupDone).toBe(false);
  });

  it("publishes_the_policy", async () => {
    const { c, client } = make();
    const p = { categories: ["saude"], maxBytes: 5000, attachments: true, epoch: "monthly" as const };
    await c.updatePolicy(p);
    expect(client.updatePolicy).toHaveBeenCalledWith(p);
    expect(c.state.notice).toMatch(/policy/i);
  });

  it("records_whether_the_keys_are_loaded_after_importing", async () => {
    const { c, client } = make();
    client.newsroom.mockReturnValue(ENS);
    await c.importBackup("B", "senha-forte-123");
    expect(c.state.keysLoaded).toBe(true);
  });
});

describe("the backup does not depend on other slow operations", () => {
  it("loading_the_inbox_does_not_mark_the_panel_as_busy", async () => {
    let release!: () => void;
    const slow = new Promise<void>((r) => (release = r));
    const { c } = make({ listInbox: vi.fn(async () => { await slow; return { items: [], hasMore: false, skippedIncomplete: 0, ignoredAnnotations: 0 }; }) });
    const pending = c.loadInbox({});
    expect(c.state.loading).toBe(true);
    expect(c.state.busy).toBe(false);
    await c.exportBackup("senha-forte-123"); // while the slow read is still running
    expect(c.state.backupText).toBe("BLOB");
    expect(c.state.error).toBeUndefined();
    release();
    await pending;
    expect(c.state.loading).toBe(false);
  });

  it("checking_what_expires_also_does_not_block_and_errors_appear", async () => {
    const { c } = make({ listExpiring: vi.fn(async () => { throw new Error("rpc"); }) });
    await c.loadExpiring(1);
    expect(c.state.loading).toBe(false);
    expect(c.state.error?.code).toBe("unexpected");
  });

  it("generating_the_backup_warns_what_to_do_next", async () => {
    const { c } = make();
    await c.exportBackup("senha-forte-123");
    expect(c.state.notice).toMatch(/download/i);
  });
});
