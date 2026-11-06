# Manual walkthrough — Phase 0

What **you** need to do by hand to unblock validation, and what I do on my own. Complements `02-phase-0-validation.md`.

## 1. My assessment of your plan
**Validate Phase 0 before closing the design: I agree.** But **do not wait for all of Phase 0 to start programming.** I separated it like this:

| Part | Can it start now? | Why |
|---|---|---|
| Phases 1 to 3 (skeleton, network policy, `core`, `crypto`) | **Yes, in parallel** | They depend on no validation nor external access |
| Phases 4 to 7 (ENS, Arkiv, World ID, relayer) | **After the validations** that affect them | They are the edges where reality can change the design |

The validations most likely to change the design are, in order:
1. **V-02 (real World ID proof):** the entire anti-spam assumes that the `nullifier` is different per action. If it is not, rule RN-01 and the `worldid-gate` change.
2. **V-01 (Arkiv on Rabdi):** cost per tip and real byte limit may differ from the local node.
3. **V-03 (ENS on real Sepolia):** the flow was validated on a fork; the real network may have different time and cost.

## 2. What I do without you
They do not need an account, wallet or ETH. I can run them as soon as you say:

| Validation | How | Where |
|---|---|---|
| **V-04** Subnames: expiration, revocation, transfer | Against the local Sepolia fork | Docker |
| **V-08** Newsroom as custodian (`changeOwnership`) | Against the local Arkiv node | Docker |
| **V-05** Hosts that IDKit contacts | Static analysis of the installed package | Local |
| **V-06** Public RPC limits | Burst of reads on a common public RPC | Common network |
| **V-07** Encryption performance | Node script | Local |

## 3. What depends on you
Each item has an estimated time, steps, "how to know it worked" and what to bring me.

### M-1. Test wallets (≈ 10 min)
I need **three new wallets, for testing only, never used with real money**:
- `owner` — newsroom administrator (registers the `.eth` name and publishes the key);
- `relayer` — publishes the tips to Arkiv;
- `journalist` — test journalist.

**Steps**
1. Generate the keys **locally**, without pasting them into any site: in the `POC-ENS` folder, run  
   `node --input-type=module -e "import {generatePrivateKey as g, privateKeyToAccount as a} from 'viem/accounts'; for (const n of ['owner','relayer','journalist']) { const k=g(); console.log(n, a(k).address, k) }"`
2. Store the keys **only in a local `.env` file** (section 4) and note the **addresses** (addresses are public).

**How to know it worked:** you have 3 addresses and 3 keys in a `.env` outside git.
**What to bring me:** only the **3 addresses**. **Never** paste private keys or seed phrases in the chat.

### M-2. Sepolia ETH (≈ 10 to 60 min, depends on the faucet limits)
For the `owner` (name registration, resolver, texts) and a little for the `journalist`.

**How much:** ~0.05 ETH in `owner`; ~0.01 ETH in `journalist`.
**Suggested faucets** (availability and limits vary): Google Cloud Web3 Faucet (Sepolia), `faucets.chain.link/sepolia`, browser mining faucet `sepolia-faucet.pk910.de`. Beware of fake sites: do not connect a personal wallet or enter a seed phrase.

**How to know it worked:** the balances appear in a Sepolia explorer or when querying the RPC.
**What to bring me:** confirmation that the balances arrived.
**Unblocks:** V-03.

### M-3. Arkiv: access key and tGLM (≈ 15 to 30 min)
**Steps**
1. At `hub.arkiv.network/access-keys`, connect the **`relayer`** wallet and **sign the login message** (the signature proves possession of the wallet and **does not** send a transaction).
2. Complete the registration if the Hub asks: choose the **Rabdi** network, give the project a name and solve the captcha; click generate.
3. At `hub.arkiv.network/faucet`, request **tGLM** for `relayer` and also for `owner` (the newsroom needs gas to extend or delete the entities it receives).

