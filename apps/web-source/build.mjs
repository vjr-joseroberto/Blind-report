// Gera dist/ a partir de src/: empacota o JavaScript, copia os arquivos estáticos e escreve a CSP a partir da política de rede.
import { build } from "esbuild";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export async function buildWeb({ outDir = join(here, "dist"), config } = {}) {
  const cfg = config ?? JSON.parse(await readFile(join(here, "config.json"), "utf8"));
  const { sourceNetworkPolicy } = await import("@safe-whistle/source-client");
  const { cspFor } = await import("@safe-whistle/network-policy");
  const csp = cspFor(sourceNetworkPolicy(cfg));

  await mkdir(outDir, { recursive: true });
  await build({ entryPoints: [join(here, "src/main.ts")], bundle: true, format: "esm", target: "es2022", outfile: join(outDir, "app.js"), minify: true, sourcemap: false, legalComments: "none", logLevel: "silent" });
  const html = (await readFile(join(here, "index.html"), "utf8")).replace("__CSP__", csp);
  await writeFile(join(outDir, "index.html"), html);
  await writeFile(join(outDir, "config.json"), JSON.stringify(cfg, null, 2));
  await copyFile(join(here, "style.css"), join(outDir, "style.css"));
  return { outDir, csp };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = await buildWeb();
  console.log(`web-source gerado em ${r.outDir}`);
}
