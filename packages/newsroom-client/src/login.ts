import { verifyMessage, type Address, type Hex } from "viem";

export type Challenge = { message: string; nonce: string; address: Address; domain: string; issuedAt: number; expiresAt: number };
export type LoginResult = { ok: true } | { ok: false; reason: "expired" | "reused" | "unknown" | "bad_signature" };

const DEFAULT_TTL_SECONDS = 300;

/** Sign-in with the wallet: the person signs a text (no gas, no transaction) that proves control of the address. The newsroom is chosen afterwards. */
export function createLogin(opts: { now: () => Date; ttlSeconds?: number; random?: (n: number) => Uint8Array }) {
  const ttl = (opts.ttlSeconds ?? DEFAULT_TTL_SECONDS) * 1000;
  const random = opts.random ?? ((n) => globalThis.crypto.getRandomValues(new Uint8Array(n)));
  const pending = new Map<string, Challenge>();
  const used = new Set<string>();

  return {
    challenge(a: { domain: string; address: Address }): Challenge {
      const nonce = "0x" + [...random(16)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const issuedAt = opts.now().getTime();
      const expiresAt = issuedAt + ttl;
      const message = [
        "Safe Whistle — sign in to the newsroom dashboard",
        "",
        `Site: ${a.domain}`,
        `Address: ${a.address}`,
        `Number: ${nonce}`,
        `Issued at: ${new Date(issuedAt).toISOString()}`,
        `Valid until: ${new Date(expiresAt).toISOString()}`,
        "",
        "This signature costs no gas and does not authorize any transaction.",
      ].join("\n");
      const c: Challenge = { message, nonce, address: a.address, domain: a.domain, issuedAt, expiresAt };
      pending.set(nonce, c);
      return c;
    },

    async verify(nonce: string, signature: Hex): Promise<LoginResult> {
      if (used.has(nonce)) return { ok: false, reason: "reused" };
      const c = pending.get(nonce);
      if (!c) return { ok: false, reason: "unknown" };
      if (opts.now().getTime() > c.expiresAt) return { ok: false, reason: "expired" };
      let valid = false;
      try {
        valid = await verifyMessage({ address: c.address, message: c.message, signature });
      } catch {
        valid = false;
      }
      if (!valid) return { ok: false, reason: "bad_signature" };
      used.add(nonce);
      pending.delete(nonce);
      return { ok: true };
    },
  };
}
