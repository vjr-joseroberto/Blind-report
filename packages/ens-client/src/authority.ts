import { isNewsroomName } from "@safe-whistle/core";
import type { Address } from "viem";
import { InvalidNameError } from "./errors.ts";
import type { NewsroomInfo } from "./records.ts";

/** Quem escreveu uma anotação ou resposta: `creator` vem da cadeia; `authorName` é só uma declaração. */
export type AuthorClaim = { creator: Address; authorName?: string };

const JOURNALIST_LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Autoridade de uma redação: o administrador (custodiante no ENS) ou um jornalista ativo,
 * isto é, dono de um subnome ativo da redação. Consulta o ENS uma vez por nome e o custodiante uma vez.
 * Crie uma por operação de leitura: o resultado reflete o estado do ENS naquele momento.
 */
export function createAuthority(opts: {
  reader: { resolveNewsroom(name: string): Promise<Pick<NewsroomInfo, "custodian">>; journalistOwner(name: string): Promise<Address | null> };
  newsroom: string;
}) {
  if (!isNewsroomName(opts.newsroom)) throw new InvalidNameError(opts.newsroom, "esperado um nome .eth em minúsculas");
  const suffix = `.${opts.newsroom}`;
  let custodian: Promise<string> | undefined;
  const owners = new Map<string, Promise<Address | null>>();

  return {
    async isAuthorized(claim: AuthorClaim): Promise<boolean> {
      custodian ??= opts.reader.resolveNewsroom(opts.newsroom).then((i) => i.custodian.toLowerCase());
      const creator = claim.creator.toLowerCase();
      if (creator === (await custodian)) return true;
      const name = claim.authorName;
      if (name === undefined || !name.endsWith(suffix)) return false;
      const label = name.slice(0, -suffix.length);
      if (!JOURNALIST_LABEL_RE.test(label)) return false;
      if (!owners.has(name)) owners.set(name, opts.reader.journalistOwner(name));
      const owner = await owners.get(name)!;
      return owner !== null && owner.toLowerCase() === creator;
    },
  };
}

export type Authority = ReturnType<typeof createAuthority>;
