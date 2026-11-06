import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../src");
const FORBIDDEN = [/\bfetch\s*\(/, /node:(http|https|net|dns|tls|dgram|child_process)/, /XMLHttpRequest/, /WebSocket/, /@safe-whistle\/network-policy/];

describe("RNF-05 the crypto package does not use the network", () => {
  it("no_file_in_the_package_uses_a_network_api", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SRC)) {
      const content = readFileSync(join(SRC, file), "utf8");
      for (const re of FORBIDDEN) if (re.test(content)) offenders.push(`${file}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
