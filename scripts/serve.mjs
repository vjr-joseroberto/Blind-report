// Servidor estático mínimo para abrir as telas construídas (apps/*/dist) no navegador, só em 127.0.0.1.
// Envia a CSP também como cabeçalho (a <meta> não aplica frame-ancestors).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

export function createStaticServer(dir) {
  const root = resolve(dir);
  return createServer(async (req, res) => {
    const headers = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
    try {
      const path = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
      const file = resolve(join(root, normalize(path === "/" ? "/index.html" : path)));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403, headers).end("proibido");
        return;
      }
      const body = await readFile(file);
      const type = TYPES[extname(file)];
      if (!type) {
        res.writeHead(404, headers).end("não encontrado");
        return;
      }
      if (file.endsWith("index.html")) {
        const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(body.toString("utf8"))?.[1];
        if (csp) headers["content-security-policy"] = `${csp}; frame-ancestors 'none'`;
      }
      res.writeHead(200, { ...headers, "content-type": type }).end(body);
    } catch {
      res.writeHead(404, headers).end("não encontrado");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, port] = process.argv.slice(2);
  if (!dir || !port) {
    console.error("uso: node scripts/serve.mjs <pasta> <porta>");
    process.exit(1);
  }
  createStaticServer(dir).listen(Number(port), "127.0.0.1", () => console.log(`Servindo ${dir} em http://127.0.0.1:${port}`));
}
