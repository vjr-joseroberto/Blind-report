import { describe, expect, it } from "vitest";
import { addressLink, firstSteps, txLink } from "../src/links.ts";
import { SEPOLIA_SPEC } from "../src/wallet.ts";

const H = "0x" + "ab".repeat(32);
const A = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";

describe("blockchain links", () => {
  it("builds_transaction_and_address_links_from_the_network_explorer", () => {
    expect(txLink(SEPOLIA_SPEC, H)).toBe(`https://sepolia.etherscan.io/tx/${H}`);
    expect(addressLink(SEPOLIA_SPEC, A)).toBe(`https://sepolia.etherscan.io/address/${A}`);
  });

  it("without_an_explorer_returns_no_link", () => {
    expect(txLink({ ...SEPOLIA_SPEC, blockExplorerUrls: [] }, H)).toBeUndefined();
  });

  it("rejects_malformed_hash_and_address", () => {
    expect(txLink(SEPOLIA_SPEC, "0x12")).toBeUndefined();
    expect(addressLink(SEPOLIA_SPEC, "javascript:alert(1)")).toBeUndefined();
  });

  it("does_not_duplicate_the_explorer_trailing_slash", () => {
    expect(txLink({ ...SEPOLIA_SPEC, blockExplorerUrls: ["https://x.example.org/"] }, H)).toBe(`https://x.example.org/tx/${H}`);
  });
});

describe("first-steps guide", () => {
  it("administrator_without_keys_sees_the_next_step", () => {
    const steps = firstSteps("admin", { keysLoaded: false, backupDone: false, inboxLoaded: false });
    expect(steps.map((s) => [s.id, s.done])).toEqual([["wallet", true], ["keys", false], ["backup", false]]);
    expect(steps.find((s) => !s.done)!.id).toBe("keys");
  });

  it("administrator_with_everything_done_finishes_the_guide", () => {
    expect(firstSteps("admin", { keysLoaded: true, backupDone: true, inboxLoaded: true, teamAdded: true }).every((s) => s.done)).toBe(true);
  });

  it("journalist_needs_to_generate_the_key_and_import_the_keyring", () => {
    const steps = firstSteps("journalist", { keysLoaded: false, backupDone: false, inboxLoaded: false });
    expect(steps.map((s) => s.id)).toEqual(["wallet", "reader_key", "keyring"]);
    expect(firstSteps("journalist", { keysLoaded: true, backupDone: false, inboxLoaded: false, readerKeyMade: true }).every((s) => s.done)).toBe(true);
  });

  it("visitor_has_no_guide", () => {
    expect(firstSteps("visitor", { keysLoaded: false, backupDone: false, inboxLoaded: false })).toEqual([]);
  });
});
