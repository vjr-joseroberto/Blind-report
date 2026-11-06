import { toBase64Url } from "@safe-whistle/core";
import { describe, expect, it } from "vitest";
import { RecordsError, parseNewsroomRecords } from "../src/index.ts";

const KEY = new Uint8Array(32).map((_, i) => i + 1);
const custodian = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const policyJson = JSON.stringify({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true });

const raw = (over: Record<string, unknown> = {}) => ({
  name: "investiga.jornal.eth",
  pubkey: toBase64Url(KEY),
  version: "3",
  policy: policyJson,
  relayer: "https://relayer-1.example.org,https://relayer-2.example.org",
  custodian,
  ...over,
});

const codeOf = (fn: () => unknown) => {
  try {
    fn();
    return "no error";
  } catch (e) {
    return e instanceof RecordsError ? e.code : "other error";
  }
};

describe("RF-02 read the newsroom records", () => {
  it("interprets_key_version_policy_relayers_and_custodian", () => {
    const info = parseNewsroomRecords(raw());
    expect(info.name).toBe("investiga.jornal.eth");
    expect(info.publicKey).toEqual(KEY);
    expect(info.pubkeyVersion).toBe(3);
    expect(info.policy).toMatchObject({ categories: ["corrupcao", "saude"], maxBytes: 100000, attachments: true });
    expect(info.relayers).toEqual(["https://relayer-1.example.org", "https://relayer-2.example.org"]);
    expect(info.custodian).toBe(custodian);
  });

  it("relayer_is_optional", () => {
    expect(parseNewsroomRecords(raw({ relayer: null })).relayers).toEqual([]);
    expect(parseNewsroomRecords(raw({ relayer: "" })).relayers).toEqual([]);
  });

  it("missing_key_raises_clear_error", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: null })))).toBe("pubkey");
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: "" })))).toBe("pubkey");
  });

  it("key_with_wrong_size_or_format_raises_error", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: toBase64Url(new Uint8Array(16)) })))).toBe("pubkey");
    expect(codeOf(() => parseNewsroomRecords(raw({ pubkey: "isto não é base64url!" })))).toBe("pubkey");
  });

  it("invalid_version_raises_error", () => {
    for (const v of [null, "", "0", "-1", "1.5", "abc", "2 "]) expect(codeOf(() => parseNewsroomRecords(raw({ version: v }))), String(v)).toBe("version");
  });

  it("invalid_or_missing_policy_raises_error", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ policy: null })))).toBe("policy");
    expect(codeOf(() => parseNewsroomRecords(raw({ policy: "{nao json" })))).toBe("policy");
    expect(codeOf(() => parseNewsroomRecords(raw({ policy: JSON.stringify({ categories: [] }) })))).toBe("policy");
  });

  it("relayer_only_accepts_https", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ relayer: "http://inseguro.example.org" })))).toBe("relayer");
    expect(codeOf(() => parseNewsroomRecords(raw({ relayer: "nao e url" })))).toBe("relayer");
  });

  it("missing_or_zero_custodian_raises_error", () => {
    expect(codeOf(() => parseNewsroomRecords(raw({ custodian: null })))).toBe("custodian");
    expect(codeOf(() => parseNewsroomRecords(raw({ custodian: "0x0000000000000000000000000000000000000000" })))).toBe("custodian");
  });

  it("the_error_message_says_which_record_failed", () => {
    try {
      parseNewsroomRecords(raw({ pubkey: null }));
    } catch (e) {
      expect((e as Error).message).toContain("denuncia.pubkey");
    }
  });
});
