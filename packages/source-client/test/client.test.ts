import { actionFor, decodePayload, encodeReply, fromBase64Url, toBase64Url } from "@safe-whistle/core";
import { mailboxId, sealReply } from "@safe-whistle/crypto";
import { describe, expect, it } from "vitest";
import { ProofError, SourceError, createSourceClient, parseReceipt, serializeReceipt } from "../src/index.ts";
import { CUSTODIAN, EPOCH, MARIA_ADDR, NEWSROOM, SECRET, STRANGER, info, makeDeps, makeRelayer, openSent } from "./helpers.ts";

const clientOf = (f = makeDeps()) => ({ f, client: createSourceClient(f.deps) });
const send = (client: ReturnType<typeof createSourceClient>, over: Record<string, unknown> = {}) =>
  client.submit({ newsroom: NEWSROOM, category: "saude", text: SECRET, ...over } as never);
const textSent = (body: Record<string, any>) => decodePayload(openSent(body).plaintext).text;

describe("1. lookup", () => {
  it("resolves_name_and_returns_key_version_and_policy", async () => {
    const { client } = clientOf();
    const r = await client.lookupNewsroom(NEWSROOM);
    expect(r).toMatchObject({ name: NEWSROOM, pubkeyVersion: 2, policy: { categories: ["saude", "corrupcao"] } });
  });

  it("nonexistent_name_produces_a_clear_error", async () => {
    const { client } = clientOf();
    await expect(client.lookupNewsroom("nada.eth")).rejects.toMatchObject({ code: "newsroom_not_found" });
  });

  it("malformed_name_is_refused_before_querying", async () => {
    const f = makeDeps();
    await expect(createSourceClient(f.deps).lookupNewsroom("Invalida")).rejects.toMatchObject({ code: "invalid_newsroom" });
    expect(f.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("invalid_records_in_ens_become_newsroom_configuration_error", async () => {
    const f = makeDeps();
    const { RecordsError } = await import("@safe-whistle/ens-client");
    f.resolveNewsroom.mockRejectedValueOnce(new RecordsError("pubkey", "Missing the key."));
    await expect(createSourceClient(f.deps).lookupNewsroom(NEWSROOM)).rejects.toMatchObject({ code: "newsroom_misconfigured" });
  });
});

describe("2. assembly", () => {
  it("only_accepts_category_from_the_policy", async () => {
    const { client, f } = clientOf();
    await expect(send(client, { category: "obras" })).rejects.toMatchObject({ code: "category_not_allowed" });
    expect(f.proofProvider).not.toHaveBeenCalled();
  });

  it("refuses_text_over_the_size_and_empty", async () => {
    const { client } = clientOf();
    await expect(send(client, { text: "x".repeat(20_000) })).rejects.toMatchObject({ code: "too_large" });
    await expect(send(client, { text: "" })).rejects.toMatchObject({ code: "invalid_size" });
  });

  it("refuses_attachment_when_the_policy_does_not_accept_it", async () => {
    const { client } = clientOf();
    await expect(send(client, { attachment: { name: "a.pdf", data: new Uint8Array([1]) } })).rejects.toMatchObject({ code: "attachments_not_allowed" });
  });

  it("attachment_goes_inside_the_encrypted_content_when_accepted", async () => {
    const f = makeDeps();
    f.resolveNewsroom.mockResolvedValue(info({ policy: { categories: ["saude"], maxBytes: 100_000, attachments: true, epoch: "monthly" } }));
    const data = new Uint8Array(500).fill(9);
    await createSourceClient(f.deps).submit({ newsroom: NEWSROOM, category: "saude", text: "oi", attachment: { name: "p.bin", data } });
    const body = f.relayer.received[0]!;
    expect(body.hasAttachment).toBe(true);
    expect(decodePayload(openSent(body).plaintext).attachment?.name).toBe("p.bin");
  });
});

describe("3. submission", () => {
  it("encrypts_before_sending_and_the_body_does_not_contain_the_original_text", async () => {
    const { client, f } = clientOf();
    await send(client);
    expect(f.recorder.anyBodyContains(SECRET)).toBe(false);
    expect(f.relayer.received).toHaveLength(1);
    expect(textSent(f.relayer.received[0]!)).toBe(SECRET);
  });

  it("does_not_send_the_private_key_nor_the_salt", async () => {
    const { client, f } = clientOf();
    const { receipt } = await send(client);
    for (const secret of [receipt.salt, receipt.mailboxPriv]) {
      expect(f.recorder.anyBodyContainsBytes(secret)).toBe(false);
      expect(f.recorder.anyBodyContains(toBase64Url(secret))).toBe(false);
    }
  });

  it("requests_the_proof_with_the_newsroom_and_epoch_action", async () => {
    const { client, f } = clientOf();
    await send(client);
    expect(f.proofProvider).toHaveBeenCalledWith(expect.objectContaining({ action: actionFor(NEWSROOM, EPOCH), appId: "app_test", environment: "staging" }));
    expect(f.relayer.received[0]).toMatchObject({ newsroom: NEWSROOM, epoch: EPOCH, category: "saude", hasAttachment: false });
  });

  it("refuses_action_different_from_the_expected_one_from_the_relayer", async () => {
    const f = makeDeps({ fetch: async () => new Response(JSON.stringify({ app_id: "app_test", environment: "staging", epoch: EPOCH, action: "submit:outra.eth:1", rp_context: {} }), { status: 200 }) });
    await expect(createSourceClient(f.deps).submit({ newsroom: NEWSROOM, category: "saude", text: "x" })).rejects.toMatchObject({ code: "unexpected_response" });
  });

  it.each([["denied", "proof_denied"], ["expired", "proof_expired"], ["cancelled", "proof_cancelled"]] as const)("does_not_submit_if_the_proof_is_%s", async (reason, code) => {
    const f = makeDeps();
    f.proofProvider.mockRejectedValueOnce(new ProofError(reason));
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code });
    expect(f.relayer.received).toHaveLength(0);
  });

  it("re-encrypts_when_the_relayer_says_the_version_is_outdated_reusing_the_proof", async () => {
    let calls = 0;
    const relayer = makeRelayer({ submit: () => (calls++ === 0 ? { status: 409, json: { error: { code: "stale_key_version", message: "x", currentVersion: 3 } } } : { status: 201, json: { key: "0x" + "02".repeat(32), parts: 1 } }) });
    const f = makeDeps({ fetch: relayer.fetch });
    f.resolveNewsroom.mockResolvedValueOnce(info({ pubkeyVersion: 2 })).mockResolvedValue(info({ pubkeyVersion: 3 }));
    const { receipt } = await send(createSourceClient(f.deps));
    expect(relayer.received).toHaveLength(2);
    expect(openSent(relayer.received[0]!).env.pubkeyVersion).toBe(2);
    expect(openSent(relayer.received[1]!).env.pubkeyVersion).toBe(3);
    expect(f.proofProvider).toHaveBeenCalledTimes(1);
    expect(receipt.contentHash).toBe(openSent(relayer.received[1]!).env.contentHash);
  });

  it("gives_up_after_one_new_version_attempt", async () => {
    const f = makeDeps({ fetch: makeRelayer({ submit: () => ({ status: 409, json: { error: { code: "stale_key_version", message: "x", currentVersion: 9 } } }) }).fetch });
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code: "stale_key_version" });
  });

  it("translates_relayer_errors_into_readable_causes", async () => {
    const table: [number, string, string, RegExp][] = [
      [409, "limit_reached", "limit_reached", /already submitted/i],
      [409, "epoch_mismatch", "epoch_mismatch", /month/i],
      [403, "proof_rejected", "proof_rejected", /proof/i],
      [502, "publish_failed", "publish_failed", /try again/i],
      [413, "body_too_large", "too_large", /too large/i],
    ];
    for (const [status, relayerCode, code, text] of table) {
      const f = makeDeps({ fetch: makeRelayer({ submit: () => ({ status, json: { error: { code: relayerCode, message: "m" } } }) }).fetch });
      const err = await send(createSourceClient(f.deps)).catch((e) => e);
      expect(err).toBeInstanceOf(SourceError);
      expect(err.code, relayerCode).toBe(code);
      expect(err.message, relayerCode).toMatch(text);
    }
  });

  it("network_failure_becomes_network_error", async () => {
    const f = makeDeps({ fetch: async () => { throw new TypeError("fetch failed"); } });
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code: "network" });
  });

  it("non_json_relayer_response_becomes_unexpected_error", async () => {
    const f = makeDeps({ fetch: async (input) => (String(input).includes("rp-context") ? new Response(JSON.stringify({ app_id: "app_test", environment: "staging", epoch: EPOCH, action: actionFor(NEWSROOM, EPOCH), rp_context: {} })) : new Response("<html>", { status: 502 })) });
    await expect(send(createSourceClient(f.deps))).rejects.toMatchObject({ code: "unexpected_response" });
  });
});

