# Phase 0 Results — Validation

Run on 2026-11-01. Scripts in `validation/`. Network used: common public RPC, local Sepolia fork (Docker) and local Arkiv node (Docker). **No anonymity network.**

## Summary
| ID | Validation | Status | Script |
|---|---|---|---|
| V-01 | Arkiv on Rabdi: cost, limit and behavior | ✅ **Completed** (real Rabdi) | `v01-arkiv-rabdi.ts` |
| V-02 | Real World ID proof and nullifier per action | ✅ **Completed** (simulator, `staging`) | `v02-worldid-proof.ts` |
| V-03 | ENS on real Sepolia | ✅ **Completed** (real Sepolia) | `v03-ens-sepolia.ts` |
| V-04 | Subnames: expiration, revocation, transfer, renewal | ✅ **Completed** (local fork) | `v04-subnames.ts` |
| V-05 | Hosts referenced by IDKit | ✅ **Completed** (static analysis) | `v05-idkit-hosts.mjs` |
| V-06 | Limits and stability of public RPCs | ✅ **Completed** | `v06-rpc-burst.ts` |
| V-07 | Encryption performance | ✅ **Completed** | `v07-crypto-perf.ts` |
| V-08 | Newsroom as custodian in Arkiv | ✅ **Completed** (local node) | `v08-custody.ts` |

All Phase 0 validations are complete. V-02 was done in the World simulator (`staging`), not with the World App in `production`.

---

## V-07 — Encryption performance (RNF-08 target: 100 KiB in under 100 ms)
Measured on Node 22 (V8 and WebAssembly), median of 15 runs, 1 recipient.

| Size | encrypt (ms) | open (ms) | encode+decode (ms) | envelope bytes |
|---|---|---|---|---|
| 1 KiB | 1,09 | 0,23 | 0,05 | 1.569 |
| 100 KiB | 2,08 | 0,62 | 0,15 | 102.945 |
| 1 MiB | 7,51 | 3,55 | 0,48 | 1.049.121 |

**Result:** target **met with room to spare** (2,08 ms). The format's extra cost is ~500 bytes per envelope (1 recipient). Browser confirmation stays on the manual list M-01.

## V-06 — Common public RPCs
`eth_blockNumber`: 20 sequential calls and a burst of 40 parallel ones. Only light calls; `getLogs` and others were not measured.

| RPC | Sequential | p50 | p95 | Burst 40 | Note |
|---|---|---|---|---|---|
| **publicnode (Sepolia)** | 20/20 | 183 ms | 535 ms | 40/40 | No errors |
| tenderly gateway (Sepolia) | 20/20 | 193 ms | 409 ms | 40/40 | No errors |
| 1rpc (Sepolia) | 20/20 | 362 ms | 1.746 ms | 40/40 | Slower |
| drpc (Sepolia) | 0/20 | — | — | 0/40 | Requires a paid plan |
| rpc.sepolia.org | 0/20 | — | — | 0/40 | Timed out |
| Arkiv Rabdi (public, no key) | 20/20 | 269 ms | 1.042 ms | 40/40 | No errors under this light load |

**Decisions**
- **Default Sepolia RPC: publicnode** (`https://ethereum-sepolia-rpc.publicnode.com`), with **tenderly gateway** as an alternative. Avoid drpc and rpc.sepolia.org.
- The RPC remains **user-configurable** (RF-20).
- The local fork failed once at startup due to RPC instability (block not found): the `nodes-up.sh` script now retries up to 3 times.
- **Limitation of this measurement:** the keyless Rabdi responded well to light reads; writes and larger loads depend on the key (V-01).

## V-05 — Hosts referenced by IDKit (static analysis, `@worldcoin/idkit` 4.6.0)
| Host | Likely role | Enters the network policy? |
|---|---|---|
| `bridge.worldcoin.org` | Bridge connecting the World app to the browser (connection and *polling*) | **Yes** (connect-src) |
| `developer.world.org` | Verification API v4 (server) and privacy page | **Yes**, but only in the **relayer** |
| `world.org`, `staging.world.org`, `sandbox.world.org` | Links to open the World app (`/verify`) | Not a `fetch`; only user navigation |
| `simulator.worldcoin.org` | Simulator (tests) | Development only |
| **`world-id-assets.com`** | **Widget fonts** (`.woff2`) | **No** (third party) |
| `github.com`, `docs.world.org`, `eprint.iacr.org`, `mathiasbynens.be`, `www.w3.org` | Comments, documentation and namespaces | No (not requests) |

**Important finding:** the IDKit **widget** loads fonts from a third-party domain (`world-id-assets.com`), which **violates** `font-src 'self'` and the "no third parties" principle.

