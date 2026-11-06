# CROPS: how Safe Whistle meets the track

CROPS stands for **C**ensorship-resistant, **O**pen source, **P**rivate and **S**ecure. The project's central property is the **privacy** of the person reporting, without sacrificing the other three.

## 1. The four properties

| Property | How the project meets it | Evidence |
|---|---|---|
| **Censorship-resistant** | The content and the newsrooms' identity live on public networks (ENS and Arkiv). There is no central database. The source reads the newsroom and the replies directly from the chain. The relayer is the project's only service; it cannot delete or change what it published, and it is possible to have several | `docs/04-architecture-and-data.md`, `validation/RESULTS.md` (V-08) |
| **Open source** | MIT license; all the code, tests and documents are in the repository | `LICENSE` |
| **Private** | Browser encryption (libsodium); proof of a unique person without identity; relayer with no log of IP, headers, body or proof; ephemeral reply box; nothing on the chain points to the source | `docs/08-security-review.md`, E2E test "RNF-01" |
| **Secure** | Only libsodium (no custom cryptography); authenticated formats; only the newsroom decrypts; authenticity of notes and replies via the creator on the chain; network policy that refuses any undeclared address; administrator and journalist login through the wallet, without typing a key | `docs/08-security-review.md`, `packages/network-policy` |

**What the project does not promise:** hiding the source's network address (IP). It is visible to the relayer, the RPC and World. Network protection is the source's choice, outside the application (VPN or another tool). The app does not embed any anonymity network. The limits are described bluntly in section 7 of the overview document.

## 2. Contacted network addresses (declared list)

Everything the application contacts is in the list below, and the browser security policy (CSP) and `guardedFetch` refuse the rest.

### Source screen (browser)
| Address | For what | Configurable |
|---|---|---|
| The app's own origin | Static files (HTML, JS, CSS, `config.json`) | n/a |
| ENS RPC (default `ethereum-sepolia-rpc.publicnode.com`) | Read the newsroom's public key, version and policy | **Yes** (`config.json`) |
| Arkiv RPC (`rpc.rabdi.db-chain.testnet.arkiv.network`) | Read replies and verify date and integrity | **Yes** |
| Relayer (service address) | Request the proof context and send the encrypted envelope | **Yes** |
| `bridge.worldcoin.org` | IDKit bridge, which connects the World app proof to the page | No |

### Newsroom panel (browser)
ENS RPC and Arkiv RPC (above). The **wallet** (MetaMask) uses its own RPC, which the application does not control. The links to explorers (Etherscan, Rabdi explorer) are only opened when the person clicks.

### Relayer (server)
ENS RPC, Arkiv RPC and `developer.world.org` (proof verification).

## 3. Third-party trackers

- **No** third-party analytics, external font, script or image. The HTML does not reference any external address.
- The **CSP** is generated from the address list (`cspFor`) and written into the HTML by the build; the screens' server also sends it as a header. No wildcards and no `unsafe-inline`.
- IDKit was used **without the default interface** (`@worldcoin/idkit-core`), precisely because the widget loads fonts from a World third-party domain.
- **Automated test:** `apps/*/test/static.test.ts` analyzes the generated HTML and bundle. The bundle contains default library addresses (viem, Arkiv SDK, IDKit) that are **never contacted**: the list is reviewed in the tests, and a new address breaks the test.
- **Not done yet:** the **runtime audit** with a real browser (network tab) to confirm that IDKit only contacts what is in the list. It is step 1 of the manual walkthrough (`docs/09-manual-walkthrough.md`).

## 4. Points to clarify with the organization
1. Does a configurable **public RPC** count as a "third-party service"? We mitigate with a configurable RPC, declared addresses and a strict CSP.
2. The proof of humanity flow **contacts World servers** (IDKit bridge and verification API). We declare this here and in the README.

## 5. 3-minute demo
1. **(0:00)** The problem, in one sentence: reporting without exposing yourself.
2. **(0:20)** The administrator registers the newsroom and shows the transactions on Etherscan.
3. **(0:50)** The source searches the name, writes and proves they are a real person. Show the network tab: only the declared addresses.
4. **(1:30)** The submission appears in Arkiv: hash and date, unreadable content.
5. **(1:50)** The administrator decrypts in the panel and replies.
6. **(2:20)** The source reads the reply with the receipt.
7. **(2:40)** Date and integrity verification; close with what the system does **not** promise.