**How to know it worked:** the Hub shows the key; the tGLM balance appears in both wallets.
**What to bring me:** the **access key** in `ARKIV_ACCESS_KEY` in `.env` (secret, do not paste in chat) and confirmation of the balances. Also note the tGLM amount the faucet delivered.
**Unblocks:** V-01.
**Note:** it is one key per wallet per network; it has a monthly quota.

### M-4. World ID: app in the Developer Portal (≈ 30 to 60 min; it is the most uncertain step)
**Steps**
1. Create an account and an **app** in the World Developer Portal.
2. Make sure the app is on version **World ID 4.0** (the API answered "app not migrated" for a test identifier).
3. Create an **action** for the flow, for example `submit:teste:202611`, and an app **signing key**.
4. To generate proofs without a phone, use the **simulator** (`simulator.worldcoin.org`) with the `staging` environment.

**The exact screen names may vary:** if something does not match, tell me what appears and I will adjust.

**How to know it worked:** you have `app_id`, `rp_id` and the signing key, and you can open the simulator.
**What to bring me:** `app_id` and `rp_id` (identifiers, not secret) and the **signing key** as `RP_SIGNING_KEY` in `.env` (secret).
**Unblocks:** V-02 (the most important).

### M-5. Small decisions (≈ 10 min)
| Decision | My suggestion | You decide |
|---|---|---|
| **Epoch** of the limit of one tip per person | Monthly | ☐ |
| **Default public RPC** for Sepolia | A common and stable RPC (V-06 will measure it) | ☐ |
| Open source **license** | MIT or Apache-2.0 | ☐ |
| **Own repository** for `safe-whistle` | Create a new repository (private until the end) | ☐ |

**What to bring me:** the four answers.

### M-6. Local environment (≈ 5 min)
Confirm that **Docker is running** (`docker ps`) and that there is disk space for the images (anvil and Arkiv node). Nothing else is needed.

## 4. Where to store secrets
- The file is **`safe-whistle/.env`** (already created, permission 600, **outside git**). The template with all variables is in `.env.example`. The three test wallets have already been generated; you just need to fill in `ARKIV_ACCESS_KEY`, `WORLD_APP_ID`, `WORLD_RP_ID` and `RP_SIGNING_KEY`.
- `safe-whistle` now has **its own git repository** (`safe-whistle/.git`), which will be the GitHub one. `.env` is in `.gitignore`: check with `git check-ignore -v .env` before any commit. The folder is also inside the larger `projetos` repository; do not add `safe-whistle/` to it.
- **No secrets in the chat.** I read the variables from the environment when I run the scripts.
- Testnet only, new wallets only. No Tor or anonymity networks (`../GUARDRAILS.md`).

## 5. Suggested order
```
You:   M-5 (decisions) ─► M-1 (wallets) ─► M-2 (ETH) ──┐
                                      └──► M-3 (Arkiv) ─┼─► M-4 (World ID)
Me:    V-04, V-05, V-06, V-07, V-08 (without you) ─────┘
       Phases 1, 2, 3 in parallel (skeleton, core, crypto)
```
1. **Now:** M-5 and M-1. In parallel I run V-04, V-05, V-06, V-07 and V-08 and start Phases 1 to 3.
2. **Then:** M-2 and M-3 (the faucets may take time, so request early).
3. **Finally:** M-4, which is the most uncertain; start early if you can, because V-02 weighs more.

## 6. When Phase 0 is complete
- V-01 to V-08 have a result recorded in `validation/RESULTS.md`, or are **marked as blocked by access**, with the stand-in defined.
- The M-5 decisions have been made.
- If any result contradicts the design (for example, nullifier is not per action), **I update `docs/` and `01-requirements.md` before** starting Phases 4 to 7.

## 7. If an access does not come through
| Blockage | Consequence | Plan |
|---|---|---|
| No tGLM or Arkiv key | V-01 pending | Proceed with the local node; reserve the validation and the review of the byte limit and cost |
| No World app | V-02 pending | Proceed with the simulated verifier; rerun V-02 when there is access and review the `worldid-gate` |
| No Sepolia ETH | V-03 pending | Proceed with the local fork; V-03 becomes the first task when there is ETH |
