import { describe, expect, it, vi } from "vitest";
import { createMemoryNullifierStore, createSimulatedVerifier, createSubmissionGate, type Verifier } from "../src/index.ts";
import { payload } from "./helpers.ts";

const A = "investiga.eth";
const B = "outra.eth";

const gate = (over: { verifier?: Verifier; environment?: "staging" | "production" } = {}) =>
  createSubmissionGate({ expectedEnvironment: over.environment ?? "staging", verifier: over.verifier ?? createSimulatedVerifier(), store: createMemoryNullifierStore() });

const refusal = async (p: ReturnType<ReturnType<typeof gate>["admit"]>) => {
  const r = await p;
  return r.ok ? "accepted" : r.code;
};

describe("RF-09 and RN-01 limit of one tip per person per newsroom per epoch", () => {
  it("accepts_the_first_tip", async () => {
    expect((await gate().admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) })).ok).toBe(true);
  });

  it("blocks_the_second_in_the_same_newsroom_and_epoch", async () => {
    const g = gate();
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    const r = await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect(r).toMatchObject({ ok: false, code: "limit_reached" });
    if (!r.ok) expect(r.message).toMatch(/already submitted/i);
  });

  it("allows_another_newsroom_and_the_next_epoch", async () => {
    const g = gate();
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect((await g.admit({ newsroom: B, epoch: 202611, payload: payload("ana", B, 202611) })).ok).toBe(true);
    expect((await g.admit({ newsroom: A, epoch: 202612, payload: payload("ana", A, 202612) })).ok).toBe(true);
  });

  it("another_person_in_the_same_newsroom_and_epoch_is_accepted", async () => {
    const g = gate();
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect((await g.admit({ newsroom: A, epoch: 202611, payload: payload("bia", A, 202611) })).ok).toBe(true);
  });

  it("two_simultaneous_attempts_from_the_same_person_only_one_passes", async () => {
    const g = gate();
    const rs = await Promise.all([1, 2, 3].map(() => g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) })));
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
  });

  it("releasing_the_reservation_allows_retrying_if_publication_fails", async () => {
    const g = gate();
    const first = await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    if (!first.ok) throw new Error("expected accepted");
    await first.release();
    expect((await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) })).ok).toBe(true);
  });
});

describe("RN-09 the proof is valid only for its action", () => {
  it("replay_between_newsrooms_is_refused", async () => {
    expect(await refusal(gate().admit({ newsroom: B, epoch: 202611, payload: payload("carla", A, 202611) }))).toBe("wrong_action");
  });

  it("replay_between_epochs_is_refused", async () => {
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202612, payload: payload("carla", A, 202611) }))).toBe("wrong_action");
  });

  it("wrong_environment_is_refused", async () => {
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202611, payload: payload("dani", A, 202611, { environment: "production" }) }))).toBe("wrong_environment");
    expect(await refusal(gate({ environment: "production" }).admit({ newsroom: A, epoch: 202611, payload: payload("dani", A, 202611) }))).toBe("wrong_environment");
  });
});

describe("validations before spending a call to the World API", () => {
  it("the_verifier_is_not_called_when_the_action_or_the_environment_or_the_nullifier_are_wrong", async () => {
    const verifier = vi.fn(createSimulatedVerifier());
    const g = gate({ verifier });
    await g.admit({ newsroom: B, epoch: 202611, payload: payload("x", A, 202611) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("x", A, 202611, { environment: "production" }) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("x", A, 202611, { responses: [{ identifier: "proof_of_human", nullifier: "zzz" }] }) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("x", A, 202611, { responses: [] }) });
    expect(verifier).not.toHaveBeenCalled();
  });

  it("already_used_nullifier_does_not_call_the_verifier_again", async () => {
    const verifier = vi.fn(createSimulatedVerifier());
    const g = gate({ verifier });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    await g.admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    expect(verifier).toHaveBeenCalledTimes(1);
  });

  it("invalid_inputs_produce_a_refusal_with_a_code", async () => {
    expect(await refusal(gate().admit({ newsroom: "Invalida", epoch: 202611, payload: payload("a", A, 202611) }))).toBe("invalid_request");
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202613, payload: payload("a", A, 202611) }))).toBe("invalid_request");
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202611, payload: null as never }))).toBe("invalid_request");
  });
});

describe("verifier refusals", () => {
  it("invalid_proof_is_refused_and_does_not_consume_the_reservation", async () => {
    const g = gate();
    expect(await refusal(g.admit({ newsroom: A, epoch: 202611, payload: payload("edu", A, 202611, { valid: false }) }))).toBe("proof_rejected");
    expect((await g.admit({ newsroom: A, epoch: 202611, payload: payload("edu", A, 202611) })).ok).toBe(true);
  });

  it("the_verifier_reason_appears_in_the_refusal", async () => {
    const verifier: Verifier = async () => ({ success: false, error: "400 all_verifications_failed" });
    const r = await gate({ verifier }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("all_verifications_failed");
  });

  it("response_with_different_environment_or_action_is_refused", async () => {
    const other: Verifier = async (p) => ({ success: true, environment: "production", action: p.action });
    expect(await refusal(gate({ verifier: other }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) }))).toBe("wrong_environment");
    const otherAction: Verifier = async (p) => ({ success: true, environment: p.environment, action: "submit:x.eth:1" });
    expect(await refusal(gate({ verifier: otherAction }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) }))).toBe("wrong_action");
  });

  it("nullifier_from_the_response_different_from_the_payload_one_is_refused", async () => {
    const liar: Verifier = async (p) => ({ success: true, environment: p.environment, action: p.action, nullifier: "0x" + "99".repeat(30) });
    expect(await refusal(gate({ verifier: liar }).admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611) }))).toBe("nullifier_mismatch");
  });

  it("malformed_nullifier_in_the_payload_is_refused", async () => {
    expect(await refusal(gate().admit({ newsroom: A, epoch: 202611, payload: payload("a", A, 202611, { responses: [{ identifier: "proof_of_human", nullifier: "zzz" }] }) }))).toBe("invalid_nullifier");
  });
});

describe("RN-05 the proof is not stored", () => {
  it("the_admission_result_does_not_expose_the_proof_nor_the_nullifier", async () => {
    const r = await gate().admit({ newsroom: A, epoch: 202611, payload: payload("ana", A, 202611) });
    const text = JSON.stringify(r);
    expect(text).not.toContain("proof");
    expect(text).not.toContain("nullifier");
  });
});