**Decision:** the `source-client`'s `ProofProvider` uses the **headless `@worldcoin/idkit-core`** package (generates the `connectorURI` and does the *polling*), and **our screen** draws the QR code and the button. This way the CSP stays only with `'self'` + `bridge.worldcoin.org`, with no third-party fonts. The runtime confirmation stays on the manual list M-01.

## V-08 — Newsroom as custodian (local Arkiv node)
| Check | Result |
|---|---|
| Creator extends before transferring | Allowed |
| Creator deletes after transferring | **Rejected** |
| Creator extends after transferring | **Rejected** |
| Third party extends (without flag) | **Rejected** |
| Newsroom (new owner) extends | Allowed |
| Newsroom changes the content (`readonly` entity) | **Rejected** |
| Newsroom transfers ownership to another account | Allowed |
| With `permissionlessExtension`: the relayer (non-owner) extends | **Allowed** |
| With `permissionlessExtension`: the relayer deletes | **Rejected** |
| With `permissionlessExtension`: a third party extends | Allowed (only increases retention; the cost is borne by whoever extends) |
| Newsroom deletes | Allowed |
| `$owner` after the transfer | The newsroom |
| `$creator` after the transfer | **Still the relayer** |

**Decisions**
1. The relayer creates the entity with `readonly` **and** `permissionlessExtension`, and transfers ownership to the newsroom.
2. This way the **renewal job** runs on the relayer **without being the owner** and **cannot delete** (RF-11, RF-18).
3. The newsroom can still delete and transfer: control is its own.
4. `$creator` is public as the relayer; that is expected (it does not identify the source).

## V-04 — Journalist subnames (local Sepolia fork)
| Check | Result |
|---|---|
| The subname resolves the reader key by name | Yes |
| `findOwner` returns the journalist | Yes |
| The journalist changes the resolver without a role | **Rejected** |
| `unsafeTransfer` without `CAN_TRANSFER_ADMIN` | **Rejected** |
| `safeTransferFrom` (even with `CAN_TRANSFER_ADMIN`) | **Rejected** (the registry is not "emancipated") |
| `unsafeTransfer` with `CAN_TRANSFER_ADMIN` | Allowed |
| Third party tries to revoke | **Rejected** |
| Administrator revokes (`unregister`) | Allowed, even after the journalist transfers |
| After revoking, `findOwner` | Zero address (no owner) |
| Administrator clears the revoked reader key in the resolver | Allowed |
| Administrator registers the same label again (revoked or expired) | Allowed |
| Administrator renews (`renew`) | Allowed |
| Third party renews | **Rejected** |
| After expiring: status and `findOwner` | Free / zero address |
| **After expiring: the reader key still resolves by name** | **Yes** (the resolver record remains) |

**Decisions**
1. **Who is an active journalist is decided by the registry, not by text:** `ens-client` must offer `isActiveJournalist(name)`, which checks that `findOwner` is different from zero, and **never** rely solely on `denuncia.readerkey` (it remains readable after expiring or revoking).
2. **Revoking = `unregister` + clearing `denuncia.readerkey` in the resolver**, in this order, and rotating the reader key.
3. **Journalists do not get `CAN_TRANSFER_ADMIN`:** subnames are not transferable (`safeTransferFrom` does not work in this registry and `unsafeTransfer` would require the role).
4. Only the administrator renews; set a subname term (for example, 1 year) with a renewal reminder.
5. Resolver permissions remain **per text key, across all names**: one resolver per newsroom (already decided).

## V-01 — Arkiv on Rabdi (real, 2026-11-01)
Network: Rabdi (chain 7794095), gas price 1 gwei, ~2 s blocks. `RELAYER` wallet (10 tGLM).

| Envelope size | Result | Cost (tGLM) |
|---|---|---|
| 1 KiB | accepted | 0,000168 |
| 16 KiB | accepted | 0,000695 |
| 64 KiB | accepted | 0,002662 |
| 120 KiB | accepted | 0,004958 |
| ~126 KiB (128.960 B) | accepted | 0,005201 |
| 128 KiB exactly (131.072 B) | **rejected** (no cause on the network) | 0 |
| 131.073 B | rejected **by the SDK** (above 131.072) | — |

| Other behavior | Result |
|---|---|
| Query by filter (`newsroom`) | Finds the entity |
| 30 s expiration | Exists before (1) and **disappears** after (0), as on the local node |
| `changeOwnership` to the newsroom | Allowed (cost 0,000043 tGLM) |
| Relayer extends without being the owner (`permissionlessExtension`) | **Allowed** (0,000043 tGLM) |
| Relayer deletes after transferring | **Rejected** |
| Newsroom extends | Allowed |
| Newsroom changes the content (`readonly`) | **Rejected** |
| `$owner` / `$creator` after the transfer | newsroom / relayer |

