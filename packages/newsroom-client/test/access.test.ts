import { describe, expect, it, vi } from "vitest";
import { NewsroomNotFoundError, RecordsError } from "@safe-whistle/ens-client";
import { ACTIONS, canDo, detectRole } from "../src/index.ts";

const ADMIN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const MARIA = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca";
const STRANGER = "0x9999999999999999999999999999999999999999";
const NR = "investiga.eth";

function reader(over: { owners?: Record<string, string | null>; resolve?: () => Promise<unknown>; available?: boolean | Error } = {}) {
  return {
    resolveNewsroom: vi.fn(over.resolve ?? (async () => ({ custodian: ADMIN }) as never)) as never,
    journalistOwner: vi.fn(async (n: string) => (over.owners ?? { [`maria.${NR}`]: MARIA })[n] ?? null) as never,
    isNameAvailable: vi.fn(async () => { if (over.available instanceof Error) throw over.available; return over.available ?? true; }) as never,
  };
}
const detect = (address: string, journalist?: string, r = reader()) => detectRole({ address: address as never, newsroom: NR, journalist, reader: r });

describe("role of whoever connected the wallet", () => {
  it("newsroom_custodian_is_administrator_ignoring_case", async () => {
    expect(await detect(ADMIN)).toEqual({ role: "admin", newsroom: NR });
    expect((await detect(ADMIN.toLowerCase())).role).toBe("admin");
  });

  it("active_subname_owner_is_journalist_with_short_or_full_name", async () => {
    expect(await detect(MARIA, "maria")).toEqual({ role: "journalist", newsroom: NR, journalistName: `maria.${NR}` });
    expect((await detect(MARIA, ` Maria.${NR} `)).role).toBe("journalist");
  });

  it("administrator_does_not_need_to_enter_a_name", async () => {
    const r = reader();
    expect((await detect(ADMIN, "maria", r)).role).toBe("admin");
    expect((r as any).journalistOwner).not.toHaveBeenCalled();
  });

  it("strange_wallet_without_name_asks_for_the_name", async () => {
    expect(await detect(STRANGER)).toMatchObject({ role: "visitor", reason: "name_required" });
  });

  it("wallet_different_from_the_subname_owner_is_visitor", async () => {
    expect(await detect(STRANGER, "maria")).toMatchObject({ role: "visitor", reason: "wrong_wallet" });
  });

  it("revoked_or_nonexistent_journalist_is_visitor", async () => {
    expect(await detect(MARIA, "joao")).toMatchObject({ role: "visitor", reason: "journalist_inactive" });
  });

  it("journalist_name_from_another_newsroom_or_malformed_is_refused_without_querying_ens", async () => {
    const r = reader();
    for (const j of ["maria.outra.eth", "a.b.investiga.eth", "Mar ia", "maria!"]) expect(await detect(MARIA, j, r), j).toMatchObject({ role: "visitor", reason: "invalid_name" });
    expect((r as any).journalistOwner).not.toHaveBeenCalled();
  });

  it("name_already_registered_in_ens_without_safe_whistle_data_does_not_offer_sign_up", async () => {
    const r = reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); }, available: false });
    const v = await detect(ADMIN, undefined, r);
    expect(v).toMatchObject({ role: "visitor", reason: "name_taken" });
    expect(v.role === "visitor" && v.message).toMatch(/already registered/i);
  });

  it("free_name_offers_sign_up_and_so_does_without_the_availability_query", async () => {
    expect(await detect(ADMIN, undefined, reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); }, available: true }))).toMatchObject({ reason: "newsroom_not_found" });
    const noCheck = { resolveNewsroom: vi.fn(async () => { throw new NewsroomNotFoundError(NR); }) as never, journalistOwner: vi.fn() as never };
    expect(await detect(ADMIN, undefined, noCheck as never)).toMatchObject({ reason: "newsroom_not_found" });
  });

  it("failure_querying_availability_does_not_become_a_role", async () => {
    await expect(detect(ADMIN, undefined, reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); }, available: new Error("rpc down") }))).rejects.toThrow();
  });

  it("nonexistent_newsroom_or_with_invalid_records_is_visitor_with_cause", async () => {
    expect(await detect(ADMIN, undefined, reader({ resolve: async () => { throw new NewsroomNotFoundError(NR); } }))).toMatchObject({ role: "visitor", reason: "newsroom_not_found" });
    expect(await detect(ADMIN, undefined, reader({ resolve: async () => { throw new RecordsError("pubkey", "x"); } }))).toMatchObject({ role: "visitor", reason: "newsroom_misconfigured" });
  });

  it("invalid_newsroom_name_is_visitor", async () => {
    expect(await detectRole({ address: ADMIN as never, newsroom: "Invalida", reader: reader() })).toMatchObject({ role: "visitor", reason: "invalid_name" });
  });

  it("network_failure_does_not_become_a_role", async () => {
    await expect(detect(ADMIN, undefined, reader({ resolve: async () => { throw new Error("rpc down"); } }))).rejects.toThrow();
  });

  it("every_visitor_brings_a_message_with_what_to_do", async () => {
    const v = await detect(STRANGER);
    expect(v.role === "visitor" && v.message.length).toBeGreaterThan(10);
  });
});

describe("permissions by role", () => {
  const adminOnly = ["register_newsroom_admin_ops", "manage_team", "rotate_key", "edit_policy", "backup"] as const;

  it("administrator_can_do_everything", () => {
    for (const a of ACTIONS) expect(canDo("admin", a), a).toBe(true);
  });

  it("journalist_reads_annotates_replies_and_renews_but_does_not_administer", () => {
    for (const a of ["read_inbox", "decrypt", "set_status", "reply", "renew", "reader_key", "import_shared_keyring"] as const) expect(canDo("journalist", a), a).toBe(true);
    for (const a of ["manage_team", "rotate_key", "edit_policy", "backup"] as const) expect(canDo("journalist", a), a).toBe(false);
  });

  it("visitor_can_do_nothing_beyond_registering_the_newsroom_that_does_not_exist", () => {
    for (const a of ACTIONS) expect(canDo("visitor", a), a).toBe(a === "register_newsroom");
    void adminOnly;
  });
});
