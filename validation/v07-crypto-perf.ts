// V-07 — Desempenho da cifragem (Node, mesmo motor V8/WebAssembly dos navegadores baseados em Chromium).
import { newKeypair, seal, open, encodeEnvelope, decodeEnvelope } from "@safe-whistle/crypto";

const redacao = newKeypair();
const recipients = [{ id: "redacao", publicKey: redacao.publicKey }];
const sizes: [string, number][] = [["1 KiB", 1024], ["100 KiB", 100 * 1024], ["1 MiB", 1024 * 1024]];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const time = (fn: () => void, runs = 15) => {
  fn(); // aquecimento
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return median(t);
};

const rows: string[] = [];
for (const [label, n] of sizes) {
  const plaintext = new Uint8Array(n).fill(7);
  const { envelope } = seal({ newsroom: "investiga.jornal.eth", pubkeyVersion: 1, category: "x", recipients, plaintext });
  const bytes = encodeEnvelope(envelope);
  const sealMs = time(() => seal({ newsroom: "investiga.jornal.eth", pubkeyVersion: 1, category: "x", recipients, plaintext }));
  const openMs = time(() => open(envelope, "redacao", redacao));
  const codecMs = time(() => decodeEnvelope(encodeEnvelope(envelope)));
  rows.push(`| ${label} | ${sealMs.toFixed(2)} | ${openMs.toFixed(2)} | ${codecMs.toFixed(2)} | ${bytes.length} |`);
}
console.log("| Tamanho | cifrar (ms) | abrir (ms) | codificar+decodificar (ms) | bytes do envelope |");
console.log("|---|---|---|---|---|");
console.log(rows.join("\n"));
const m100 = Number(rows[1]!.split("|")[2]);
console.log(`\nMeta RNF-08 (cifrar 100 KiB < 100 ms): ${m100 < 100 ? "ATENDIDA" : "NÃO ATENDIDA"} (${m100.toFixed(2)} ms)`);
