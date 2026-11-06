# Use case

## 1. Problem
Anyone who has evidence of corruption, fraud or abuse and wants to hand it to a newspaper faces four problems at once:

1. **Risk of exposure.** E-mail, messengers and forms store IP, time and identifiers. A central platform is a single target for attack, subpoena or leak.
2. **The source does not know whether they are talking to the right newsroom.** Fake profiles and cloned sites capture tips from people who thought they were talking to the newspaper.
3. **The newsroom is flooded** with spam and fabricated tips and cannot filter them without identifying the source.
4. **No one can later prove** that a document existed on a date or that it was not altered.

## 2. Solution
Safe Whistle is a system in which:

- the **newsroom has a verifiable public name** (`investiga.jornal.eth`) that publishes its encryption key on ENS;
- the **source encrypts in the browser** and only the newsroom opens the content;
- the **source proves they are a real, unique person** (World ID) without revealing who they are, which limits spam;
- the tip becomes an entry in **Arkiv** with a **public hash and date**;
- the newsroom **replies** to a source it never identified, through a reply box (mailbox) derived from an ephemeral key;
- anyone can **verify the date and integrity** of a published document.

## 3. Actors
| Actor | Description |
|---|---|
| **Source** | The person who reports. Has no account, e-mail or "own" wallet |
| **Newsroom administrator** | Registers the newsroom, publishes the public key, manages journalists and the intake policy |
| **Journalist** | Reads, decrypts, classifies and replies to tips. Has an ENS subname (`maria.investiga.jornal.eth`) |
| **Relayer** | System service: verifies the World ID proof, pays the gas and publishes to Arkiv on behalf of the source |
| **Verifier** | Anyone who checks the date and hash of a published document |

## 4. Use cases
| ID | Use case | Primary actor |
|---|---|---|
| UC-01 | Register newsroom | Administrator |
| UC-02 | Manage the newsroom public key (publish and rotate) | Administrator |
| UC-03 | Register journalist | Administrator |
| UC-04 | Revoke journalist | Administrator |
| UC-05 | Look up newsroom (resolve the name, view key and policy) | Source |
| UC-06 | Submit tip | Source |
| UC-07 | Read and decrypt tips | Journalist |
| UC-08 | Classify tip (status) | Journalist |
| UC-09 | Reply to source | Journalist |
| UC-10 | Receive reply | Source |
| UC-11 | Verify date and integrity | Verifier |
| UC-12 | Prove authorship of a tip | Source |
| UC-13 | Maintain retention (renew expiration) | Relayer / Administrator |
| UC-14 | Configure the RPC | Any user |

## 5. Main flows

### UC-06 — Submit tip
**Preconditions:** the newsroom exists and has published its key and policy on ENS; the source has the browser's default receipt.
1. The source enters the newsroom name. The system resolves ENS and shows the verified name, the key version and the policy (UC-05).
2. The source chooses the category, writes the text and attaches files allowed by the policy.
3. In the browser, the system generates a content key, encrypts everything, wraps the key for the newsroom's public key and generates an ephemeral reply key (mailbox).
4. The source proves they are a unique person with World ID. The proof action is `submit:<newsroom>:<epoch>`.
5. The system sends the envelope to the relayer.
6. The relayer verifies the proof, checks the limit of one tip per person per newsroom per epoch, validates format and size and publishes to Arkiv.
7. The relayer transfers custody of the entity to the newsroom and marks it as immutable.
8. The source receives a **local receipt** (identifier, hash, `salt`, mailbox private key). **Without the receipt, they lose the reply box.**

**Alternative flows**
- *Proof denied, expired or cancelled:* nothing is published; the source sees the cause.
- *Limit reached:* the relayer refuses with the message "there has already been a submission this epoch".
- *File above the single-entity limit:* the system splits it into parts (RF-19).
- *Newsroom key rotated during submission:* the relayer refuses due to a stale version; the client re-fetches the key and redoes the encryption.

### UC-07 — Read and decrypt
1. The journalist connects the wallet; the system checks on ENS that the subname belongs to them and is active.
2. The system queries Arkiv by newsroom and status.
3. The private key **stays in the journalist's browser**; decryption is local.

### UC-09 / UC-10 — Reply
1. The newsroom encrypts the reply for the source's ephemeral key and publishes it with the mailbox identifier (hash of the ephemeral key).
2. The source periodically queries by that identifier and decrypts with the receipt.

### UC-11 / UC-12 — Verification and authorship
- The verifier pastes the published file; the system computes the hash and compares it with the public entry and the creation date.
- The source proves authorship by revealing the original text and the `salt`: the commitment (`commitment`) matches.

## 6. Business rules
1. A person can submit **one** tip per newsroom per epoch; between newsrooms the proof identifiers are different.
2. Only the administrator writes the newsroom's public key and policy.
3. Each newsroom has **its own resolver** on ENS.
4. The envelope carries the **key version** with which it was encrypted; old keys are preserved by the newsroom.
5. The proof of humanity is **never** stored together with the content.
6. Retention in Arkiv is limited: a tip that expires **disappears**; the newsroom must renew it.
7. All demonstration data is fictitious.

## 7. Out of scope for the MVP
- Network anonymity (IP protection is the user's choice, with a VPN or another tool, **outside the app**).
- Multiple relayers, mobile app, content moderation, legal value of the proof.
- Attachment storage outside Arkiv (Swarm).

## 8. Assumed limits
| The system promises | The system does not promise |
|---|---|
| Content unreadable to third parties | Anonymity against someone watching the whole network |
| Authenticity of the newsroom (via ENS) | Protection if the source's device is compromised |
| Spam limit without identifying the source | Anonymity before the relayer or RPC operator |
| Public proof of date and integrity | Legal value of the proof (depends on the jurisdiction) |

The relayer and the RPC **see the IP** of whoever connects. This is a declared limit of the product.
