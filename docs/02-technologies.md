# Technologies used

The limits below were **measured in the POCs** (`../POC-Cofre`, `../POC-ENS`) or read in the official documentation. What has not yet been verified is marked as **to be validated** (Phase 0).

## 1. Overview
| Layer | Technology | Role |
|---|---|---|
| Newsroom identity | **ENSv2** (Sepolia) | Public name, public key, policy and journalists as subnames |
| Storage and query | **Arkiv** (Rabdi testnet) | Encrypted envelopes, replies and notes, with indexing by attributes |
| Anti-spam | **World ID** (IDKit, API v4) | Proof of a unique human per newsroom and epoch |
| Cryptography | **libsodium** | XChaCha20-Poly1305, *sealed box*, BLAKE2b |
| Blockchain client | **viem** | ENS reads, writes to ENS and Arkiv |
| Language | **TypeScript** (Node 22) | The whole system |
| Tests | **Vitest**, **fast-check** | Everything via Node script, **no browser**. See `planning/04-tdd-strategy.md` |
| Network | Common **public RPC** | Ethereum (Sepolia) and Arkiv; user-configurable. Sepolia default: **publicnode**; alternative: tenderly gateway (V-06) |

## 2. ENSv2
**Why:** the name is the trust anchor. The source types `investiga.jornal.eth` and gets the key through the Universal Resolver, without trusting the site.

**How we use it**
- One **resolver per newsroom** (`PermissionedResolver`, created as a proxy via `VerifiableFactory`).
- Text records: `denuncia.pubkey`, `denuncia.pubkey.version`, `denuncia.policy`, `denuncia.relayer`.
- Subname per journalist with `denuncia.readerkey`.
- Reads **by name only**, through the Universal Resolver (stable proxy `0xeEeE…EeEe`).

**Measured facts**
- The setters receive the name in **DNS format** (bytes), not the `namehash`.
- Registering a `.eth` is *commit-reveal*: minimum wait of **60 s**, minimum duration of 28 days, payment in **MockUSDC** (test token with free mint).
- The resolver roles apply **per text key across all names on the same resolver**: hence one resolver per newsroom.
- A subname with no record already resolves through the parent name's resolver.
- Accepts text records of 4,000 characters.

**Risks:** ENSv2 was redeployed several times on Sepolia and the signatures changed between versions. Recheck the addresses before starting (`docs.ens.domains/learn/deployments`).

## 3. Arkiv
**Why:** it stores data with attribute indexes and a public creation date.

**How we use it:** three schemas (`denuncia`, `resposta`, `anotacao`) with indexed attributes and the envelope in `bytes`.

**Measured (official local node) and documented facts**
| Topic | Value |
|---|---|
| Size of `bytes` | SDK limit 128 KiB; the largest value accepted on the local node was **128,960 B (~126 KiB)** |
| Attributes per entity | up to 32; `str` up to 128 B |
| Query | requires **at least one filter**; maximum page of 100 rows; `$createdAt` does **not** work for sorting (sort on the client) |
| Expiration | in **blocks** (~2 s); once expired, the entity **disappears** from queries and **no event** warns. **Maximum life: 7,884,000 blocks (~182.5 days)**: asking for more is refused by the chain (found in the integration tests; Rabdi was not tested for this limit) |
| Permissions | only the owner can change, delete or extend; third parties are refused |
| `readonly` flag | prevents changes, does **not** prevent deletion or transfer |
| `changeOwnership` | transfers the entity; the former owner loses the power to delete |

**To be validated:** real cost and limits on Rabdi (the test was on a local node) and the behavior of the public RPC (rate limits).

## 4. World ID
**Why:** it limits spam without identifying anyone.

**How we use it:** the proof action is `submit:<newsroom>:<epoch>`; the relayer verifies at `POST developer.world.org/api/v4/verify/{rp_id}`, checks the environment (`staging` with the simulator) and stores only the hash of `(nullifier, action)`.

**Facts:** the `rp_context` signature is generated on the server with the portal key; `proofOfHuman` is the credential described as "unique human".

**To be validated:** real proof and the nullifier's real behavior per action. Prerequisite: app in the Developer Portal migrated to World ID 4.0.

**Third-party note (V-05):** the World flow contacts `bridge.worldcoin.org`, and the relayer contacts `developer.world.org`. The IDKit **widget** loads fonts from `world-id-assets.com` (third party), so we use the **headless `@worldcoin/idkit-core`** package (generates the `connectorURI` and does the *polling*) and draw the QR code and button on our screen. All these hosts must be in the network policy.

## 5. Cryptography (libsodium)
- Content: **XChaCha20-Poly1305** with authenticated data (newsroom, key version, category).
- Content key wrapped with a **sealed box** for each recipient.
- Hashes: **BLAKE2b-256** (the default libsodium build does not include SHA-256).
- Authorship commitment: `hash(plaintext ‖ salt)`.
- **No custom cryptography.**
- Base64 inflates the envelope by ~33%: store the *ciphertext* as **binary** in Arkiv.

## 6. Development tools
| Tool | Use |
|---|---|
| npm workspaces | Simple monorepo |
| Vitest | Unit and integration tests |
| fast-check | Property-based tests (cryptography) |
| Docker | Local Sepolia fork (anvil) and local Arkiv node for integration tests |
| esbuild / Vite | Bundle the front-ends |

## 7. What we do NOT use
- **Tor, Nym, Nox, I2P, Lokinet, anonymity SOCKS and Anon-RPC** (guardrail: `../GUARDRAILS.md`).
- Custom contracts (the MVP uses only the ENS contracts).
- Third-party servers beyond those declared in the network policy: RPC, World and relayer.
- Analytics, error reporting, or CDN fonts and scripts.
- **Automated browser in the tests** (Playwright, Selenium and similar): the tests are Node scripts (`planning/06-decision-tests-without-browser.md`).
