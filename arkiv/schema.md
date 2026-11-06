# Arkiv schema in Safe Whistle

Safe Whistle uses Arkiv (testnet **Rabdi**, chain id 7794095) as a public database. The records are **encrypted**: Arkiv stores and indexes, but secrecy comes from the encryption done in the browser. Code: `packages/arkiv-store/src/sdk-backend.ts` (schemas) and `packages/arkiv-store/src/store.ts` (rules).

## Three entity types

### `safe-whistle.denuncia`: the encrypted envelope
| Column | Type | Indexed | Content |
|---|---|---|---|
| `newsroom` | text | yes | ENS name of the newsroom (`newsroom.eth`) |
| `category` | text | yes | Category of the newsroom policy |
| `status` | text | yes | Always `new` on creation (the real state comes from the notes) |
| `epoch` | u64 | yes | Month (YYYYMM, UTC) |
| `contentHash` | text | yes | BLAKE2b-256 hash of the encrypted text; groups the parts |
| `pubkeyVersion` | u64 | no | Version of the newsroom key used |
| `part` / `parts` | u64 | no | Index and total (large attachments become several entities) |
| `envelope` | bytes | no | Encrypted envelope (≤ 120 KiB per part) |

**Who writes:** the relayer (wallet `RELAYER`). Right after, it **transfers ownership** to the newsroom. Flags: `readonly` and `permissionlessExtension`.

### `safe-whistle.resposta`: encrypted reply to the source
| Column | Type | Indexed | Content |
|---|---|---|---|
| `newsroom` | text | yes | Newsroom that replies |
| `mailboxId` | text | yes | Hash of the source box's public key (the source searches by it) |
| `authorName` | text, optional | no | ENS name of who replied (declaration; valid only if the `creator` is authorized) |
| `sealed` | bytes | no | Reply encrypted to the box key |

**Who writes:** the administrator or an active journalist.

### `safe-whistle.anotacao`: status of a tip
| Column | Type | Indexed | Content |
|---|---|---|---|
| `newsroom` | text | yes | Newsroom |
| `denunciaKey` | text | yes | Key of the annotated tip entity |
| `status` | text | yes | `new`, `review`, `verified` or `discarded` |
| `byJournalist` | text | yes | Declared address of who annotated |
| `authorName` | text, optional | no | Declared ENS name |
| `note` | bytes | no | One byte (the useful data is in the attributes) |

The state of a tip is the **last valid note**; the envelope never changes.

## Rules that are part of the data model
- **Custody:** the tip's `$owner` is the newsroom; `$creator` remains the relayer. The relayer **cannot delete or change** after the transfer (measured on Rabdi, `validation/RESULTS.md`, V-01 and V-08).
- **Authenticity:** a note or reply **is only valid** if the `$creator` (set by the chain, not forgeable) is the administrator (custodian in ENS) or the owner of an active journalist subname. The others are ignored and counted. `authorName` is only a declaration checked against ENS.
- **Retention:** 150 days by default (`RETENTION_DAYS`). The maximum lifetime on chain is 7,884,000 blocks (~182.5 days): without renewal the entity disappears. Any account can extend (`permissionlessExtension`); the relayer renews what expires within 60 days.
- **Nothing identifies the source:** no attribute stores IP, account, World ID proof or source wallet.

## Queries used
| Query | Filter | Where |
|---|---|---|
| Newsroom inbox | `newsroom` (+ `category`) in `denuncia` | `listSubmissions` |
| Status | `newsroom` in `anotacao`; or `denunciaKey` | `listAnnotations`, `latestStatus` |
| Source replies | `mailboxId` in `resposta` | `getReplies` |
| Deadlines | `newsroom` in `denuncia`, comparing `expiresAtBlock` | `listExpiring`, `renewExpiring` |

Arkiv requires **at least one filter** per query and limits the page to 100 items; the code paginates.

## How to run a query
`npm run arkiv:query -- <newsroom.eth> [denuncia|anotacao|resposta]` (see the README, Arkiv section).
