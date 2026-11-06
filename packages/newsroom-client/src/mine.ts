import { isNewsroomName } from "@safe-whistle/core";
import { NewsroomNotFoundError, RecordsError, type NewsroomInfo } from "@safe-whistle/ens-client";
import type { Address } from "viem";

/**
 * Newsrooms administered by this wallet: takes part of the labels found in the registry events and confirms each one in ENS
 * (it has the Safe Whistle records and the custodian is the wallet). Failures become "incomplete", never a role.
 */
export async function listAdministered(a: {
  address: Address;
  find: () => Promise<{ labels: string[]; incomplete: boolean }>;
  reader: { resolveNewsroom(name: string): Promise<Pick<NewsroomInfo, "custodian">> };
}): Promise<{ newsrooms: string[]; incomplete: boolean }> {
  let found: { labels: string[]; incomplete: boolean };
  try {
    found = await a.find();
  } catch {
    return { newsrooms: [], incomplete: true };
  }
  let incomplete = found.incomplete;
  const newsrooms: string[] = [];
  for (const label of new Set(found.labels)) {
    const name = `${label}.eth`;
    if (!isNewsroomName(name)) continue;
    try {
      const info = await a.reader.resolveNewsroom(name);
      if (info.custodian.toLowerCase() === a.address.toLowerCase()) newsrooms.push(name);
    } catch (e) {
      if (!(e instanceof NewsroomNotFoundError || e instanceof RecordsError)) incomplete = true;
    }
  }
  return { newsrooms, incomplete };
}
