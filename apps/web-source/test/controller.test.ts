import { NewsroomNotFoundError } from "@safe-whistle/ens-client";
import { ProofError, SourceError, parseReceipt } from "@safe-whistle/source-client";
import { describe, expect, it, vi } from "vitest";
import { cancellable, createSourceController } from "../src/controller.ts";

const INFO = { name: "investiga.eth", pubkeyVersion: 2, policy: { categories: ["saude", "corrupcao"], maxBytes: 10_000, attachments: false, epoch: "monthly" as const } };
const RECEIPT = { newsroom: "investiga.eth", key: "0x01", contentHash: "0xaa", salt: new Uint8Array([1, 2]), mailboxPriv: new Uint8Array([3]), mailboxPub: new Uint8Array([4]) };

function make(over: Record<string, any> = {}) {
  const client = {
    lookupNewsroom: vi.fn(async (_n: string) => INFO),
    submit: vi.fn(async (_i: any) => ({ receipt: RECEIPT, parts: 1 })),
    readReplies: vi.fn(async (_r: any) => ({ replies: [{ text: "Recebemos.", createdAtBlock: 5n, author: "investiga.eth" }], ignored: 0 })),
    verifyDocument: vi.fn(async (_a: any) => ({ hashMatches: true, found: true, createdAtBlock: 9n, contentHash: "0xaa" })),
    proveAuthorship: vi.fn((_a: any) => true),
    ...over,
  };
  const c = createSourceController(client as never);
  const states: string[] = [];
  c.subscribe((s) => states.push(s.step));
  return { c, client, states };
}

describe("step 1: choose the newsroom", () => {
  it("renders_the_policy_categories_after_searching", async () => {
    const { c } = make();
    await c.lookup("investiga.eth");
    expect(c.state).toMatchObject({ step: "compose", newsroom: { name: "investiga.eth", version: 2, categories: ["saude", "corrupcao"], maxBytes: 10_000, attachments: false } });
  });

  it("shows_the_cause_of_the_error_and_stays_on_step_1", async () => {
    const { c } = make({ lookupNewsroom: vi.fn(async () => { throw new SourceError("newsroom_not_found", "Newsroom not found. Check the name."); }) });
    await c.lookup("nada.eth");
    expect(c.state.step).toBe("newsroom");
    expect(c.state.error).toEqual({ code: "newsroom_not_found", message: "Newsroom not found. Check the name." });
  });

  it("unexpected_error_becomes_a_generic_message_without_details", async () => {
    const { c } = make({ lookupNewsroom: vi.fn(async () => { throw new Error("internal secret 10.0.0.1"); }) });
    await c.lookup("investiga.eth");
    expect(c.state.error?.message).not.toContain("10.0.0.1");
    expect(c.state.error?.code).toBe("unexpected");
  });
});

describe("steps 2 to 4: send", () => {
  it("goes_to_the_proof_step_while_sending_and_ends_on_the_receipt", async () => {
    const { c, states } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    expect(states).toContain("proof");
    expect(c.state.step).toBe("receipt");
    expect(parseReceipt(c.state.receiptText!)).toEqual(RECEIPT);
  });

  it("receipt_only_finishes_after_confirming_it_was_saved", async () => {
    const { c } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    c.finish();
    expect(c.state.step).toBe("receipt");
    c.confirmReceiptSaved();
    c.finish();
    expect(c.state.step).toBe("newsroom");
    expect(c.state.receiptText).toBeUndefined();
  });

  it("cancelled_proof_returns_to_step_2_with_the_cause", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    client.submit.mockRejectedValueOnce(new SourceError("proof_cancelled", "You cancelled the proof."));
    await c.submit({ category: "saude", text: "oi" });
    expect(c.state.step).toBe("compose");
    expect(c.state.error?.code).toBe("proof_cancelled");
    expect(c.state.receiptText).toBeUndefined();
  });

  it("limit_reached_shows_the_client_text", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    client.submit.mockRejectedValueOnce(new SourceError("limit_reached", "You already sent to this newsroom this month. Try again next month."));
    await c.submit({ category: "saude", text: "oi" });
    expect(c.state.error?.message).toMatch(/already sent/);
  });

  it("the_proof_link_appears_in_the_state", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    client.submit.mockImplementationOnce(async () => {
      c.setProofLink("https://exemplo.test/verify?x=1");
      expect(c.state.proofLink).toBe("https://exemplo.test/verify?x=1");
      return { receipt: RECEIPT, parts: 1 };
    });
    await c.submit({ category: "saude", text: "oi" });
    expect(c.state.proofLink).toBeUndefined();
  });

  it("sending_without_searching_the_newsroom_is_ignored", async () => {
    const { c, client } = make();
    await c.submit({ category: "saude", text: "oi" });
    expect(client.submit).not.toHaveBeenCalled();
  });
});

describe("replies and verification", () => {
  it("opens_the_pasted_receipt_and_lists_the_replies", async () => {
    const { c } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    const text = c.state.receiptText!;
    const { c: c2 } = make();
    await c2.loadReplies(text);
    expect(c2.state.replies).toEqual([{ text: "Recebemos.", createdAtBlock: 5n, author: "investiga.eth" }]);
    expect(c2.state.ignoredReplies).toBe(0);
  });

  it("shows_how_many_replies_were_ignored", async () => {
    const { c, client } = make();
    await c.lookup("investiga.eth");
    await c.submit({ category: "saude", text: "oi" });
    client.readReplies.mockResolvedValueOnce({ replies: [], ignored: 2 });
    await c.loadReplies(c.state.receiptText!);
    expect(c.state.ignoredReplies).toBe(2);
    expect(c.state.replies).toEqual([]);
  });

  it("invalid_receipt_shows_an_error", async () => {
    const { c } = make();
    await c.loadReplies("lixo");
    expect(c.state.error?.code).toBe("invalid_receipt");
    expect(c.state.replies).toBeUndefined();
  });

  it("verifies_file_and_authorship", async () => {
    const { c, client } = make();
    await c.verify({ newsroom: "investiga.eth", envelope: new Uint8Array([1]) });
    expect(c.state.verification).toEqual({ hashMatches: true, found: true, createdAtBlock: 9n, contentHash: "0xaa" });
    expect(c.proveAuthorship({ envelope: new Uint8Array([1]), text: "x", salt: new Uint8Array(32) })).toBe(true);
    expect(client.proveAuthorship).toHaveBeenCalled();
  });

  it("error_while_verifying_appears_in_the_state", async () => {
    const { c } = make({ verifyDocument: vi.fn(async () => { throw new SourceError("invalid_envelope", "The file is not a Safe Whistle envelope."); }) });
    await c.verify({ newsroom: "investiga.eth", envelope: new Uint8Array([1]) });
    expect(c.state.error?.code).toBe("invalid_envelope");
  });
});

describe("cancellable", () => {
  it("cancel_rejects_with_proof_cancelled", async () => {
    const never = () => new Promise<never>(() => {});
    const { provider, cancel } = cancellable(never as never);
    const p = provider({} as never);
    cancel();
    await expect(p).rejects.toMatchObject({ reason: "cancelled" });
  });

  it("passes_the_result_through_when_not_cancelled", async () => {
    const { provider } = cancellable((async () => ({ ok: 1 })) as never);
    await expect(provider({} as never)).resolves.toEqual({ ok: 1 });
  });

  it("cancelling_without_a_proof_in_progress_does_nothing", () => {
    expect(() => cancellable((async () => ({})) as never).cancel()).not.toThrow();
  });
});

void NewsroomNotFoundError; void ProofError;
