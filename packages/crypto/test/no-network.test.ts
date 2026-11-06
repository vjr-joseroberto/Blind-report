import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "../src");
const FORBIDDEN = [/\bfetch\s*\(/, /node:(http|https|net|dns|tls|dgram|child_process)/, /XMLHttpRequest/, /WebSocket/, /@safe-whistle\/network-policy/];

describe("RNF-05 o pacote crypto não faz rede", () => {
  it("nenhum_arquivo_do_pacote_usa_api_de_rede", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SRC)) {
      const content = readFileSync(join(SRC, file), "utf8");
      for (const re of FORBIDDEN) if (re.test(content)) offenders.push(`${file}: ${re}`);
    }
    expect(offenders).toEqual([]);
  });
});
