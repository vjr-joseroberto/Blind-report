import { toHex, type Hex } from "viem";
import { InvalidNameError } from "./errors.ts";

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Name in DNS format (labels with length prefix, terminated by zero). ENSv2 setters receive this format. */
export function dnsEncode(name: string): Hex {
  if (name.length === 0) throw new InvalidNameError(name, "empty");
  const labels = name.split(".");
  const bytes: number[] = [];
  for (const label of labels) {
    if (label.length === 0) throw new InvalidNameError(name, "empty label");
    if (label.length > 63) throw new InvalidNameError(name, "label with more than 63 bytes");
    if (!LABEL_RE.test(label)) throw new InvalidNameError(name, "only lowercase letters, numbers, and hyphen");
    bytes.push(label.length, ...[...label].map((c) => c.charCodeAt(0)));
  }
  bytes.push(0);
  return toHex(Uint8Array.from(bytes));
}
