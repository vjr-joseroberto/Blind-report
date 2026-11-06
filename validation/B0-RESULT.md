# B0: Arkiv SDK with a browser wallet (EIP-1193)

## Conclusion
**Works directly**, without an adapter. The `@arkiv-network/sdk` (v1.0.0) `createWalletClient` with
`account: <address>` (json-rpc account) and `transport: custom(provider)` creates an entity, reads, extends and changes ownership.
Verified only against a **fake** EIP-1193 provider and a local node. Real MetaMask behavior **was not verified** (only manually).

## What was tested (script `validation/b0-arkiv-wallet-spike.ts`)
Isolated local node `sw-arkiv-spike` (127.0.0.1:8556, chainId 1337, same as the SDK's `localhost`). The fake provider responds to
`eth_accounts`/`eth_requestAccounts`, `wallet_switchEthereumChain`/`wallet_addEthereumChain` (no-ops), signs `eth_sendTransaction`
with a local key the SDK never sees, and delegates the rest to the node. Two account forms: address string and `{address, type:"json-rpc"}`.

| Operation | Result |
|---|---|
| `wallet.account` (type `json-rpc`, `.address` present; `createSdkBackend` accepts it) | passed |
| `createEntity` | passed (both forms) |
| read back (`$owner`/`$creator` = wallet account) | passed |
| `extendEntity` | passed |
| `changeOwnership` (owner confirmed on read) | passed |

No failure occurred, so there is no error message to record.

## (c) Steps that require a local key?
No. The SDK writes via `walletClient.writeContract(...)` to contract `0x4400...0044`, which becomes a single `eth_sendTransaction`
(from, to, data ~1 KB; no `value`, no `gas`: the wallet estimates). No `eth_sign`/`personal_sign`/`eth_signTransaction`.
RPC methods seen: `eth_blockNumber, eth_chainId, eth_sendTransaction, eth_getTransactionReceipt, eth_getTransactionByHash, eth_getBlockByNumber`.
Note: waiting for the receipt and `getBlockNumber` go through the same provider, that is, through the RPC the wallet uses; it must be on the right chain.

## (a) Rabdi according to the SDK (`rabdi({accessKey})`, no network)
chainId **7794095** (`0x76edaf`), name **Rabdi**, testnet, native currency **Golem / tGLM / 18 decimals**,
explorer `https://rabdi.explorer.arkiv.network`, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network/<accessKey>` (the key goes in the path; WS `wss://` likewise).

## (b) `wallet_addEthereumChain`
```json
{
  "chainId": "0x76edaf",
  "chainName": "Rabdi",
  "nativeCurrency": { "name": "Golem", "symbol": "tGLM", "decimals": 18 },
  "rpcUrls": ["https://rpc.rabdi.db-chain.testnet.arkiv.network/<accessKey>"],
  "blockExplorerUrls": ["https://rabdi.explorer.arkiv.network"]
}
```
Note: the `accessKey` goes into the URL, so it ends up in the user's wallet configuration (acceptable only if the key is public/free;
decide). Without a key (`""`) the public endpoint is used with a strict rate limit. In `wagmi`/`viem`, `chain: rabdi({accessKey})` already works.

## (6) Adapter
Unnecessary. Plan B, if something changes: `tx.params[0]` from `eth_sendTransaction` already carries `to`/`data`; a provider that just forwards that to the wallet is the minimal adapter.

## Not verified / risks
- Real MetaMask: prompts, gas estimation (`gas` absent) and chain switch (`wallet_switchEthereumChain` was not called by the SDK; the app must call it).
- The app must call `eth_requestAccounts` first and pass the address as `account`.
- Real Rabdi was not touched (no external network); only the chain object was read.

## Recommendation
Use `createWalletClient({ account: address, chain: rabdi({accessKey}), transport: custom(window.ethereum) })` for the wallet flow,
keeping `createSdkBackend` (it only needs `wallet.account.address`). Validate manually once with MetaMask on Rabdi.
