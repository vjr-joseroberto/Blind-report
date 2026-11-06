import { createHash } from "node:crypto";

/** Imita a propriedade do protocolo: o nullifier depende da pessoa e da ação. */
export const nullifierOf = (person: string, action: string) => "0x" + createHash("sha256").update(`${person}|${action}`).digest("hex").slice(0, 60);
