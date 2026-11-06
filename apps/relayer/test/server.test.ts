import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpServer, createRelayerApp } from "../src/index.ts";
import { makeDeps } from "./helpers.ts";

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
  vi.restoreAllMocks();
});

async function start(over: Parameters<typeof makeDeps>[0] = {}) {
  const f = makeDeps(over);
  const server = await createHttpServer({ handler: createRelayerApp(f.deps), maxBodyBytes: f.deps.maxBodyBytes, host: "127.0.0.1", port: 0 });
  close = server.close;
  return { f, url: `http://127.0.0.1:${server.port}` };
}

describe("HTTP adapter (node:http)", () => {
  it("serves_health_and_the_unknown_route", async () => {
    const { url } = await start();
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/nada`)).status).toBe(404);
  });

  it("rejects_body_above_maximum_with_413", async () => {
    const { url } = await start({ maxBodyBytes: 200 });
    const r = await fetch(`${url}/submissions`, { method: "POST", body: "x".repeat(5000), headers: { "content-type": "application/json" } });
    expect(r.status).toBe(413);
  });

  it("passes_the_body_and_headers_to_the_handler", async () => {
    const { url } = await start({ allowedOrigins: ["https://app.example.org"] });
    const r = await fetch(`${url}/health`, { headers: { origin: "https://app.example.org" } });
    expect(r.headers.get("access-control-allow-origin")).toBe("https://app.example.org");
  });

  it("prints_nothing_to_the_console_and_logs_neither_ip_nor_body", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const { url, f } = await start();
    await fetch(`${url}/submissions`, { method: "POST", body: "CORPO-SECRETO-DA-FONTE", headers: { "x-forwarded-for": "203.0.113.9" } });
    await fetch(`${url}/health`);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    const text = JSON.stringify(f.logs);
    expect(text).not.toContain("CORPO-SECRETO");
    expect(text).not.toContain("203.0.113.9");
    expect(text).not.toContain("127.0.0.1");
  });

  it("closes_cleanly", async () => {
    const { url } = await start();
    await close!();
    close = undefined;
    await expect(fetch(`${url}/health`)).rejects.toThrow();
  });
});
