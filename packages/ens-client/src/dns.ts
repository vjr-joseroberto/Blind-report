import { toHex, type Hex } from "viem";
import { InvalidNameError } from "./errors.ts";

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** Nome em formato DNS (rótulos com prefixo de tamanho, terminado em zero). Os setters do ENSv2 recebem este formato. */
export function dnsEncode(name: string): Hex {
  if (name.length === 0) throw new InvalidNameError(name, "vazio");
  const labels = name.split(".");
  const bytes: number[] = [];
  for (const label of labels) {
    if (label.length === 0) throw new InvalidNameError(name, "rótulo vazio");
    if (label.length > 63) throw new InvalidNameError(name, "rótulo com mais de 63 bytes");
    if (!LABEL_RE.test(label)) throw new InvalidNameError(name, "só minúsculas, números e hífen");
    bytes.push(label.length, ...[...label].map((c) => c.charCodeAt(0)));
  }
  bytes.push(0);
  return toHex(Uint8Array.from(bytes));
}
