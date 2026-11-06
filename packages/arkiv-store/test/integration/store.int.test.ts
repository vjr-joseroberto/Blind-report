import { describe, expect, it } from "vitest";
import { createStore } from "../../src/index.ts";
import { newBackend } from "./helpers.ts";

const NAME = () => `v${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}.eth`;
const HASH = (c: string) => ("0x" + c.repeat(32)) as `0x${string}`;
const rand = () => ("0x" + [...globalThis.crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

describe("loja sobre o nó Arkiv real", () => {
  it("publica_transfere_a_custodia_e_a_redacao_le_e_anota", async () => {
    const relayerBackend = await newBackend();
    const newsroomBackend = await newBackend();
    const relayer = createStore(relayerBackend);
    const newsroom = createStore(newsroomBackend);
    const name = NAME();
    const envelope = new Uint8Array(2000).fill(4);
    const { key } = await relayer.publishSubmission({ newsroom: name, category: "saude", epoch: 202611, contentHash: rand(), pubkeyVersion: 1, envelope, custodian: newsroomBackend.account, retentionSeconds: 3600 });

    const { items } = await newsroom.listSubmissions({ newsroom: name });
    expect(items).toHaveLength(1);
    expect(items[0]!.envelope).toEqual(envelope);
    expect(items[0]!.status).toBe("new");

    const row = await relayerBackend.get("denuncia", key);
    expect(row?.owner.toLowerCase()).toBe(newsroomBackend.account.toLowerCase());
    expect(row?.creator.toLowerCase()).toBe(relayerBackend.account.toLowerCase());

    await newsroom.annotate({ newsroom: name, denunciaKey: key, status: "verified", journalist: newsroomBackend.account });
    expect((await newsroom.listSubmissions({ newsroom: name, status: "verified" })).items).toHaveLength(1);
  });

  it("o_relayer_renova_sem_ser_dono_e_nao_consegue_transferir_de_volta", async () => {
    const relayerBackend = await newBackend();
    const newsroomBackend = await newBackend();
    const relayer = createStore(relayerBackend);
    const name = NAME();
    const { key } = await relayer.publishSubmission({ newsroom: name, category: "saude", epoch: 202611, contentHash: rand(), pubkeyVersion: 1, envelope: new Uint8Array(500).fill(1), custodian: newsroomBackend.account, retentionSeconds: 600 });
    expect(await relayer.renew({ key, retentionSeconds: 100_000 })).toBe("extended");
    expect(await relayer.renew({ key, retentionSeconds: 600 })).toBe("unchanged");
    await expect(relayerBackend.changeOwnership(key, relayerBackend.account)).rejects.toThrow();
  });

  it("anexo_grande_vira_varias_partes_e_volta_inteiro", async () => {
    const relayerBackend = await newBackend();
    const newsroomBackend = await newBackend();
    const relayer = createStore(relayerBackend);
    const newsroom = createStore(newsroomBackend);
    const name = NAME();
    const big = Uint8Array.from({ length: 250 * 1024 }, (_, i) => i % 251);
    await relayer.publishSubmission({ newsroom: name, category: "obras", epoch: 202611, contentHash: rand(), pubkeyVersion: 1, envelope: big, custodian: newsroomBackend.account, retentionSeconds: 3600 });
    const { items } = await newsroom.listSubmissions({ newsroom: name });
    expect(items).toHaveLength(1);
    expect(items[0]!.parts).toBe(3);
    expect(items[0]!.envelope).toEqual(big);
  });

  it("a_fonte_encontra_a_resposta_pelo_mailbox", async () => {
    const journalistBackend = await newBackend();
    const sourceBackend = await newBackend(); // quem lê não precisa de direitos
    const journalist = createStore(journalistBackend);
    const mailbox = rand();
    await journalist.publishReply({ newsroom: NAME(), mailboxId: mailbox, sealed: new Uint8Array(60).fill(8), retentionSeconds: 3600 });
    const replies = await createStore(sourceBackend).getReplies(mailbox);
    expect(replies).toHaveLength(1);
    expect(replies[0]!.sealed).toEqual(new Uint8Array(60).fill(8));
    expect(await createStore(sourceBackend).getReplies(HASH("5a"))).toEqual([]);
  });
});
