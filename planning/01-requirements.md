# Application requirements

References: use cases in `../docs/01-use-case.md`; components in `../docs/03-components.md`.

## 1. Project constraints
| ID | Constraint |
|---|---|
| RC-01 | **No Tor or anonymity networks** (no code, tests, dependencies, configuration or commands). See `../GUARDRAILS.md` |
| RC-02 | The MVP uses a common **public RPC**, configurable by the user |
| RC-03 | Fictitious test data only |
| RC-04 | No own contract; uses only the ENSv2 contracts |
| RC-05 | Test networks: Sepolia (ENS) and Rabdi (Arkiv) |
| RC-06 | Simple MVP code, developed with **TDD** |
| RC-07 | Monorepo in TypeScript |
| RC-08 | **All tests are scripts run in Node, without a browser** (no Playwright, Selenium or similar). Therefore the front-end logic lives in interface-less clients (`source-client`, `newsroom-client`) |

## 2. Functional requirements
Priority: **M** = mandatory in the MVP, **S** = desirable, **C** = can be left for later.

| ID | Requirement | UC | Prior. | Component |
|---|---|---|---|---|
| RF-01 | Register a newsroom: create its own resolver and register the `.eth` name pointing to it | UC-01 | M | ens-client, web-newsroom |
| RF-02 | Publish and read in ENS the newsroom's public key, key version, policy and relayer | UC-02, 05 | M | ens-client |
| RF-03 | Rotate the public key by incrementing the version | UC-02 | S | ens-client |
| RF-04 | Register a journalist as a subname with a read key | UC-03 | M | ens-client |
| RF-05 | Revoke a journalist and prevent them from receiving new tips | UC-04 | S | ens-client |
| RF-06 | Resolve the newsroom name and show verified name, key version and policy | UC-05 | M | ens-client, web-source |
| RF-07 | Encrypt the tip in the client (envelope with wrapped content key) | UC-06 | M | crypto |
| RF-08 | Generate the mailbox and the local receipt for the source | UC-06 | M | crypto, web-source |
| RF-09 | Require proof of unique human and limit to one tip per person per newsroom per epoch | UC-06 | M | worldid-gate, relayer |
| RF-10 | Publish the tip to Arkiv through the relayer | UC-06 | M | relayer, arkiv-store |
| RF-11 | Transfer custody of the entity to the newsroom and mark it `readonly` | UC-06, 13 | M | arkiv-store, relayer |
| RF-12 | List tips by newsroom, status and category | UC-07 | M | arkiv-store, web-newsroom |
| RF-13 | Decrypt the tip in the journalist's browser | UC-07 | M | crypto, web-newsroom |
| RF-14 | Record the status of a tip in a note entity | UC-08 | S | arkiv-store |
| RF-15 | Reply to a source through the mailbox and allow them to read the reply | UC-09, 10 | M | crypto, arkiv-store |
| RF-16 | Verify the date and integrity of a published file | UC-11 | S | crypto, arkiv-store, web-source |
| RF-17 | Prove authorship by revealing text and `salt` | UC-12 | C | crypto, web-source |
| RF-18 | Renew the expiration of retained tips | UC-13 | S | arkiv-store, relayer |
| RF-19 | Split attachments above the entity limit into parts and reassemble them | UC-06, 07 | S | core, arkiv-store |
| RF-20 | Configure the RPC and apply the allowed-hosts policy | UC-14 | M | network-policy |
| RF-21 | Apply the newsroom policy (categories, size, epoch) on submission | UC-06 | M | core, relayer |