**Conclusions**
- Rabdi's behavior is **the same as the local node's** (practical limit of ~126 KiB, expiration, custody). The integration tests with the local node are representative.
- **Negligible cost:** ~0,00017 tGLM per small tip; 10 tGLM covers tens of thousands.
- Confirmed: the useful limit per entity is **128.960 bytes**; `PART_PAYLOAD_BYTES` (120 KiB) leaves room.

## V-03 — ENS on real Sepolia (2026-11-01)
Test name `swv035c8du.eth`; `OWNER` and `JOURNALIST` wallets. 13 transactions, 5.037.136 gas in total, **224 s** (of which ~70 s are the mandatory commit-reveal wait). The gas price on Sepolia was ~18 wei, so the ETH cost was negligible (~9 × 10⁻¹¹ ETH).

| Step | Gas |
|---|---|
| Create resolver (proxy) | 791.010 |
| Register commit | 127.458 |
| MockUSDC mint and approve | 140.589 and 128.274 |
| Register the `.eth` name | 655.997 |
| Text `denuncia.pubkey` / version / policy | 593.359 / 151.482 / 483.598 |
| Newsroom address (custodian) | 149.621 |
| Create the journalists' registry and link it to the name | 903.034 and 139.552 |
| Register the journalist's subname | 497.981 |
| Journalist reader key | 275.181 |

**Read by name (Universal Resolver): everything checked out** — public key, version, policy, custodian, reader key and subname owner.

**Conclusions**
- The flow works on the real network, same as the fork.
- **Each transaction takes ~10 s** on Sepolia. Registering a newsroom takes **about 4 minutes** with 13 transactions; the panel UX must show progress and the commit wait.
- **Optimization adopted:** the resolver has `multicall(bytes[])`; `ens-client` publishes the records (key, version, policy, address and relayer) in **one transaction**, instead of five.

## V-02 — completed (simulator, `staging`)
**Result (epoch 202611, actions `submit:v02-a.eth:202611` and `submit:v02-b.eth:202611`):**
| Proof | Result |
|---|---|
| A1 (person A, newsroom A) | ACCEPTED |
| B1 (person B, newsroom B) | ACCEPTED |
| A2 (person A again, newsroom A) | REJECTED (`limit_reached`) |

A1's nullifier equals A2's and differs from B's. **The anti-spam model per person×newsroom×epoch is confirmed** with the real v4 API (`developer.world.org`). Raw output in `validation/out/v02.json`.

**Limitation:** this was the simulator in `staging`; the proof with the real World App in `production` was not tested.

### How it was done (history)
The `worldid-gate` (Phase 6) is ready, and so is the real proof script: `validation/v02-worldid-proof.ts`. The dry run (`--dry`) already created a real request in IDKit and generated the connection link, meaning the `app_id`, the `rp_id` and the signing key are accepted by the World bridge.

**What you do (about 5 minutes):**
1. Run `npx tsx validation/v02-worldid-proof.ts` in the `safe-whistle` folder.
2. The script prints a link (3 times, one per proof: A1, B1 and A2). For each one, open https://simulator.worldcoin.org/ and paste the link; confirm the verification.
3. At the end it shows the summary and writes `validation/out/v02.json`.

**Expected result:** A1 accepted; B1 accepted; A2 rejected (`limit_reached`); A1's identifier (nullifier) equal to A2's and different from B1's. If so, the anti-spam model per action is **confirmed**. If the nullifier does not vary by action, rule RN-01 must be reviewed before the relayer.

| Validation | Status | Stand-in in use |
|---|---|---|
| V-02 | ✅ completed in the simulator | Simulated verifier only in automated tests |

## Addendum (Phase 5) — maximum lifetime of an entity in Arkiv
Discovered in the `arkiv-store` integration tests (local node): requesting a 365-day expiration was **rejected by the chain** with *"the expiry resolves to block …, more than the chain's maximum lifetime of 7884000 blocks"*. That is, **the maximum lifetime is 7.884.000 blocks (~182,5 days)**.

**Decisions**
- The store rejects retentions above `STORE_MAX_RETENTION_SECONDS` (chain ceiling minus 1 hour of slack, because of the block difference between creation and inclusion).
- The default retention for notes is **150 days**.
- **Periodic renewal becomes mandatory** (RN-06). The relayer job (Phase 7) must renew what expires within ~60 days.
- Not verified on Rabdi: the limit was measured on the local node; confirm on Rabdi when there is an opportunity (probably the same parameter).
