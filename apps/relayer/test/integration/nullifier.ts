import { createHash } from "node:crypto";

/** Mimics the protocol property: the nullifier depends on the person and the action. */
export const nullifierOf = (person: string, action: string) => "0x" + createHash("sha256").update(`${person}|${action}`).digest("hex").slice(0, 60);
