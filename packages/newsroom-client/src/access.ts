import { isNewsroomName } from "@safe-whistle/core";
import { NewsroomNotFoundError, RecordsError, type NewsroomInfo } from "@safe-whistle/ens-client";
import type { Address } from "viem";

export type Role = "admin" | "journalist" | "visitor";
export type VisitorReason = "newsroom_not_found" | "name_taken" | "newsroom_misconfigured" | "name_required" | "journalist_inactive" | "wrong_wallet" | "invalid_name";

export type Access =
  | { role: "admin"; newsroom: string }
  | { role: "journalist"; newsroom: string; journalistName: string }
  | { role: "visitor"; newsroom: string; reason: VisitorReason; message: string };

const LABEL_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

const visitor = (newsroom: string, reason: VisitorReason, message: string): Access => ({ role: "visitor", newsroom, reason, message });

/** Discovers the connected wallet's role, only with what ENS says. A network failure does not become a role: the exception propagates. */
export async function detectRole(a: {
  address: Address;
  newsroom: string;
  /** Journalist name (`maria` or `maria.newsroom.eth`); only needed for non-administrators. */
  journalist?: string;
  reader: { resolveNewsroom(name: string): Promise<Pick<NewsroomInfo, "custodian">>; journalistOwner(name: string): Promise<Address | null>; isNameAvailable?(name: string): Promise<boolean> };
}): Promise<Access> {
  const newsroom = a.newsroom;
  if (!isNewsroomName(newsroom)) return visitor(newsroom, "invalid_name", "Use the newsroom name in the format name.eth, in lowercase.");

  let custodian: string;
  try {
    custodian = (await a.reader.resolveNewsroom(newsroom)).custodian.toLowerCase();
  } catch (e) {
    if (e instanceof NewsroomNotFoundError) {
      // Only offers sign-up if the name is free. If it is already registered, the read may have failed or the name belongs to someone else.
      if (a.reader.isNameAvailable && /^[^.]+\.eth$/.test(newsroom) && !(await a.reader.isNameAvailable(newsroom))) {
        return visitor(newsroom, "name_taken", `The name ${newsroom} is already registered in ENS, but it does not have the data of a Safe Whistle newsroom (or the read failed just now). Try again in a moment; if the name belongs to someone else, choose another.`);
      }
      return visitor(newsroom, "newsroom_not_found", "This newsroom does not exist in ENS yet. If it is yours, register it now.");
    }
    if (e instanceof RecordsError) return visitor(newsroom, "newsroom_misconfigured", "The newsroom published invalid records in ENS. The administrator must fix them.");
    throw e;
  }
  if (a.address.toLowerCase() === custodian) return { role: "admin", newsroom };

  const raw = a.journalist?.trim().toLowerCase();
  if (!raw) return visitor(newsroom, "name_required", "This wallet is not the administrator's. If you are a journalist at the newsroom, enter your name (e.g.: maria).");
  const suffix = `.${newsroom}`;
  const label = raw.endsWith(suffix) ? raw.slice(0, -suffix.length) : raw;
  if (!LABEL_RE.test(label)) return visitor(newsroom, "invalid_name", `The journalist name must be like "maria" or "maria${suffix}".`);

  const journalistName = `${label}${suffix}`;
  const owner = await a.reader.journalistOwner(journalistName);
  if (owner === null) return visitor(newsroom, "journalist_inactive", `${journalistName} is not active in this newsroom (never registered or revoked). Talk to the administrator.`);
  if (owner.toLowerCase() !== a.address.toLowerCase()) return visitor(newsroom, "wrong_wallet", `${journalistName} belongs to another wallet. Switch accounts in your wallet and try again.`);
  return { role: "journalist", newsroom, journalistName };
}

/** Everything the dashboard does, so the code can refuse outside the role (the rule applies in code, not just on screen). */
export const ACTIONS = [
  "register_newsroom", "read_inbox", "decrypt", "set_status", "reply", "renew", "reader_key", "import_shared_keyring",
  "manage_team", "rotate_key", "edit_policy", "backup",
] as const;
export type Action = (typeof ACTIONS)[number];

const JOURNALIST_ACTIONS: readonly Action[] = ["read_inbox", "decrypt", "set_status", "reply", "renew", "reader_key", "import_shared_keyring"];

export function canDo(role: Role, action: Action): boolean {
  if (role === "admin") return true;
  if (role === "journalist") return JOURNALIST_ACTIONS.includes(action);
  return action === "register_newsroom";
}
