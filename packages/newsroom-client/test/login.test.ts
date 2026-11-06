import { describe, expect, it } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createLogin } from "../src/index.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const account = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const base = { domain: "127.0.0.1:5174", address: account.address };

function make(now = NOW, ttl?: number) {
  let t = now;
  const login = createLogin({ now: () => t, ttlSeconds: ttl });
  return { login, advance: (s: number) => (t = new Date(t.getTime() + s * 1000)) };
}

describe("sign-in message (no gas, no transaction)", () => {
  it("has_site_address_number_and_validity_without_depending_on_the_newsroom", () => {
    const c = make().login.challenge(base);
    for (const part of ["127.0.0.1:5174", account.address, c.nonce, "2026-11-10T12:00:00.000Z", "2026-11-10T12:05:00.000Z"]) expect(c.message).toContain(part);
    expect(c.message).toMatch(/costs no gas/i);
  });

  it("each_request_has_a_new_number", () => {
    const { login } = make();
    expect(login.challenge(base).nonce).not.toBe(login.challenge(base).nonce);
  });
});

describe("signature verification", () => {
  it("valid_signature_matches_the_address", async () => {
    const { login } = make();
    const c = login.challenge(base);
    expect(await login.verify(c.nonce, await account.signMessage({ message: c.message }))).toEqual({ ok: true });
  });

  it("signature_from_another_address_is_refused", async () => {
    const { login } = make();
    const c = login.challenge(base);
    expect(await login.verify(c.nonce, await other.signMessage({ message: c.message }))).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("signature_of_another_message_or_junk_is_refused", async () => {
    const { login } = make();
    const c = login.challenge(base);
    expect((await login.verify(c.nonce, await account.signMessage({ message: "outra coisa" }))).ok).toBe(false);
    expect(await login.verify(c.nonce, "0x1234")).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("expired_message_is_refused", async () => {
    const { login, advance } = make();
    const c = login.challenge(base);
    const sig = await account.signMessage({ message: c.message });
    advance(301);
    expect(await login.verify(c.nonce, sig)).toEqual({ ok: false, reason: "expired" });
  });

  it("reused_number_is_refused_after_the_first_valid_use", async () => {
    const { login } = make();
    const c = login.challenge(base);
    const sig = await account.signMessage({ message: c.message });
    expect((await login.verify(c.nonce, sig)).ok).toBe(true);
    expect(await login.verify(c.nonce, sig)).toEqual({ ok: false, reason: "reused" });
  });

  it("unknown_number_is_refused", async () => {
    expect(await make().login.verify("0xabc", "0x00")).toEqual({ ok: false, reason: "unknown" });
  });

  it("attempt_with_wrong_signature_does_not_spend_the_number", async () => {
    const { login } = make();
    const c = login.challenge(base);
    await login.verify(c.nonce, await other.signMessage({ message: c.message }));
    expect((await login.verify(c.nonce, await account.signMessage({ message: c.message }))).ok).toBe(true);
  });
});
