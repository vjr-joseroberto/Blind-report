import { HostNotAllowedError } from "./errors.ts";
import { isAllowed, type NetworkPolicy } from "./policy.ts";

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Wraps a `fetch`: refuses hosts outside the policy before any call. */
export function guardedFetch(policy: NetworkPolicy, base: typeof fetch = globalThis.fetch): typeof fetch {
  return async (input, init) => {
    const url = urlOf(input);
    if (!isAllowed(policy, url)) {
      let host = url;
      try {
        host = new URL(url).hostname;
      } catch {
        /* invalid url: returns the original text in the error */
      }
      throw new HostNotAllowedError(host, url);
    }
    return base(input, init);
  };
}