describe("4. receipt", () => {
  it("serializes_and_restores_the_receipt", async () => {
    const { client } = clientOf();
    const { receipt } = await send(client);
    const back = parseReceipt(serializeReceipt(receipt));
    expect(back).toEqual(receipt);
    expect(back.newsroom).toBe(NEWSROOM);
    expect(back.key).toBe("0x" + "01".repeat(32));
  });

  it("invalid_receipt_is_refused", () => {
    expect(() => parseReceipt("nao json")).toThrow(SourceError);
    expect(() => parseReceipt(JSON.stringify({ v: 1 }))).toThrow(SourceError);
  });

  it("without_a_receipt_does_not_open_replies", async () => {
    const { client } = clientOf();
    await expect(client.readReplies(undefined as never)).rejects.toMatchObject({ code: "invalid_receipt" });
  });
});

describe("5. replies (only the authenticated ones)", () => {
  const reply = (receipt: { mailboxPub: Uint8Array }, text: string, newsroom = NEWSROOM) => sealReply(receipt.mailboxPub, encodeReply({ newsroom, text }));
  const row = (sealed: Uint8Array, over: Record<string, unknown> = {}) => ({ key: "0x05" as `0x${string}`, newsroom: NEWSROOM, sealed, createdAtBlock: 10n, creator: CUSTODIAN, ...over });
  const setup = async () => {
    const f = makeDeps();
    const { receipt } = await send(createSourceClient(f.deps));
    return { f, receipt, client: createSourceClient(f.deps) };
  };

  it("queries_by_mailbox_and_decrypts_the_administrator_reply", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "Recebemos."))]);
    const out = await client.readReplies(receipt);
    expect(f.getReplies).toHaveBeenCalledWith(mailboxId(receipt.mailboxPub));
    expect(out).toEqual({ replies: [{ text: "Recebemos.", createdAtBlock: 10n, author: NEWSROOM }], ignored: 0 });
  });

  it("active_journalist_reply_counts_and_shows_the_name", async () => {
    const { f, receipt, client } = await setup();
    f.owners[`maria.${NEWSROOM}`] = MARIA_ADDR;
    f.getReplies.mockResolvedValue([row(reply(receipt, "Aqui é a Maria."), { creator: MARIA_ADDR, authorName: `maria.${NEWSROOM}` })]);
    expect((await client.readReplies(receipt)).replies).toEqual([{ text: "Aqui é a Maria.", createdAtBlock: 10n, author: `maria.${NEWSROOM}` }]);
  });

  it("reply_forged_by_a_third_party_is_ignored_even_if_correctly_encrypted", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "Mande seus dados para mim."), { creator: STRANGER })]);
    expect(await client.readReplies(receipt)).toEqual({ replies: [], ignored: 1 });
  });

  it("third_party_claiming_to_be_a_journalist_is_ignored", async () => {
    const { f, receipt, client } = await setup();
    f.owners[`maria.${NEWSROOM}`] = MARIA_ADDR;
    f.getReplies.mockResolvedValue([row(reply(receipt, "golpe"), { creator: STRANGER, authorName: `maria.${NEWSROOM}` })]);
    expect((await client.readReplies(receipt)).ignored).toBe(1);
  });

  it("revoked_journalist_is_ignored", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "oi"), { creator: MARIA_ADDR, authorName: `maria.${NEWSROOM}` })]);
    expect((await client.readReplies(receipt)).ignored).toBe(1);
  });

  it("reply_copied_to_another_mailbox_by_a_third_party_is_ignored", async () => {
    const { f, receipt, client } = await setup();
    const legit = reply(receipt, "Recebemos.");
    f.getReplies.mockResolvedValue([row(legit, { creator: STRANGER })]); // same bytes, published by someone who is not from the newsroom
    expect((await client.readReplies(receipt)).replies).toEqual([]);
  });

  it("reply_with_another_newsroom_inside_the_content_or_in_the_entity_is_ignored", async () => {
    const { f, receipt, client } = await setup();
    f.getReplies.mockResolvedValue([row(reply(receipt, "x", "outra.eth")), row(reply(receipt, "y"), { newsroom: "outra.eth" })]);
    expect(await client.readReplies(receipt)).toEqual({ replies: [], ignored: 2 });
  });

  it("old_format_plain_text_and_tampered_ones_are_ignored", async () => {
    const { f, receipt, client } = await setup();
    const other = await send(createSourceClient(makeDeps().deps));
    f.getReplies.mockResolvedValue([
      row(sealReply(receipt.mailboxPub, new TextEncoder().encode("texto puro"))),
      row(reply(other.receipt, "de outra caixa")),
      row(reply(receipt, "valida")),
    ]);
    const out = await client.readReplies(receipt);
    expect(out.replies.map((r) => r.text)).toEqual(["valida"]);
    expect(out.ignored).toBe(2);
  });

  it("failure_querying_ens_does_not_become_authorization", async () => {
    const { f, receipt, client } = await setup();
    f.resolveNewsroom.mockRejectedValue(new Error("rpc down"));
    f.getReplies.mockResolvedValue([row(reply(receipt, "oi"), { creator: STRANGER })]);
    await expect(client.readReplies(receipt)).rejects.toMatchObject({ code: "network" });
  });

  it("without_replies_returns_an_empty_list", async () => {
    const { receipt, client } = await setup();
    expect(await client.readReplies(receipt)).toEqual({ replies: [], ignored: 0 });
  });
});

