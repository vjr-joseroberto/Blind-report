import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// @ts-expect-error módulo JavaScript
import { createStaticServer } from "../../scripts/serve.mjs";

let url = "";
let close: () => void;
beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "sw-serve-"));
  writeFileSync(join(dir, "index.html"), '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">oi');
  writeFileSync(join(dir, "app.js"), "1");
  writeFileSync(join(dir, "segredo.txt"), "x");
  const server = createStaticServer(dir);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

describe("servidor estático das telas", () => {
  it("serve_o_index_com_csp_em_cabecalho_e_sem_cache", async () => {
    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-security-policy")).toBe("default-src 'self'; frame-ancestors 'none'");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("serve_js_com_o_tipo_certo", async () => {
    expect((await fetch(`${url}/app.js`)).headers.get("content-type")).toContain("javascript");
  });

  it("recusa_saida_da_pasta_e_tipos_desconhecidos", async () => {
    expect((await fetch(`${url}/..%2F..%2Fetc%2Fpasswd`)).status).toBeGreaterThanOrEqual(403);
    expect((await fetch(`${url}/segredo.txt`)).status).toBe(404);
    expect((await fetch(`${url}/nao-existe.js`)).status).toBe(404);
  });
});
