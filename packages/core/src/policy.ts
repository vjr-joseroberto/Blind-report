import { DEFAULT_MAX_BYTES, MAX_POLICY_BYTES } from "./limits.ts";
import type { NewsroomPolicy } from "./types.ts";

export type PolicyErrorCode = "json" | "categories" | "maxBytes" | "attachments" | "epoch";

export class PolicyError extends Error {
  constructor(public readonly code: PolicyErrorCode, message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

const CATEGORY_RE = /^[a-z0-9_-]{1,32}$/;
const MAX_CATEGORIES = 32;

/** Reads and validates the JSON of `denuncia.policy`. */
export function parsePolicy(text: string): NewsroomPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PolicyError("json", "The policy is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PolicyError("json", "The policy must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;

  const cats = o.categories;
  if (!Array.isArray(cats) || cats.length === 0) throw new PolicyError("categories", "The policy needs at least one category.");
  if (cats.length > MAX_CATEGORIES) throw new PolicyError("categories", `The policy accepts at most ${MAX_CATEGORIES} categories.`);
  for (const c of cats) {
    if (typeof c !== "string" || !CATEGORY_RE.test(c)) throw new PolicyError("categories", `Invalid category: ${JSON.stringify(c)}`);
  }
  if (new Set(cats).size !== cats.length) throw new PolicyError("categories", "Duplicate categories.");

  const maxBytes = o.maxBytes ?? DEFAULT_MAX_BYTES;
  if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_POLICY_BYTES) {
    throw new PolicyError("maxBytes", `maxBytes must be an integer between 1 and ${MAX_POLICY_BYTES}.`);
  }

  const attachments = o.attachments ?? false;
  if (typeof attachments !== "boolean") throw new PolicyError("attachments", "attachments must be true or false.");

  const epoch = o.epoch ?? "monthly";
  if (epoch !== "monthly") throw new PolicyError("epoch", 'Only the "monthly" epoch is supported.');

  return { categories: cats as string[], maxBytes, attachments, epoch: "monthly" };
}
