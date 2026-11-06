import { isNewsroomName } from "@safe-whistle/core";
import type { Address } from "viem";
import { InvalidNameError } from "./errors.ts";
import type { NewsroomInfo } from "./records.ts";

/** Whoever wrote an annotation or reply: `creator` comes from the chain; `authorName` is only a claim. */
export type AuthorClaim = { creator: Address; authorName?: string };

const JOURNALIST_LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/**
 * Authority of a newsroom: the administrator (custodian in ENS) or an active journalist,
 * that is, the owner of an active subname of the newsroom. Queries ENS once per name and the custodian once.
 * Create one per read operation: the result reflects the ENS state at that moment.
 */
export function createAuthority(opts: {
  reader: { resolveNewsroom(name: string): Promise<Pick<NewsroomInfo, "custodian">>; journalistOwner(name: string): Promise<Address | null> };
  newsroom: string;
}) {
  if (!isNewsroomName(opts.newsroom)) throw new InvalidNameError(opts.newsroom, "expected a lowercase .eth name");
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
