import type { NetworkPolicy } from "./policy.ts";

/** Generates the content security policy from the declared hosts. No wildcards and no inline scripts. */
export function cspFor(policy: NetworkPolicy): string {
  const connect = ["'self'", ...policy.hosts.map((h) => `https://${h}`)];
  if (policy.allowLocalhost) connect.push("http://localhost:*", "http://127.0.0.1:*");
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'", // libsodium uses WebAssembly
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
