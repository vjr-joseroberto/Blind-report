import { describe, expect, it, vi } from "vitest";
import { InvalidNameError, createAuthority, createReader, type EnsReadClient } from "../src/index.ts";

const NEWSROOM = "investiga.eth";
const ADMIN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const MARIA = "0xa63A63047e362EE0B8af09489DCA1dc172E507ca";
const STRANGER = "0x9999999999999999999999999999999999999999";
const ZERO = "0x0000000000000000000000000000000000000000";

function stubReader(owners: Record<string, string | null>, custodian = ADMIN) {
  return {
    resolveNewsroom: vi.fn(async (name: string) => ({ name, custodian }) as never),
    journalistOwner: vi.fn(async (name: string) => (owners[name] ?? null) as `0x${string}` | null),
  };
}

describe("journalistOwner (reader)", () => {
  const client = (owner: string, subregistry = "0x1111111111111111111111111111111111111111"): EnsReadClient => ({
    getEnsText: vi.fn(async () => null),
    getEnsAddress: vi.fn(async () => ADMIN as never),
    readContract: vi.fn(async (a) => (a.functionName === "getSubregistry" ? subregistry : owner)),
  });

  it("returns_the_owner_of_the_active_subname", async () => {
    expect(await createReader({ client: client(MARIA) }).journalistOwner(`maria.${NEWSROOM}`)).toBe(MARIA);
  });

  it("returns_null_if_there_is_no_owner_or_registry", async () => {
    expect(await createReader({ client: client(ZERO) }).journalistOwner(`maria.${NEWSROOM}`)).toBeNull();
    expect(await createReader({ client: client(MARIA, ZERO) }).journalistOwner(`maria.${NEWSROOM}`)).toBeNull();
  });

  it("rejects_name_that_is_not_a_journalist", async () => {
    await expect(createReader({ client: client(MARIA) }).journalistOwner("investiga.eth")).rejects.toBeInstanceOf(InvalidNameError);
  });

  it("isActiveJournalist_still_holds", async () => {
    expect(await createReader({ client: client(MARIA) }).isActiveJournalist(`maria.${NEWSROOM}`)).toBe(true);
    expect(await createReader({ client: client(ZERO) }).isActiveJournalist(`maria.${NEWSROOM}`)).toBe(false);
  });
});

describe("newsroom authority (A2)", () => {
  const make = (owners: Record<string, string | null> = { [`maria.${NEWSROOM}`]: MARIA }, custodian = ADMIN) => {
    const reader = stubReader(owners, custodian);
    return { reader, authority: createAuthority({ reader, newsroom: NEWSROOM }) };
  };

  it("administrator_counts_without_name", async () => {
    expect(await make().authority.isAuthorized({ creator: ADMIN as never })).toBe(true);
  });

  it("administrator_counts_even_with_the_address_in_another_case", async () => {
    expect(await make().authority.isAuthorized({ creator: ADMIN.toLowerCase() as never, authorName: "qualquer.investiga.eth" })).toBe(true);
  });

  it("active_journalist_with_correct_owner_counts", async () => {
    expect(await make().authority.isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` })).toBe(true);
  });

  it("journalist_name_with_owner_different_from_creator_does_not_count", async () => {
    expect(await make().authority.isAuthorized({ creator: STRANGER as never, authorName: `maria.${NEWSROOM}` })).toBe(false);
  });

  it("subname_from_another_newsroom_does_not_count", async () => {
    const { authority, reader } = make({ "maria.outra.eth": STRANGER });
    expect(await authority.isAuthorized({ creator: STRANGER as never, authorName: "maria.outra.eth" })).toBe(false);
    expect(reader.journalistOwner).not.toHaveBeenCalled();
  });

  it("revoked_journalist_does_not_count", async () => {
    expect(await make({ [`maria.${NEWSROOM}`]: null }).authority.isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` })).toBe(false);
  });

  it("without_name_and_creator_different_from_custodian_does_not_count", async () => {
    expect(await make().authority.isAuthorized({ creator: MARIA as never })).toBe(false);
  });

  it("malformed_name_or_with_extra_levels_does_not_count", async () => {
    const { authority } = make();
    for (const authorName of ["maria", "a.b.investiga.eth", `.${NEWSROOM}`, `Maria.${NEWSROOM}`]) {
      expect(await authority.isAuthorized({ creator: MARIA as never, authorName }), authorName).toBe(false);
    }
  });

  it("queries_ens_once_per_name_and_the_custodian_once", async () => {
    const { authority, reader } = make();
    for (let i = 0; i < 3; i++) await authority.isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` });
    await authority.isAuthorized({ creator: ADMIN as never });
    expect(reader.journalistOwner).toHaveBeenCalledTimes(1);
    expect(reader.resolveNewsroom).toHaveBeenCalledTimes(1);
  });

  it("network_failure_does_not_become_authorized", async () => {
    const reader = stubReader({});
    reader.journalistOwner.mockRejectedValueOnce(new Error("rpc fora"));
    await expect(createAuthority({ reader, newsroom: NEWSROOM }).isAuthorized({ creator: MARIA as never, authorName: `maria.${NEWSROOM}` })).rejects.toThrow();
  });

  it("rejects_invalid_newsroom_name", () => {
    expect(() => createAuthority({ reader: stubReader({}), newsroom: "Invalida" })).toThrow(InvalidNameError);
  });
});
