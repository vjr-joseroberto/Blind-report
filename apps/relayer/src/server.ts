import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { HttpRequest, HttpResponse } from "./types.ts";

type Handler = { handle(req: HttpRequest): Promise<HttpResponse> };

const tooLarge = JSON.stringify({ error: { code: "body_too_large", message: "O corpo da requisição é grande demais." } });

/** Adaptador mínimo de node:http. Não registra nada: nem IP, nem cabeçalhos, nem corpo. */
export async function createHttpServer(opts: { handler: Handler; maxBodyBytes: number; host: string; port: number }): Promise<{ port: number; close: () => Promise<void> }> {
  const reply = (res: ServerResponse, r: HttpResponse) => {
    res.writeHead(r.status, r.headers);
    res.end(r.body);
  };

  const readBody = (req: IncomingMessage): Promise<Uint8Array | null> =>
    new Promise((resolve, reject) => {
      const declared = Number(req.headers["content-length"] ?? 0);
      if (declared > opts.maxBodyBytes) return resolve(null);
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > opts.maxBodyBytes) {
          chunks.length = 0;
          resolve(null);
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
      req.on("error", reject);
    });

  const server = createServer(async (req, res) => {
    try {
      const body = await readBody(req);
      if (body === null) {
        res.writeHead(413, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", connection: "close" });
        res.end(tooLarge, () => req.destroy());
        return;
      }
      const url = new URL(req.url ?? "/", "http://relayer.local");
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers[k.toLowerCase()] = v;
      reply(res, await opts.handler.handle({ method: (req.method ?? "GET").toUpperCase(), path: url.pathname, query: url.searchParams, headers, body }));
    } catch {
      if (!res.headersSent) reply(res, { status: 500, headers: { "content-type": "application/json" }, body: JSON.stringify({ error: { code: "internal", message: "Erro interno." } }) });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;

  await new Promise<void>((resolve) => server.listen(opts.port, opts.host, resolve));
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
