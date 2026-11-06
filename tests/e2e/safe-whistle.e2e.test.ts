// End-to-end use cases, without a browser: ENS (Sepolia fork) + Arkiv (local node) + real relayer with simulated World.
import { toBase64Url } from "@safe-whistle/core";
import { encodeReply } from "@safe-whistle/core";
import { mailboxId, newKeypair, sealReply } from "@safe-whistle/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARKIV, FORK, RELAYER_URL, arkivStore, newsroomSide, sleep, sourceSide, startWorld, type World } from "./world.ts";

let w: World;
let journalist: ReturnType<typeof newsroomSide>;
let reader: ReturnType<ReturnType<typeof newsroomSide>["client"]["newReaderKey"]>;
const SEGREDO = "DENUNCIA-FICTICIA-E2E-contrato-superfaturado-7731";
const secrets: Uint8Array[] = []; // bytes that must never appear in requests
let receiptAna: Awaited<ReturnType<ReturnType<typeof sourceSide>["client"]["submit"]>>["receipt"];
const ana = sourceSide("ana");
const sources = [ana];

beforeAll(async () => {
  w = await startWorld();
  journalist = newsroomSide(w.journalist, false, `maria.${w.ens.name}`);
}, 400_000);

afterAll(async () => {
  await w?.stop();
});

describe("UC-01 to UC-03: the administrator registers the newsroom and the journalist", () => {
  it("registers_the_newsroom_reporting_the_commit_wait", () => {
    expect(w.ens.name).toMatch(/\.eth$/);
    expect(w.steps).toEqual(["resolver", "commit", "commit_wait", "register", "records", "registry", "done"]);
  });

  it("the_public_key_and_policy_are_in_ens", async () => {
    const info = await ana.client.lookupNewsroom(w.ens.name);
    expect(info.pubkeyVersion).toBe(1);
    expect(info.publicKey).toEqual(w.admin.client.currentKey().publicKey);
    expect(info.policy.categories).toEqual(["saude", "corrupcao"]);
    expect(info.custodian.toLowerCase()).toBe(w.owner.address.toLowerCase());
  });

  it("registers_the_journalist_and_delivers_the_keyring_encrypted_for_his_key", async () => {
    reader = journalist.client.newReaderKey();
    await w.admin.client.addJournalist({ label: "maria", address: w.journalist.address, readerPublicKey: reader.publicKey });
    const real = ana.real as unknown as { isActiveJournalist(n: string): Promise<boolean> };
    expect(await real.isActiveJournalist(`maria.${w.ens.name}`)).toBe(true);
    journalist.client.importSharedKeyring(w.admin.client.shareKeyring(reader.publicKey), reader);
    expect(journalist.client.newsroom()?.name).toBe(w.ens.name);
    expect(journalist.client.keyVersions()).toEqual([1]);
  });

  it("another_person_cannot_open_the_keyring", () => {
    const outsider = newsroomSide(w.journalist, false);
    expect(() => outsider.client.importSharedKeyring(w.admin.client.shareKeyring(newKeypair().publicKey), newKeypair())).toThrow();
  });
});

