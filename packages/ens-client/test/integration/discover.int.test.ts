// Discovery of a wallet's newsrooms from registry events, against the real Sepolia fork.
import { beforeAll, describe, expect, it } from "vitest";
import { createAdmin, createReader, ENSV2_SEPOLIA, findLabelsMintedTo, type LogClient } from "../../src/index.ts";
import { advance, newWallet, publicClient, uniqueLabel } from "./helpers.ts";

const policy = { categories: ["saude"], maxBytes: 100_000, attachments: false, epoch: "monthly" as const };

beforeAll(async () => {
  const code = await publicClient.getCode({ address: ENSV2_SEPOLIA.ethRegistrar });
  if (!code || code === "0x") throw new Error("Sepolia fork unavailable: run `npm run nodes:up`.");
});

describe("finding a wallet's newsrooms in registry events", () => {
  it("the_name_registered_by_the_wallet_appears_and_another_wallet_one_does_not", async () => {
    const mine = await newWallet();
    const other = await newWallet();
    const label = uniqueLabel();
    const otherLabel = uniqueLabel();
    const create = (w: typeof mine, l: string) => createAdmin({ publicClient, walletClient: w.walletClient, wait: advance }).createNewsroom({ label: l, publicKey: new Uint8Array(32).fill(1), version: 1, policy, custodian: w.address });
    await create(mine, label);
    await create(other, otherLabel);

    const client = publicClient as unknown as LogClient;
    const found = await findLabelsMintedTo({ client, address: mine.address, maxBlocks: 3_000n, chunk: 1_000n });
    expect(found.labels).toContain(label);
    expect(found.labels).not.toContain(otherLabel);

    // the registrar says the created name is no longer free, and that a new name is
    const reader = createReader({ client: publicClient });
    expect(await reader.isNameAvailable(`${label}.eth`)).toBe(false);
    expect(await reader.isNameAvailable(`${uniqueLabel()}.eth`)).toBe(true);

    // and the ENS confirmation matches the custodian
    const info = await createReader({ client: publicClient }).resolveNewsroom(`${label}.eth`);
    expect(info.custodian.toLowerCase()).toBe(mine.address.toLowerCase());
  });
});
