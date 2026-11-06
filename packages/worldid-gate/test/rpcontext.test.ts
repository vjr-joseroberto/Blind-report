import { actionFor, InvalidNewsroomNameError } from "@safe-whistle/core";
import { computeRpSignatureMessage } from "@worldcoin/idkit-core/signing";
import { hexToBytes, recoverMessageAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GateError, createRpContextSigner } from "../src/index.ts";

const KEY = ("0x" + "1f".repeat(32)) as Hex;
const SIGNING_KEY_HEX = KEY.slice(2);
const RP_ID = "rp_test123";
const signer = () => createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: RP_ID });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("RF-09 RP context signed on the server", () => {
  it("generates_the_context_with_the_rp_id_the_deadline_and_the_signature", () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    expect(ctx.rp_id).toBe(RP_ID);
    expect(ctx.signature).toMatch(/^0x[0-9a-f]+$/i);
    expect(ctx.nonce).toBeTruthy();
    expect(ctx.created_at).toBe(Math.floor(Date.now() / 1000));
  });

  it("expires_at_the_defined_deadline_with_a_controlled_clock", () => {
    const ctx = createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: RP_ID, ttlSeconds: 120 }).rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    expect(ctx.expires_at - ctx.created_at).toBe(120);
  });

  it("the_default_deadline_is_5_minutes", () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    expect(ctx.expires_at - ctx.created_at).toBe(300);
  });

  it("different_actions_generate_different_signatures", () => {
    const a = signer().rpContextFor({ newsroom: "a.eth", epoch: 202611 });
    const b = signer().rpContextFor({ newsroom: "b.eth", epoch: 202611 });
    const c = signer().rpContextFor({ newsroom: "a.eth", epoch: 202612 });
    expect(new Set([a.signature, b.signature, c.signature]).size).toBe(3);
  });

  it("each_call_uses_a_new_nonce", () => {
    const s = signer();
    expect(s.rpContextFor({ newsroom: "a.eth", epoch: 202611 }).nonce).not.toBe(s.rpContextFor({ newsroom: "a.eth", epoch: 202611 }).nonce);
  });

  it("the_signature_is_valid_and_recovers_the_signing_key_address", async () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    const message = computeRpSignatureMessage(hexToBytes(ctx.nonce as Hex), ctx.created_at, ctx.expires_at, actionFor("investiga.eth", 202611));
    const recovered = await recoverMessageAddress({ message: { raw: message }, signature: ctx.signature as Hex });
    expect(recovered).toBe(privateKeyToAccount(KEY).address);
  });

  it("the_signature_is_not_valid_for_another_action", async () => {
    const ctx = signer().rpContextFor({ newsroom: "investiga.eth", epoch: 202611 });
    const other = computeRpSignatureMessage(hexToBytes(ctx.nonce as Hex), ctx.created_at, ctx.expires_at, actionFor("outra.eth", 202611));
    const recovered = await recoverMessageAddress({ message: { raw: other }, signature: ctx.signature as Hex });
    expect(recovered).not.toBe(privateKeyToAccount(KEY).address);
  });

  it("refuses_invalid_signing_key_without_leaking_the_value", () => {
    for (const bad of ["", "zz", "ab".repeat(31), "0x" + "ab".repeat(32) + "00"]) {
      try {
        createRpContextSigner({ signingKeyHex: bad, rpId: RP_ID });
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(GateError);
        expect((e as GateError).code).toBe("config");
        expect((e as Error).message).not.toContain(bad || "__vazio__");
      }
    }
  });

  it("accepts_the_key_with_or_without_the_0x_prefix", () => {
    expect(() => createRpContextSigner({ signingKeyHex: "0x" + SIGNING_KEY_HEX, rpId: RP_ID })).not.toThrow();
  });

  it("refuses_rp_id_out_of_format", () => {
    expect(() => createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: "app_123" })).toThrow(GateError);
    expect(() => createRpContextSigner({ signingKeyHex: SIGNING_KEY_HEX, rpId: "" })).toThrow(GateError);
  });

  it("refuses_invalid_newsroom_or_epoch", () => {
    expect(() => signer().rpContextFor({ newsroom: "Invalida", epoch: 202611 })).toThrow(InvalidNewsroomNameError);
    expect(() => signer().rpContextFor({ newsroom: "a.eth", epoch: 202613 })).toThrow(RangeError);
  });
});
