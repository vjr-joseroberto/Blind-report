import { createLogin } from "@safe-whistle/newsroom-client";
import { NewsroomNotFoundError } from "@safe-whistle/ens-client";
import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSession } from "../src/session.ts";
import { SEPOLIA_SPEC, createWallet } from "../src/wallet.ts";
import { fakeWallet } from "./fake-provider.ts";

const NOW = new Date("2026-11-10T12:00:00Z");
const NR = "investiga.eth";
const admin = privateKeyToAccount(generatePrivateKey());
const maria = privateKeyToAccount(generatePrivateKey());

function make(account = admin, over: { resolve?: () => Promise<unknown>; owners?: Record<string, string | null> } = {}) {
  const w = fakeWallet({ account, chainId: "0x1" });
  const reader = {
    resolveNewsroom: vi.fn(over.resolve ?? (async () => ({ custodian: admin.address }) as never)) as never,
    journalistOwner: vi.fn(async (n: string) => (over.owners ?? { [`maria.${NR}`]: maria.address })[n] ?? null) as never,
  };
  const session = createSession({ wallet: createWallet(w.provider), login: createLogin({ now: () => NOW }), reader, domain: "127.0.0.1:5174", chain: SEPOLIA_SPEC });
  return { w, session, reader };
}

describe("panel session", () => {
  it("administrator_connects_signs_and_enters_as_admin", async () => {
    const { w, session } = make();
    const states: string[] = [];
    session.subscribe((s) => states.push(s.status));
    await session.connect();
    expect(session.state).toMatchObject({ status: "connected", address: admin.address });
    expect(session.state.access).toBeUndefined();
    await session.choose({ newsroom: NR });
    expect(session.state).toMatchObject({ status: "ready", address: admin.address, access: { role: "admin", newsroom: NR } });
    expect(states).toEqual(["connecting", "signing", "connected", "ready"]);
    expect(w.state.chainId).toBe("0xaa36a7");
  });

  it("journalist_gives_the_name_and_enters_as_journalist", async () => {
    const { session } = make(maria);
    await session.connect();
    await session.choose({ newsroom: NR, journalist: "maria" });
    expect(session.state.access).toEqual({ role: "journalist", newsroom: NR, journalistName: `maria.${NR}` });
  });

  it("third_wallet_enters_as_visitor_with_the_cause", async () => {
    const { session } = make(privateKeyToAccount(generatePrivateKey()));
    await session.connect();
    await session.choose({ newsroom: NR });
    expect(session.state.status).toBe("ready");
    expect(session.state.access).toMatchObject({ role: "visitor", reason: "name_required" });
  });

  it("nonexistent_newsroom_allows_registration", async () => {
    const { session } = make(admin, { resolve: async () => { throw new NewsroomNotFoundError(NR); } });
    await session.connect();
    await session.choose({ newsroom: NR });
    expect(session.state.access).toMatchObject({ role: "visitor", reason: "newsroom_not_found" });
  });

  it("rejection_in_the_wallet_becomes_a_clear_error_and_does_not_enter", async () => {
    const w = fakeWallet({ account: admin, reject: ["personal_sign"] });
    const session = createSession({ wallet: createWallet(w.provider), login: createLogin({ now: () => NOW }), reader: { resolveNewsroom: vi.fn(), journalistOwner: vi.fn() } as never, domain: "x", chain: SEPOLIA_SPEC });
    await session.connect();
    expect(session.state).toMatchObject({ status: "error", error: { code: "user_rejected" } });
    expect(session.state.access).toBeUndefined();
  });

  it("network_failure_querying_ens_becomes_an_error_and_not_a_role", async () => {
    const { session } = make(admin, { resolve: async () => { throw new Error("rpc down"); } });
    await session.connect();
    await session.choose({ newsroom: NR });
    expect(session.state).toMatchObject({ status: "connected", error: { code: "network" } });
    expect(session.state.access).toBeUndefined();
  });

  it("account_change_in_the_wallet_ends_the_session", async () => {
    const { w, session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    w.emit("accountsChanged", [maria.address]);
    expect(session.state).toMatchObject({ status: "idle", error: { code: "account_changed" } });
    expect(session.state.access).toBeUndefined();
  });

  it("same_account_in_the_event_does_not_end_it", async () => {
    const { w, session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    w.emit("accountsChanged", [admin.address.toLowerCase()]);
    expect(session.state.status).toBe("ready");
  });

  it("disconnecting_clears_everything_and_stops_watching", async () => {
    const { w, session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    session.disconnect();
    expect(session.state).toEqual({ status: "idle" });
    expect(w.listenerCount("accountsChanged")).toBe(0);
  });

  it("refresh_reevaluates_the_role_after_registering_the_newsroom", async () => {
    let exists = false;
    const { session } = make(admin, { resolve: async () => { if (!exists) throw new NewsroomNotFoundError(NR); return { custodian: admin.address } as never; } });
    await session.connect();
    await session.choose({ newsroom: NR });
    exists = true;
    await session.refresh();
    expect(session.state.access).toEqual({ role: "admin", newsroom: NR });
  });

  it("refresh_without_a_session_is_ignored", async () => {
    const { session } = make();
    await session.refresh();
    expect(session.state).toEqual({ status: "idle" });
  });

  it("connecting_does_not_require_a_newsroom_and_you_can_choose_later_or_switch_without_signing_again", async () => {
    const { w, session, reader } = make();
    await session.connect();
    const signs = () => w.calls.filter((c) => c.method === "personal_sign").length;
    expect(signs()).toBe(1);
    await session.choose({ newsroom: "uma.eth" });
    await session.choose({ newsroom: NR });
    expect(session.state.access).toEqual({ role: "admin", newsroom: NR });
    expect(signs()).toBe(1);
    expect(reader.resolveNewsroom).toHaveBeenCalledTimes(2);
  });

  it("leaving_the_newsroom_returns_to_choosing_while_keeping_the_wallet", async () => {
    const { session } = make();
    await session.connect();
    await session.choose({ newsroom: NR });
    session.leaveNewsroom();
    expect(session.state).toEqual({ status: "connected", address: admin.address });
  });

  it("choosing_before_connecting_is_ignored", async () => {
    const { session, reader } = make();
    await session.choose({ newsroom: NR });
    expect(session.state).toEqual({ status: "idle" });
    expect(reader.resolveNewsroom).not.toHaveBeenCalled();
  });

  it("refresh_with_network_failure_keeps_the_session_and_the_role_and_shows_the_error", async () => {
    let fail = false;
    const { session } = make(admin, { resolve: async () => { if (fail) throw new Error("rpc down"); return { custodian: admin.address } as never; } });
    await session.connect();
    await session.choose({ newsroom: NR });
    fail = true;
    await session.refresh();
    expect(session.state).toMatchObject({ status: "ready", access: { role: "admin", newsroom: NR }, error: { code: "network" } });
  });

  it("refresh_that_works_clears_the_previous_error", async () => {
    let fail = true;
    const { session } = make(admin, { resolve: async () => { if (fail) throw new Error("rpc down"); return { custodian: admin.address } as never; } });
    await session.connect();
    await session.choose({ newsroom: NR }); // fails: stays connected, without a newsroom
    fail = false;
    await session.choose({ newsroom: NR });
    expect(session.state.error).toBeUndefined();
    await session.refresh();
    expect(session.state.error).toBeUndefined();
  });
});
