import { fromBase64Url, parsePolicy, PolicyError, type NewsroomPolicy } from "@safe-whistle/core";
import { isAddress, type Address } from "viem";
import { RecordsError } from "./errors.ts";

export type RawNewsroomRecords = {
  name: string;
  pubkey: string | null;
  version: string | null;
  policy: string | null;
  relayer: string | null;
  custodian: string | null;
};

export type NewsroomInfo = {
  name: string;
  publicKey: Uint8Array;
  pubkeyVersion: number;
  policy: NewsroomPolicy;
  relayers: string[];
  custodian: Address;
};

const ZERO = "0x0000000000000000000000000000000000000000";

/** Decodes an X25519 public key (base64url, 32 bytes) read from a text record. */
export function decodePublicKey(text: string | null, code: "pubkey" | "readerkey", record: string): Uint8Array {
  if (!text) throw new RecordsError(code, `Missing the ${record} record.`);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(text);
  } catch {
    throw new RecordsError(code, `The ${record} record is not valid base64url.`);
  }
  if (bytes.length !== 32) throw new RecordsError(code, `The ${record} record must be 32 bytes (has ${bytes.length}).`);
  return bytes;
}

/** Validates and parses the records published by the newsroom in ENS. */
export function parseNewsroomRecords(raw: RawNewsroomRecords): NewsroomInfo {
  const publicKey = decodePublicKey(raw.pubkey, "pubkey", "denuncia.pubkey");

  if (raw.version === null || !/^[1-9][0-9]*$/.test(raw.version)) {
    throw new RecordsError("version", "The denuncia.pubkey.version record must be a positive integer.");
  }
  const pubkeyVersion = Number(raw.version);

  if (!raw.policy) throw new RecordsError("policy", "Missing the denuncia.policy record.");
  let policy: NewsroomPolicy;
  try {
    policy = parsePolicy(raw.policy);
  } catch (e) {
    throw new RecordsError("policy", `The denuncia.policy record is invalid: ${e instanceof PolicyError ? e.message : String(e)}`);
  }

  const relayers = (raw.relayer ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const r of relayers) {
    let url: URL | null = null;
    try {
      url = new URL(r);
    } catch {
      /* invalid */
    }
    if (!url || url.protocol !== "https:") throw new RecordsError("relayer", `The relayer "${r}" in denuncia.relayer must be an https URL.`);
  }

  if (!raw.custodian || !isAddress(raw.custodian, { strict: false }) || raw.custodian.toLowerCase() === ZERO) {
    throw new RecordsError("custodian", "The newsroom has no published (custodian) address.");
  }

  return { name: raw.name, publicKey, pubkeyVersion, policy, relayers, custodian: raw.custodian as Address };
}