describe("UC-05 and UC-06: the source queries, submits and receives the receipt", () => {
  it("submits_the_tip_and_receives_the_receipt", async () => {
    const r = await ana.client.submit({ newsroom: w.ens.name, category: "saude", text: SEGREDO });
    receiptAna = r.receipt;
    secrets.push(r.receipt.salt, r.receipt.mailboxPriv);
    expect(r.receipt.newsroom).toBe(w.ens.name);
    expect(r.receipt.key).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("the_tip_appears_in_the_newsroom_inbox", async () => {
    const { items } = await w.admin.client.listInbox({});
    expect(items.map((i) => i.key)).toContain(receiptAna.key);
  });
});

describe("UC-07 and UC-08: the journalist lists, decrypts and classifies", () => {
  it("lists_and_decrypts_with_the_received_keyring", async () => {
    const { items } = await journalist.client.listInbox({});
    const item = items.find((i) => i.key === receiptAna.key)!;
    expect(item.status).toBe("new");
    expect((await journalist.client.decrypt(item)).text).toBe(SEGREDO);
  });

  it("classifies_without_changing_the_envelope", async () => {
    const before = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    await journalist.client.setStatus(receiptAna.key as `0x${string}`, "review");
    const after = (await journalist.client.listInbox({ status: "review" })).items.find((i) => i.key === receiptAna.key)!;
    expect(after.status).toBe("review");
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.envelope).toEqual(before.envelope);
  });
});

describe("UC-09 and UC-10: the journalist replies and the source reads with the receipt", () => {
  it("the_source_reads_the_reply_and_only_her", async () => {
    const item = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    await journalist.client.reply(item, "Recebemos. Podemos falar por este canal?");
    const mine = await ana.client.readReplies(receiptAna);
    expect(mine.replies.map((r) => [r.author, r.text])).toEqual([[`maria.${w.ens.name}`, "Recebemos. Podemos falar por este canal?"]]);
    expect(mine.ignored).toBe(0);
    const other = sourceSide("bia");
    const bia = await other.client.submit({ newsroom: w.ens.name, category: "corrupcao", text: "outra denúncia" });
    sources.push(other);
    secrets.push(bia.receipt.salt, bia.receipt.mailboxPriv);
    expect(await other.client.readReplies(bia.receipt)).toEqual({ replies: [], ignored: 0 });
  });
});

describe("UC-11 and UC-12: hash and date verification and proof of authorship", () => {
  it("checks_the_hash_and_date_of_the_published_file", async () => {
    const item = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    const r = await ana.client.verifyDocument({ newsroom: w.ens.name, envelope: item.envelope });
    expect(r).toMatchObject({ hashMatches: true, found: true, contentHash: receiptAna.contentHash });
    expect(r.createdAtBlock).toBeGreaterThan(0n);
  });

  it("proves_authorship_with_text_and_salt_and_rejects_the_wrong_text", async () => {
    const item = (await journalist.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    expect(ana.client.proveAuthorship({ envelope: item.envelope, text: SEGREDO, salt: receiptAna.salt })).toBe(true);
    expect(ana.client.proveAuthorship({ envelope: item.envelope, text: "texto diferente", salt: receiptAna.salt })).toBe(false);
  });
});

describe("Phase 13: notes and replies only count if they come from the newsroom", () => {
  const maria = () => `maria.${w.ens.name}`;
  const statusOfAna = async () => (await w.admin.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!.status;

  it("a_stranger_wallet_cannot_change_the_status_or_deceive_the_panel", async () => {
    expect(await statusOfAna()).toBe("review");
    await arkivStore(w.stranger.key).annotate({ newsroom: w.ens.name, denunciaKey: receiptAna.key as `0x${string}`, status: "discarded", journalist: w.journalist.address, authorName: maria() });
    expect(await statusOfAna()).toBe("review");
    expect((await w.admin.client.listInbox({})).ignoredAnnotations).toBeGreaterThanOrEqual(1);
  });

  it("a_forged_reply_correctly_encrypted_for_the_source_is_ignored", async () => {
    const forged = sealReply(receiptAna.mailboxPub, encodeReply({ newsroom: w.ens.name, text: "Mande seus documentos para este e-mail." }));
    await arkivStore(w.stranger.key).publishReply({ newsroom: w.ens.name, mailboxId: mailboxId(receiptAna.mailboxPub), sealed: forged, retentionSeconds: 3600, authorName: maria() });
    const r = await ana.client.readReplies(receiptAna);
    expect(r.replies.map((x) => x.text)).toEqual(["Recebemos. Podemos falar por este canal?"]);
    expect(r.ignored).toBe(1);
  });

  it("after_revoking_the_journalist_what_he_did_stops_counting", async () => {
    expect((await w.admin.client.revokeJournalist("maria")).rotateRecommended).toBe(true);
    expect(await statusOfAna()).toBe("new");
    const r = await ana.client.readReplies(receiptAna);
    expect(r.replies).toEqual([]);
    expect(r.ignored).toBe(2);
  });

  it("the_administrator_still_counts_after_revocation", async () => {
    await w.admin.client.setStatus(receiptAna.key as `0x${string}`, "verified");
    expect(await statusOfAna()).toBe("verified");
    const item = (await w.admin.client.listInbox({})).items.find((i) => i.key === receiptAna.key)!;
    await w.admin.client.reply(item, "Resposta oficial da redação.");
    expect((await ana.client.readReplies(receiptAna)).replies.map((x) => [x.author, x.text])).toEqual([[w.ens.name, "Resposta oficial da redação."]]);
  });
});

describe("limit per person, newsroom and epoch", () => {
  it("the_second_submission_from_the_same_person_is_refused", async () => {
    await expect(ana.client.submit({ newsroom: w.ens.name, category: "saude", text: "de novo" })).rejects.toMatchObject({ code: "limit_reached" });
  });
});

describe("key rotation during submission", () => {
  it("re_encrypts_and_the_journalist_decrypts_both_versions", async () => {
    const dani = sourceSide("dani");
    sources.push(dani);
    const old = await dani.real.resolveNewsroom(w.ens.name);
    expect(await w.admin.client.rotateKey()).toBe(2);
    dani.useStaleOnce(old); // the source still "remembers" key v1
    const r = await dani.client.submit({ newsroom: w.ens.name, category: "saude", text: "enviada durante a rotação" });
    secrets.push(r.receipt.salt, r.receipt.mailboxPriv);

    const item = (await w.admin.client.listInbox({})).items.find((i) => i.key === r.receipt.key)!;
    expect(item.pubkeyVersion).toBe(2);

    journalist.client.importSharedKeyring(w.admin.client.shareKeyring(reader.publicKey), reader);
    expect(journalist.client.keyVersions()).toEqual([1, 2]);
    const all = (await journalist.client.listInbox({})).items;
    const texts = await Promise.all(all.map(async (i) => (await journalist.client.decrypt(i)).text));
    expect(texts).toContain(SEGREDO);
    expect(texts).toContain("enviada durante a rotação");
  });
});

describe("retention", () => {
  it("the_renewed_tip_remains_and_the_unrenewed_one_disappears", async () => {
    const mk = async (hash: string) =>
      (await w.relayerStore.publishSubmission({ newsroom: w.ens.name, category: "expira", epoch: 202611, contentHash: hash, pubkeyVersion: 1, envelope: new Uint8Array(200).fill(7), custodian: w.owner.address, retentionSeconds: 30 })).key;
    const keep = await mk("0x" + "aa".repeat(32));
    await mk("0x" + "bb".repeat(32));
    expect((await w.admin.client.listInbox({ category: "expira" })).items).toHaveLength(2);
    expect(await w.admin.client.renew(keep, 3600)).toBe("extended");
    await sleep(45_000);
    const left = (await w.admin.client.listInbox({ category: "expira" })).items;
    expect(left.map((i) => i.key)).toEqual([keep]);
  });
});

describe("RNF-01 privacy", () => {
  it("no_request_carries_original_text_receipt_salt_or_newsroom_private_key", () => {
    const privateKeys = w.admin.client.exportKeyringForTest().keys.flatMap((k) => [k.privateKey]);
    const all = [...sources.map((s) => s.recorder), journalist.recorder, w.admin.recorder];
    for (const rec of all) {
      expect(rec.anyBodyContains(SEGREDO)).toBe(false);
      expect(rec.anyBodyContains("outra denúncia")).toBe(false);
      for (const s of [...secrets, ...privateKeys]) {
        expect(rec.anyBodyContainsBytes(s)).toBe(false);
        expect(rec.anyBodyContains(toBase64Url(s))).toBe(false);
        expect(rec.anyBodyContains(Buffer.from(s).toString("hex"))).toBe(false);
      }
    }
  });

  it("the_relayer_log_has_no_text_ip_or_identifiers", () => {
    const text = w.logs.join("");
    expect(text.length).toBeGreaterThan(0);
    for (const leak of [SEGREDO, "outra denúncia", "nullifier"]) expect(text).not.toContain(leak);
    expect(text).not.toMatch(/\b\d{1,3}(\.\d{1,3}){3}\b/);
    expect(text).not.toMatch(/\bproof\b/i);
  });
});

describe("RNF-04 and RNF-05 network", () => {
  it("only_declared_hosts_were_contacted_and_only_localhost", () => {
    const all = [...sources.map((s) => s.recorder), journalist.recorder, w.admin.recorder];
    const hosts = new Set(all.flatMap((r) => r.hosts()));
    expect([...hosts]).toEqual(["127.0.0.1"]);
    expect([FORK, ARKIV, RELAYER_URL].every((u) => u.startsWith("http://127.0.0.1"))).toBe(true);
  });
});