describe("6. verification", () => {
  const publish = async () => {
    const f = makeDeps();
    const { receipt } = await send(createSourceClient(f.deps));
    return { f, receipt, bytes: fromBase64Url(f.relayer.received[0]!.envelope) };
  };

  it("checks_hash_and_date", async () => {
    const { f, receipt, bytes } = await publish();
    f.listSubmissions.mockResolvedValue({ items: [{ key: "0x01", contentHash: receipt.contentHash, createdAtBlock: 77n }], hasMore: false, skippedIncomplete: 0 });
    const r = await createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: bytes });
    expect(r).toEqual({ hashMatches: true, found: true, createdAtBlock: 77n, contentHash: receipt.contentHash });
  });

  it("tampered_file_does_not_match_and_invalid_file_is_refused", async () => {
    const { f, bytes } = await publish();
    const tampered = new Uint8Array(bytes);
    tampered[tampered.length - 5] = tampered[tampered.length - 5]! ^ 0xff;
    const r = await createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: tampered });
    expect(r.hashMatches).toBe(false);
    expect(r.found).toBe(false);
    await expect(createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ code: "invalid_envelope" });
  });

  it("searches_all_pages", async () => {
    const { f, receipt, bytes } = await publish();
    f.listSubmissions
      .mockResolvedValueOnce({ items: [{ key: "0x01", contentHash: "0xoutro", createdAtBlock: 1n }], hasMore: true, skippedIncomplete: 0 })
      .mockResolvedValueOnce({ items: [{ key: "0x02", contentHash: receipt.contentHash, createdAtBlock: 5n }], hasMore: false, skippedIncomplete: 0 });
    expect((await createSourceClient(f.deps).verifyDocument({ newsroom: NEWSROOM, envelope: bytes })).createdAtBlock).toBe(5n);
  });

  it("proves_authorship_with_the_original_content_and_the_salt", async () => {
    const { f, receipt, bytes } = await publish();
    const client = createSourceClient(f.deps);
    expect(client.proveAuthorship({ envelope: bytes, text: SECRET, salt: receipt.salt })).toBe(true);
    expect(client.proveAuthorship({ envelope: bytes, text: "outro texto", salt: receipt.salt })).toBe(false);
    expect(client.proveAuthorship({ envelope: bytes, text: SECRET, salt: new Uint8Array(32) })).toBe(false);
  });
});

describe("7. network", () => {
  it("only_contacts_declared_hosts", async () => {
    const { client, f } = clientOf();
    await send(client);
    expect(f.recorder.hosts()).toEqual(["relayer.example.org"]);
  });

  it("uses_the_configured_relayer_url", async () => {
    const f = makeDeps({ relayerUrl: "https://outro.example.net/" });
    await send(createSourceClient(f.deps));
    expect(f.recorder.hosts()).toEqual(["outro.example.net"]);
  });
});
