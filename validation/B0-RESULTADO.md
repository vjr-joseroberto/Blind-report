# B0: SDK do Arkiv com carteira de navegador (EIP-1193)

## Conclusão
**Funciona direto**, sem adaptador. `createWalletClient` do `@arkiv-network/sdk` (v1.0.0) com
`account: <endereço>` (conta json-rpc) e `transport: custom(provider)` cria entidade, lê, estende e muda a propriedade.
Verificado só contra um provedor EIP-1193 **falso** e um nó local. O comportamento real da MetaMask **não foi verificado** (só à mão).

## O que foi testado (script `validation/b0-arkiv-wallet-spike.ts`)
Nó local isolado `sw-arkiv-spike` (127.0.0.1:8556, chainId 1337, igual ao `localhost` do SDK). Provedor falso responde
`eth_accounts`/`eth_requestAccounts`, `wallet_switchEthereumChain`/`wallet_addEthereumChain` (no-ops), assina `eth_sendTransaction`
com chave local que o SDK nunca vê, e delega o resto ao nó. Duas formas de conta: string de endereço e `{address, type:"json-rpc"}`.

| Operação | Resultado |
|---|---|
| `wallet.account` (type `json-rpc`, `.address` presente; `createSdkBackend` aceita) | passou |
| `createEntity` | passou (as duas formas) |
| leitura de volta (`$owner`/`$creator` = conta da carteira) | passou |
| `extendEntity` | passou |
| `changeOwnership` (owner confirmado na leitura) | passou |

Nenhuma falha ocorreu, portanto não há mensagem de erro a registrar.

## (c) Passos que exigem chave local?
Não. O SDK escreve via `walletClient.writeContract(...)` na contrato `0x4400...0044`, que vira um único `eth_sendTransaction`
(from, to, data ~1 KB; sem `value`, sem `gas`: a carteira estima). Nenhum `eth_sign`/`personal_sign`/`eth_signTransaction`.
Métodos RPC vistos: `eth_blockNumber, eth_chainId, eth_sendTransaction, eth_getTransactionReceipt, eth_getTransactionByHash, eth_getBlockByNumber`.
Atenção: a espera do recibo e `getBlockNumber` passam pelo mesmo provedor, ou seja, pelo RPC que a carteira usa; ela precisa estar na cadeia certa.

## (a) Rabdi segundo o SDK (`rabdi({accessKey})`, sem rede)
chainId **7794095** (`0x76edaf`), nome **Rabdi**, testnet, moeda nativa **Golem / tGLM / 18 casas**,
explorador `https://rabdi.explorer.arkiv.network`, RPC `https://rpc.rabdi.db-chain.testnet.arkiv.network/<accessKey>` (a chave vai no caminho; WS `wss://` idem).

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
Obs.: a `accessKey` entra na URL, então vai parar na configuração da carteira do usuário (aceitável só se a chave for pública/gratuita;
decidir). Sem chave (`""`) usa-se o endpoint público com limite forte de taxa. Em `wagmi`/`viem`, `chain: rabdi({accessKey})` já serve.

## (6) Adaptador
Desnecessário. Plano B, se algo mudar: `tx.params[0]` de `eth_sendTransaction` já traz `to`/`data`; um provedor que só repasse isso à carteira é o adaptador mínimo.

## Não verificado / riscos
- MetaMask real: prompts, estimativa de gas (`gas` ausente) e troca de cadeia (`wallet_switchEthereumChain` não foi chamada pelo SDK; o app deve chamá-la).
- O app precisa chamar `eth_requestAccounts` antes e passar o endereço como `account`.
- Rabdi real não foi tocada (sem rede externa); só o objeto da cadeia foi lido.

## Recomendação
Usar `createWalletClient({ account: endereço, chain: rabdi({accessKey}), transport: custom(window.ethereum) })` para o fluxo de carteira,
mantendo `createSdkBackend` (só precisa de `wallet.account.address`). Validar uma vez à mão com MetaMask na Rabdi.
