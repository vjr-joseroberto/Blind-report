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

/** Lê e valida o JSON de `denuncia.policy`. */
export function parsePolicy(text: string): NewsroomPolicy {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new PolicyError("json", "A política não é um JSON válido.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new PolicyError("json", "A política deve ser um objeto JSON.");
  }
  const o = raw as Record<string, unknown>;

  const cats = o.categories;
  if (!Array.isArray(cats) || cats.length === 0) throw new PolicyError("categories", "A política precisa de ao menos uma categoria.");
  if (cats.length > MAX_CATEGORIES) throw new PolicyError("categories", `A política aceita no máximo ${MAX_CATEGORIES} categorias.`);
  for (const c of cats) {
    if (typeof c !== "string" || !CATEGORY_RE.test(c)) throw new PolicyError("categories", `Categoria inválida: ${JSON.stringify(c)}`);
  }
  if (new Set(cats).size !== cats.length) throw new PolicyError("categories", "Categorias repetidas.");

  const maxBytes = o.maxBytes ?? DEFAULT_MAX_BYTES;
  if (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_POLICY_BYTES) {
    throw new PolicyError("maxBytes", `maxBytes deve ser um inteiro entre 1 e ${MAX_POLICY_BYTES}.`);
  }

  const attachments = o.attachments ?? false;
  if (typeof attachments !== "boolean") throw new PolicyError("attachments", "attachments deve ser verdadeiro ou falso.");

  const epoch = o.epoch ?? "monthly";
  if (epoch !== "monthly") throw new PolicyError("epoch", 'Só a época "monthly" é suportada.');

  return { categories: cats as string[], maxBytes, attachments, epoch: "monthly" };
}
