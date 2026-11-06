import { actionFor } from "@safe-whistle/core";
import { createHash } from "node:crypto";
import type { IdKitPayload } from "../src/index.ts";

/** Mimics the protocol's central property: the nullifier depends on the person AND the action. */
export const nullifierOf = (person: string, action: string) => "0x" + createHash("sha256").update(`${person}|${action}`).digest("hex").slice(0, 60);

export function payload(person: string, newsroom: string, epoch: number, over: Record<string, unknown> = {}): IdKitPayload {
  const action = actionFor(newsroom, epoch);
  return {
    protocol_version: "4.0",
    nonce: "0x01",
    action,
    environment: "staging",
    responses: [{ identifier: "proof_of_human", nullifier: nullifierOf(person, action), proof: ["0x1", "0x2", "0x3", "0x4", "0x5"] }],
    ...over,
  } as IdKitPayload;
}
