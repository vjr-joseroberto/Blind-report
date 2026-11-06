import type { NetworkPolicy } from "./policy.ts";

/** Gera a política de segurança de conteúdo a partir dos hosts declarados. Sem curingas e sem scripts inline. */
export function cspFor(policy: NetworkPolicy): string {
  const connect = ["'self'", ...policy.hosts.map((h) => `https://${h}`)];
  if (policy.allowLocalhost) connect.push("http://localhost:*", "http://127.0.0.1:*");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'", // o libsodium usa WebAssembly
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
