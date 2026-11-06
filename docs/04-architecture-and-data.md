# Architecture and data model

## 1. Architecture
```
 SOURCE (browser)                                          NEWSROOM (browser)
 ┌─────────────────────────────┐                           ┌───────────────────────────┐
 │ web-source                  │                           │ web-newsroom              │
 │ 1. resolve ENS (RPC)        │                           │ local private key         │
 │ 2. encrypts (crypto)        │                           │ list (Arkiv) + decrypts   │
 │ 3. World ID proof           │                           │ marks status, replies     │
 │ 4. sends to relayer         │                           └─────────────▲─────────────┘
 └──────────────┬──────────────┘                                         │ reads / writes
                ▼                                                        │
        ┌───────────────┐   publishes + transfers custody  ┌─────────────┴────────────┐
        │ relayer       │ ───────────────────────────────► │ Arkiv (testnet)          │
        │ (World ID,    │                                  │ denuncia / resposta /    │
        │ policy)       │                                  │ anotacao                 │
        └───────┬───────┘                                  └──────────────────────────┘
                │ reads policy
                ▼
        ┌───────────────┐
        │ ENSv2 (Sepolia)│  public key, version, policy, journalists
        └───────────────┘
```
All network access goes through `network-policy`, which only allows the declared hosts (RPC, World, relayer). There is no custom contract.

The `web-source` and `web-newsroom` screens are **thin layers** over the headless clients `source-client` and `newsroom-client`, which concentrate the logic (encryption, ENS, Arkiv, calls to the relayer). This allows testing the whole flow via script, without a browser (`../planning/06-decision-tests-without-browser.md`).

## 2. Data model in ENS
| Name | Who writes | Records |
|---|---|---|
| `jornal.eth` | administrator | `url`, `description` |
| `investiga.jornal.eth` | administrator | `denuncia.pubkey`, `denuncia.pubkey.version`, `denuncia.policy`, `denuncia.relayer`; newsroom address (custodian) |
| `maria.investiga.jornal.eth` | administrator creates; the journalist owns the token | journalist's address; `denuncia.readerkey` |

`denuncia.policy` (JSON): accepted categories, maximum size, limit period (epoch), accepts attachments.

The **custodian** of the Arkiv entities is the newsroom address read from ENS (address record, coinType 60).

## 3. Data model in Arkiv
**`denuncia`** — published by the relayer, custody transferred to the newsroom, `readonly`.
| Field | Type | Indexed |
|---|---|---|
| `newsroom` | text | yes |
| `category` | text | yes |
| `status` | text (`new`) | yes |
| `epoch` | u64 | yes |
| `contentHash` | text (hash of the *ciphertext*) | yes |
| `pubkeyVersion` | u64 | no |
| `part` / `parts` | u64 | no (part index and total; large attachments are split) |
| `envelope` | bytes (encrypted envelope) | no |

**`resposta`** — published by the newsroom: `newsroom` (indexed), `mailboxId` (indexed), `authorName` (optional: ENS name of the person who replied) and `sealed` (bytes). The encrypted content is `{v:1, newsroom, text}`. **It is only valid if the entity's `creator` (defined by the chain) is the administrator or an active journalist**; `authorName` is a declaration checked against ENS.
**`anotacao`** — published by the journalist: `newsroom`, `denunciaKey`, `status` and `byJournalist` (all indexed) `authorName` (optional) and one data byte. **It only counts if the entity's `creator` is the administrator or the owner of the subname `authorName`, active on ENS** (the others are ignored and counted). A tip's state is the **last note** (the envelope is immutable).

Nothing identifies the source: the writer is the relayer and later the custodian.

## 4. Envelope
Contains: format version, newsroom, key version, category, wrapped content keys (one per recipient), `nonce`, *ciphertext* (binary), `contentHash`, `commitment`, mailbox public key, client timestamp.

Authenticated data in encryption: `newsroom | key version | category` (changing any one invalidates opening).

## 5. Receipt (only on the source's device)
Entity identifier, `contentHash`, `salt`, mailbox public and private key. **Whoever has the receipt has the reply box and can prove authorship.** The system does not keep a copy.

## 6. Custody and retention flow
1. The relayer creates the entity with the `readonly` **and** `permissionlessExtension` flags (it is the temporary owner and pays the gas).
2. It then transfers ownership to the newsroom address. The relayer can **no longer delete or change** it.
3. The relayer's **renewal job** **extends the expiration** before it lapses **without being the owner** (allowed by `permissionlessExtension`); the newsroom can also extend, delete or transfer. Without renewal, the tip **disappears**. Since the maximum life of an entity is **~182 days**, renewal is not optional: the job must run with slack (for example, renew everything that expires within 60 days, requesting ~150 days).

Verified in `validation/RESULTS.md` (V-08). The `$creator` remains the relayer; the `$owner` becomes the newsroom.

## 7. Threat model (summary)
| Adversary | Mitigation | Residual risk |
|---|---|---|
| Anyone reading Arkiv | Encrypted content | Sees **that** a tip occurred, its category and time |
| RPC provider | Declared hosts; configurable RPC | Sees IP and queries if the user does not protect themselves |
| Relayer operator | No IP logs; data limits | Sees IP and time on submission |
| Fake newsroom / cloned site | Verification by ENS name and key version | The user must check the name |
| Server hosting the app | Static app, open source, strict CSP | Supply chain |
| Malicious relayer deleting tips | Custody transfer + `readonly` | Short window between creation and transfer |
| Spam | World ID: 1 submission per person×newsroom×epoch | Depends on the real World proof |
| Compromised device, global network observer | — | Out of scope |

## 8. Design principles
- Simple MVP: small functions, little state, no heavy frameworks.
- Explicit, injectable network boundaries (for TDD).
- **Injectable** randomness and clock (deterministic tests).
- Explicit failures with typed errors; nothing swallowed.
- **No anonymity network** anywhere (`../GUARDRAILS.md`).