## 3. Non-functional requirements
| ID | Category | Requirement | Verification |
|---|---|---|---|
| RNF-01 | Secrecy | No private key or original text leaves the user's device | Script test with the **request recorder** (`fetch` injected in the clients and in the relayer): confirms the absence of original text and private keys in every sent body |
| RNF-02 | Privacy | No stored attribute identifies the source; only the hash of `(nullifier, action)` is kept | Schema and gate storage test |
| RNF-03 | Integrity | Changing the newsroom, key version or category invalidates opening the envelope | Unit and property test |
| RNF-04 | Third parties | The client loads no trackers or third-party scripts or sources; it contacts only declared hosts | Request recorder in script tests; static analysis of the generated HTML and bundle (no third-party hosts); generated CSP test; **manual checklist M-01** before launch (`06-decision-tests-without-browser.md`) |
| RNF-05 | **Network guardrail** | No code, dependency, test or configuration uses Tor, Nym, Nox, I2P, Lokinet, anonymity SOCKS or Anon-RPC | `npm run guardrails`, dependency test, network policy at runtime |
| RNF-06 | Testability | TDD development; line coverage ≥ 90% in `core` and `crypto`, ≥ 80% in the rest | Coverage report in CI |
| RNF-07 | Simplicity | Small functions, no heavy framework, no abstraction before necessity | Review and lint |
| RNF-08 | Performance | Encrypt 100 KiB in under 100 ms; end-to-end submission within 15 s on the test network | Script performance test in Node (**goal to validate in Phase 0**); optional manual browser check in list M-01 |
| RNF-09 | Usability | Exportable receipt; error messages that state the cause and what to do | Client tests (errors with readable cause and exportable and restorable receipt); manual screen review in list M-01 |
| RNF-10 | Network portability | Works over any network and with configurable RPC | Test with replaceable RPC |
| RNF-11 | Observability | The relayer logs neither IP nor request body | Test that inspects the logs |
| RNF-12 | Open source | Open source license (to be defined) | License file in the repository |
| RNF-13 | Determinism | Injectable clock and randomness in the logic modules | Tests without dependence on real time |

## 4. Business rules
| ID | Rule |
|---|---|
| RN-01 | A person submits at most one tip per newsroom per epoch; the proof action is `submit:<newsroom>:<epoch>` |
| RN-02 | Only the administrator writes `denuncia.*` in the newsroom's resolver |
| RN-03 | Each newsroom has its own resolver |
| RN-04 | The envelope carries the key version with which it was encrypted; the newsroom keeps the old keys |
| RN-05 | The proof of humanity is never stored together with the content |
| RN-06 | A tip that expires without renewal is lost; the newsroom or the job renews it. **The maximum lifetime of an entity on chain is ~182 days (7,884,000 blocks)**, so renewal is mandatory and periodic (at most every ~180 days; the store limits the request to 1 hour below the ceiling) |
| RN-07 | The relayer transfers custody to the newsroom immediately after creating the entity |
| RN-08 | The receipt exists only on the source's device; losing it means losing the reply box |
| RN-09 | The proof made for one action (newsroom, epoch) is not valid for another |

## 5. Acceptance criteria (examples)
**RF-07 / RNF-03 — encryption**
- Given a text and the newsroom's public key, when I encrypt, then the newsroom opens it and a third party does not.
- Given an envelope, when I change the *ciphertext*, the category or the newsroom, then opening fails.

**RF-09 / RN-01 — limit**
- Given a person who has already submitted to newsroom A in epoch E, when they try again, then the relayer refuses with the cause "limit reached".
- When they submit to newsroom B in epoch E, or to A in the next epoch, then it is accepted.

**RF-11 / RN-07 — custody**
- Given a published tip, when the relayer tries to delete it after transferring custody, then the operation is refused.

**RF-15 — reply**
- Given a tip with mailbox M, when the newsroom replies, then only the source with the receipt for M can decrypt; another person cannot.

**RF-20 / RNF-05 — network**
- Given any module, when it tries to contact a host outside the allowed list, then the call is refused before leaving.

## 6. Traceability
| UC | RF | Plan phases |
|---|---|---|
| UC-01 | RF-01 | 4, 9 |
| UC-02 | RF-02, RF-03 | 4, 9 |
| UC-03, UC-04 | RF-04, RF-05 | 4, 9 |
| UC-05 | RF-06 | 4, 8 |
| UC-06 | RF-07 to RF-11, RF-19, RF-21 | 2, 3, 5, 6, 7, 8 |
| UC-07 | RF-12, RF-13 | 3, 5, 9 |
| UC-08 | RF-14 | 5, 9 |
| UC-09, UC-10 | RF-15 | 3, 5, 8, 9 |
| UC-11, UC-12 | RF-16, RF-17 | 3, 8 |
| UC-13 | RF-18 | 5, 7 |
| UC-14 | RF-20 | 1 |
