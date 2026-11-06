# World ID (IDKit): short report

Track **Best Use of IDKit**. This text answers what the track asks for: credential verified on the server, justification for the minimum credential, success path and alternative paths, and what we learned.

## 1. What World ID is used for
An anonymous tip channel needs to block **spam without identifying the source**. World ID proves that whoever sends is **a real, unique person**, without revealing who they are. The product rule is: **one tip per person, per newsroom, per month**.

## 2. Credential used and why
- **`proofOfHuman`** (unique human), requested with `IDKit.request({...}).preset(proofOfHuman())` and `allow_legacy_proofs: false`.
- **Minimum credential:** we only need to know that the person is unique. We do not request age, nationality or any other data, because none of that would help block spam and each extra data point would bring the proof closer to identification.

## 3. How the proof is used
1. The source screen asks the relayer for the **proof context** (`GET /rp-context`). The relayer **signs it on the server** (the signing key never goes to the browser).
2. The proof **action** is `submit:<newsroom>:<month>`. The returned identifier (*nullifier*) depends on the person **and** the action: the same person in another newsroom, or in another month, generates another identifier, and the submissions cannot be linked.
3. IDKit delivers the proof; the screen sends it to the relayer together with the encrypted envelope.
4. The relayer **verifies on the server** (`POST developer.world.org/api/v4/verify/{rp_id}`), checking the **environment**, the **action** and the **identifier**.
5. It stores only a **hash** of the identifier with the action (to block the second submission) and **never** stores it together with the tip.

Code: `packages/worldid-gate` (context, verifier, store and gate), `packages/source-client/src/idkit.ts` (request in the browser) and `apps/relayer` (use on submission).

## 4. Success path and alternative paths
| Situation | Result |
|---|---|
| Valid proof, first time in the month | **Accepted**; the tip is published |
| Person **denies**, the request **expires** or they **cancel** | **Nothing is sent**; the screen explains the cause and keeps the text |
| Second tip from the same person to the same newsroom in the month | **Refused** (`limit_reached`), with a clear message |
| Proof for **another action** or **another environment** | **Refused** (`wrong_action`, `wrong_environment`) |
| Proof rejected by the World API | **Refused** (`proof_rejected`); the reservation is returned if publication fails afterwards |
| Proof from one newsroom used in another | **Does not count** (the action is different) |

## 5. What was validated
- **Real proof in the World simulator (test environment, fake identities):** the first proof was accepted; the one for another newsroom, too; the second submission from the same person to the same newsroom was **refused**. The identifier of the first and third proofs is **the same**, and **different** from the one for another newsroom (`validation/RESULTS.md`, V-02, `validation/out/v02.json`).
- **Automated tests:** `packages/worldid-gate` (gate, verifier, store, signature) and the E2E, which walks through the per-person limit with a simulated verifier.

## 6. What we learned
- IDKit's **default widget** loads fonts from a World third-party domain, which conflicts with a "no third-party trackers" requirement (CROPS). We use the **headless** package (`@worldcoin/idkit-core`) and build the screen ourselves.
- The **action** is the key piece of the design: embedding `newsroom + month` in it gives the right limit and prevents linking submissions across newsrooms.
- The request must be **signed on the server**; signing in the browser would expose the key.
- Storing only the **hash** of the identifier is enough to block repetition and avoids accumulating linkable data.

## 7. Limits
- Everything was done in the **test environment** and in the **simulator**; the proof with the World app in **production** was not validated.
- Opening the proof link in the World app connects the person's phone to World servers. World sees that someone proved to be human for that newsroom in that month, but does not see the text.
