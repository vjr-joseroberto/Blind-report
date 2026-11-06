import { describe, expect, it } from "vitest";
import { CryptoError, lockWithPassword, newKeypair, openSealed, sealTo, unlockWithPassword } from "../src/index.ts";

const FAST = { iterations: 1000 };
const data = new TextEncoder().encode("chave-privada-de-teste");

describe("password protection", () => {
  it("round_trip_with_the_correct_password", async () => {
    const blob = await lockWithPassword(data, "correct horse", FAST);
    expect([...(await unlockWithPassword(blob, "correct horse"))]).toEqual([...data]);
  });

  it("wrong_password_fails_with_a_clear_error", async () => {
    const blob = await lockWithPassword(data, "correct horse", FAST);
    await expect(unlockWithPassword(blob, "outra senha")).rejects.toMatchObject({ code: "decrypt" });
  });

  it("the_blob_contains_neither_the_content_nor_the_password", async () => {
    const blob = await lockWithPassword(data, "senha-secreta-123", FAST);
    expect(blob).not.toContain("chave-privada");
    expect(blob).not.toContain("senha-secreta-123");
    expect(Buffer.from(blob, "base64url").toString("latin1")).not.toContain("chave-privada-de-teste");
  });

  it("two_blobs_of_the_same_content_are_different_new_salt_and_nonce", async () => {
    expect(await lockWithPassword(data, "x1234567", FAST)).not.toBe(await lockWithPassword(data, "x1234567", FAST));
  });

  it("tampered_or_malformed_blob_is_rejected", async () => {
    const blob = await lockWithPassword(data, "pw-12345", FAST);
    const raw = JSON.parse(Buffer.from(blob, "base64url").toString());
    raw.ct = raw.ct.slice(0, -4) + "AAAA";
    const bad = Buffer.from(JSON.stringify(raw)).toString("base64url");
    await expect(unlockWithPassword(bad, "pw-12345")).rejects.toBeInstanceOf(CryptoError);
    await expect(unlockWithPassword("lixo", "pw-12345")).rejects.toMatchObject({ code: "format" });
    await expect(unlockWithPassword(Buffer.from('{"v":9}').toString("base64url"), "pw-12345")).rejects.toMatchObject({ code: "format" });
  });

  it("rejects_short_password_and_too_few_iterations_in_production", async () => {
    await expect(lockWithPassword(data, "curta", FAST)).rejects.toMatchObject({ code: "input" });
    await expect(lockWithPassword(data, "senha-longa-ok")).resolves.toBeTypeOf("string"); // strong default (600 thousand iterations)
  }, 20_000);

  it("the_iteration_count_goes_in_the_blob_and_absurd_values_are_rejected_when_opening", async () => {
    const blob = await lockWithPassword(data, "pw-12345", FAST);
    const raw = JSON.parse(Buffer.from(blob, "base64url").toString());
    expect(raw.iter).toBe(1000);
    raw.iter = 1e12;
    await expect(unlockWithPassword(Buffer.from(JSON.stringify(raw)).toString("base64url"), "pw-12345")).rejects.toMatchObject({ code: "format" });
  });
});

describe("generic sealed box", () => {
  it("only_the_owner_of_the_private_key_opens", () => {
    const a = newKeypair();
    const b = newKeypair();
    const sealed = sealTo(a.publicKey, data);
    expect([...openSealed(sealed, a)]).toEqual([...data]);
    expect(() => openSealed(sealed, b)).toThrow(CryptoError);
  });

  it("rejects_invalid_key_and_empty_data", () => {
    expect(() => sealTo(new Uint8Array(3), data)).toThrow(CryptoError);
    expect(() => sealTo(newKeypair().publicKey, new Uint8Array())).toThrow(CryptoError);
  });
});
