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

/** Decodifica uma chave pública X25519 (base64url, 32 bytes) lida de um registro de texto. */
export function decodePublicKey(text: string | null, code: "pubkey" | "readerkey", record: string): Uint8Array {
  if (!text) throw new RecordsError(code, `Falta o registro ${record}.`);
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(text);
  } catch {
    throw new RecordsError(code, `O registro ${record} não é base64url válido.`);
  }
  if (bytes.length !== 32) throw new RecordsError(code, `O registro ${record} deve ter 32 bytes (tem ${bytes.length}).`);
  return bytes;
}

/** Valida e interpreta os registros publicados pela redação no ENS. */
export function parseNewsroomRecords(raw: RawNewsroomRecords): NewsroomInfo {
  const publicKey = decodePublicKey(raw.pubkey, "pubkey", "denuncia.pubkey");

  if (raw.version === null || !/^[1-9][0-9]*$/.test(raw.version)) {
    throw new RecordsError("version", "O registro denuncia.pubkey.version deve ser um inteiro positivo.");
  }
  const pubkeyVersion = Number(raw.version);

  if (!raw.policy) throw new RecordsError("policy", "Falta o registro denuncia.policy.");
  let policy: NewsroomPolicy;
  try {
    policy = parsePolicy(raw.policy);
  } catch (e) {
    throw new RecordsError("policy", `O registro denuncia.policy é inválido: ${e instanceof PolicyError ? e.message : String(e)}`);
  }

  const relayers = (raw.relayer ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const r of relayers) {
    let url: URL | null = null;
    try {
      url = new URL(r);
    } catch {
      /* inválida */
    }
    if (!url || url.protocol !== "https:") throw new RecordsError("relayer", `O relayer "${r}" em denuncia.relayer deve ser uma URL https.`);
  }

  if (!raw.custodian || !isAddress(raw.custodian, { strict: false }) || raw.custodian.toLowerCase() === ZERO) {
    throw new RecordsError("custodian", "A redação não tem um endereço (custodiante) publicado.");
  }

  return { name: raw.name, publicKey, pubkeyVersion, policy, relayers, custodian: raw.custodian as Address };
}
