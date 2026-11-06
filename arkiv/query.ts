// Executable Arkiv query (Rabdi testnet): lists a newsroom's Safe Whistle entities. READ ONLY.
// Usage (from the repository root):
//   npm run arkiv:query -- jornalista1.eth              # all three collections
//   npm run arkiv:query -- jornalista1.eth denuncia     # only one (denuncia | anotacao | resposta)
// Optional: ARKIV_ACCESS_KEY in the environment (without a key, the public Rabdi endpoint has a strict rate limit).
import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { KIND_ATTRS, createSdkBackend, type EntityKind } from "@safe-whistle/arkiv-store";
import { isNewsroomName } from "@safe-whistle/core";
import { RPC_TRANSPORT, createPolicy, guardedFetch } from "@safe-whistle/network-policy";
import { bytesToHex, http } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const KINDS = Object.keys(KIND_ATTRS) as EntityKind[];
const [newsroom, only] = process.argv.slice(2);

if (!newsroom || !isNewsroomName(newsroom) || (only !== undefined && !KINDS.includes(only as EntityKind))) {
  console.error(`usage: npm run arkiv:query -- <newsroom.eth> [${KINDS.join("|")}]`);
  process.exit(1);
}

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" });
const host = new URL(chain.rpcUrls.default.http[0]!).hostname;
const transport = http(undefined, { fetchFn: guardedFetch(createPolicy({ hosts: [host] })), ...RPC_TRANSPORT }); // only the Rabdi host
const backend = createSdkBackend({
  publicClient: createPublicClient({ chain: chain as never, transport }),
  walletClient: createWalletClient({ chain: chain as never, transport, account: privateKeyToAccount(generatePrivateKey()) }), // disposable: never signs
});

const PAGE = 100;
for (const kind of only ? [only as EntityKind] : KINDS) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await backend.select(kind, { newsroom }, { offset, limit: PAGE });
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  console.log(`\n== ${kind}: ${rows.length} entit(y|ies) of ${newsroom} on Rabdi ==`);
  for (const r of rows) {
    const attrs = Object.fromEntries(Object.entries(r.attrs).map(([k, v]) => [k, String(v)]));
    console.log(JSON.stringify({ key: r.key, owner: r.owner, creator: r.creator, createdAtBlock: String(r.createdAtBlock), expiresAtBlock: String(r.expiresAtBlock), attrs, dataBytes: r.data.length, dataHead: bytesToHex(r.data.slice(0, 12)) }));
  }
}
