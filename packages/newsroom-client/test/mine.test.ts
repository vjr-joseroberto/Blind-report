import { NewsroomNotFoundError, RecordsError } from "@safe-whistle/ens-client";
import { describe, expect, it, vi } from "vitest";
import { listAdministered } from "../src/index.ts";

const ME = "0xdC35Ef1b21dfE85F595132829E4C2bfcBB5c037e";
const OTHER = "0x9999999999999999999999999999999999999999";

function make(custodians: Record<string, string | Error>, labels: string[], incomplete = false) {
  const reader = {
    resolveNewsroom: vi.fn(async (name: string) => {
      const c = custodians[name];
      if (c instanceof Error) throw c;
      if (c === undefined) throw new NewsroomNotFoundError(name);
      return { custodian: c } as never;
    }),
  };
  return { reader, find: vi.fn(async () => ({ labels, incomplete })) };
}

describe("newsrooms administered by the wallet", () => {
  it("lists_only_those_with_safe_whistle_records_and_the_wallet_as_custodian", async () => {
    const { reader, find } = make({ "a.eth": ME, "b.eth": OTHER, "c.eth": ME.toLowerCase() }, ["a", "b", "c", "d"]);
    const r = await listAdministered({ address: ME, find, reader });
    expect(r.newsrooms.sort()).toEqual(["a.eth", "c.eth"]);
    expect(r.incomplete).toBe(false);
  });

  it("ignores_names_without_records_or_with_invalid_records", async () => {
    const { reader, find } = make({ "x.eth": new RecordsError("pubkey", "falta") }, ["x", "y"]);
    expect((await listAdministered({ address: ME, find, reader })).newsrooms).toEqual([]);
  });

  it("network_failure_on_one_name_marks_incomplete_and_continues", async () => {
    const { reader, find } = make({ "a.eth": new Error("rpc down"), "b.eth": ME }, ["a", "b"]);
    const r = await listAdministered({ address: ME, find, reader });
    expect(r.newsrooms).toEqual(["b.eth"]);
    expect(r.incomplete).toBe(true);
  });

  it("forwards_the_incomplete_from_the_search_and_ignores_invalid_labels", async () => {
    const { reader, find } = make({ "a.eth": ME }, ["a", "Inválido!", "a"], true);
    const r = await listAdministered({ address: ME, find, reader });
    expect(r).toEqual({ newsrooms: ["a.eth"], incomplete: true });
    expect(reader.resolveNewsroom).toHaveBeenCalledTimes(1);
  });

  it("total_search_failure_returns_empty_and_incomplete", async () => {
    const { reader } = make({}, []);
    const r = await listAdministered({ address: ME, find: async () => { throw new Error("rpc"); }, reader });
    expect(r).toEqual({ newsrooms: [], incomplete: true });
  });
});
