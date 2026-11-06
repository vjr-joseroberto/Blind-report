import { ENS_KEYS, toBase64Url } from "@safe-whistle/core";
import { describe, expect, it, vi } from "vitest";
import { InvalidNameError, NewsroomNotFoundError, RecordsError, createReader, type EnsReadClient } from "../src/index.ts";

const UR = "0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe";
const KEY = new Uint8Array(32).fill(9);
const ZERO = "0x0000000000000000000000000000000000000000";
const CUSTODIAN = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const SUBREGISTRY = "0x1111111111111111111111111111111111111111";

function fakeClient(texts: Record<string, string | null>, opts: { address?: string | null; subregistry?: string; owner?: string; available?: boolean } = {}) {
  const calls: { fn: string; args: unknown }[] = [];
  const client: EnsReadClient = {
    getEnsText: vi.fn(async (a) => {
      calls.push({ fn: "getEnsText", args: a });
      return texts[`${a.name}|${a.key}`] ?? null;
    }),
    getEnsAddress: vi.fn(async (a) => {
      calls.push({ fn: "getEnsAddress", args: a });
      return (opts.address === undefined ? CUSTODIAN : opts.address) as `0x${string}` | null;
    }),
    readContract: vi.fn(async (a) => {
      calls.push({ fn: `readContract:${a.functionName}`, args: a });
      if (a.functionName === "getSubregistry") return opts.subregistry ?? SUBREGISTRY;
      if (a.functionName === "findOwner") return opts.owner ?? CUSTODIAN;
      if (a.functionName === "isAvailable") return opts.available ?? true;
      throw new Error("unexpected call");
    }),
  };
  return { client, calls };
}

const newsroomTexts = (name = "investiga.jornal.eth") => ({
  [`${name}|${ENS_KEYS.pubkey}`]: toBase64Url(KEY),
  [`${name}|${ENS_KEYS.pubkeyVersion}`]: "2",
  [`${name}|${ENS_KEYS.policy}`]: JSON.stringify({ categories: ["a"] }),
  [`${name}|${ENS_KEYS.relayer}`]: "https://r.example.org",
});

describe("RF-06 resolve the newsroom by name", () => {
  it("returns_key_version_policy_and_custodian", async () => {
    const { client } = fakeClient(newsroomTexts());
    const info = await createReader({ client, universalResolver: UR }).resolveNewsroom("investiga.jornal.eth");
    expect(info.pubkeyVersion).toBe(2);
    expect(info.publicKey).toEqual(KEY);
    expect(info.custodian).toBe(CUSTODIAN);
    expect(info.policy.categories).toEqual(["a"]);
  });

  it("reads_only_by_name_using_the_given_universal_resolver", async () => {
    const { client, calls } = fakeClient(newsroomTexts());
    await createReader({ client, universalResolver: UR }).resolveNewsroom("investiga.jornal.eth");
    const ens = calls.filter((c) => c.fn === "getEnsText" || c.fn === "getEnsAddress");
    expect(ens.length).toBe(5); // 4 text records + 1 address
    for (const c of ens) expect((c.args as { universalResolverAddress: string }).universalResolverAddress).toBe(UR);
  });

  it("rejects_invalid_name_without_querying_the_network", async () => {
    const { client } = fakeClient({});
    const reader = createReader({ client, universalResolver: UR });
    await expect(reader.resolveNewsroom("Investiga.eth")).rejects.toBeInstanceOf(InvalidNameError);
    expect(client.getEnsText).not.toHaveBeenCalled();
  });

  it("name_with_no_record_raises_not_found", async () => {
    const { client } = fakeClient({}, { address: null });
    await expect(createReader({ client, universalResolver: UR }).resolveNewsroom("vazio.eth")).rejects.toBeInstanceOf(NewsroomNotFoundError);
  });

  it("incomplete_records_raise_records_error", async () => {
    const { client } = fakeClient({ [`parcial.eth|${ENS_KEYS.pubkey}`]: toBase64Url(KEY) });
    await expect(createReader({ client, universalResolver: UR }).resolveNewsroom("parcial.eth")).rejects.toBeInstanceOf(RecordsError);
  });
});

describe("journalist reader key", () => {
  it("returns_the_32_byte_key", async () => {
    const { client } = fakeClient({ [`maria.investiga.jornal.eth|${ENS_KEYS.readerKey}`]: toBase64Url(KEY) });
    expect(await createReader({ client, universalResolver: UR }).resolveReaderKey("maria.investiga.jornal.eth")).toEqual(KEY);
  });

  it("missing_or_invalid_raises_error", async () => {
    const reader = (t: Record<string, string | null>) => createReader({ client: fakeClient(t).client, universalResolver: UR });
    await expect(reader({}).resolveReaderKey("maria.investiga.jornal.eth")).rejects.toBeInstanceOf(RecordsError);
    await expect(reader({ [`maria.investiga.jornal.eth|${ENS_KEYS.readerKey}`]: "curta" }).resolveReaderKey("maria.investiga.jornal.eth")).rejects.toBeInstanceOf(RecordsError);
  });
});

describe("V-04 active journalist is decided by the registry, not by text", () => {
  it("active_when_the_subname_has_an_owner", async () => {
    const { client, calls } = fakeClient({}, { owner: CUSTODIAN });
    expect(await createReader({ client, universalResolver: UR }).isActiveJournalist("maria.investiga.eth")).toBe(true);
    expect(calls.map((c) => c.fn)).toEqual(["readContract:getSubregistry", "readContract:findOwner"]);
  });

  it("inactive_when_the_owner_is_the_zero_address_even_with_the_key_still_readable", async () => {
    const { client } = fakeClient({ [`maria.investiga.eth|${ENS_KEYS.readerKey}`]: toBase64Url(KEY) }, { owner: ZERO });
    expect(await createReader({ client, universalResolver: UR }).isActiveJournalist("maria.investiga.eth")).toBe(false);
  });

  it("inactive_when_the_newsroom_has_no_journalist_registry", async () => {
    const { client, calls } = fakeClient({}, { subregistry: ZERO });
    expect(await createReader({ client, universalResolver: UR }).isActiveJournalist("maria.investiga.eth")).toBe(false);
    expect(calls.some((c) => c.fn === "readContract:findOwner")).toBe(false);
  });

  it("only_accepts_the_journalist_newsroom_eth_format", async () => {
    const reader = createReader({ client: fakeClient({}).client, universalResolver: UR });
    for (const bad of ["investiga.eth", "a.b.c.eth", "Maria.investiga.eth", "maria.investiga.com"]) {
      await expect(reader.isActiveJournalist(bad), bad).rejects.toBeInstanceOf(InvalidNameError);
    }
  });
});

describe("isNameAvailable (is the .eth name free to register?)", () => {
  it("queries_the_registrar_with_the_label", async () => {
    const { client, calls } = fakeClient({}, { available: false });
    expect(await createReader({ client }).isNameAvailable("jornalista1.eth")).toBe(false);
    expect(calls.find((c) => c.fn === "readContract:isAvailable")?.args).toMatchObject({ args: ["jornalista1"] });
    expect(await createReader({ client: fakeClient({}, { available: true }).client }).isNameAvailable("livre.eth")).toBe(true);
  });

  it("rejects_name_that_is_not_second_level_lowercase", async () => {
    const r = createReader({ client: fakeClient({}).client });
    for (const n of ["a.b.eth", "Maiuscula.eth", "sem-tld"]) await expect(r.isNameAvailable(n), n).rejects.toBeInstanceOf(InvalidNameError);
  });
});
