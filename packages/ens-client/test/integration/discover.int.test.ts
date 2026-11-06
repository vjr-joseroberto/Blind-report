// Descoberta das redações de uma carteira pelos eventos do registry, contra o fork real da Sepolia.
import { beforeAll, describe, expect, it } from "vitest";
import { createAdmin, createReader, ENSV2_SEPOLIA, findLabelsMintedTo, type LogClient } from "../../src/index.ts";
import { advance, newWallet, publicClient, uniqueLabel } from "./helpers.ts";

const policy = { categories: ["saude"], maxBytes: 100_000, attachments: false, epoch: "monthly" as const };

beforeAll(async () => {
  const code = await publicClient.getCode({ address: ENSV2_SEPOLIA.ethRegistrar });
  if (!code || code === "0x") throw new Error("Fork da Sepolia indisponível: rode `npm run nodes:up`.");
});

describe("achar as redações de uma carteira nos eventos do registry", () => {
  it("o_nome_registrado_pela_carteira_aparece_e_o_de_outra_carteira_nao", async () => {
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

    // o registrar diz que o nome criado não está mais livre, e que um nome novo está
    const reader = createReader({ client: publicClient });
    expect(await reader.isNameAvailable(`${label}.eth`)).toBe(false);
    expect(await reader.isNameAvailable(`${uniqueLabel()}.eth`)).toBe(true);

    // e a confirmação no ENS bate com o custodiante
    const info = await createReader({ client: publicClient }).resolveNewsroom(`${label}.eth`);
    expect(info.custodian.toLowerCase()).toBe(mine.address.toLowerCase());
  });
});
