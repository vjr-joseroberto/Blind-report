# Manual walkthrough on testnets (checklist M-01)

Goal: run each service by hand, connected to the **real testnets**, and check each effect on the blockchain. No Docker and no local nodes. **No anonymity network**: use your normal network (or a VPN, if you want, on your own).

## 0. Before starting
- Folder: `safe-whistle/`. Run `npm install` once.
- The `.env` is already validated (test wallets, Arkiv key, `app_id`, `rp_id`, World signing key). **Never paste keys in chats or screenshots.**
- Find your addresses and links: `npm run links` (only prints public addresses).
- Each terminal below stays open while you test.

## 1. Services
| # | Service | What it is for | How to run | Where to open |
|---|---|---|---|---|
| 1 | **Relayer** | Receives the encrypted tip, checks the World proof, publishes to Arkiv (pays the gas) and delivers custody to the newsroom. Renews retention | `ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173 npm run relayer` (after registering the newsroom, restart with `NEWSROOMS=yourname.eth` in front, for the renewal job) | `http://127.0.0.1:8787/health` should respond `{"ok":true}` |
| 2 | **Newsroom panel** | Registers the newsroom on ENS, generates the key, lists and decrypts tips, changes status, replies, registers journalists, renews retention | `npm run web:newsroom` | `http://127.0.0.1:5174` |
| 3 | **Source screen** | Looks up the newsroom, encrypts, proves humanity (World ID), submits, saves the receipt, reads replies and verifies files | `npm run web:source` | `http://127.0.0.1:5173` |
| 4 | **World simulator** | Plays the role of the World App in the `staging` environment | Browser, without installing anything | https://simulator.worldcoin.org/ |

Order: 1 → 2 → 3. All three use the testnets: **Sepolia** (ENS), **Arkiv Rabdi** (tips) and **World `staging`** (proof).

## 2. Where to see each thing on the blockchain
| Technology | What it shows | Link |
|---|---|---|
| **Sepolia (ENS)** | Registration, key, journalist and rotation transactions | https://sepolia.etherscan.io — search for the administrator address (`npm run links`) or `/tx/<hash>` |
| **Arkiv Rabdi** | Tip, reply and note entities; custody transferred | https://rabdi.explorer.arkiv.network — search for the relayer address (creates) and the administrator address (notes, replies). *The path `/address/<address>` is the standard of this type of explorer; it was not checked* |
| **Arkiv access key and balance** | Arkiv Hub | https://hub.arkiv.network |
| **World ID** | Application, `app_id` and `rp_id` | https://developer.world.org (docs: https://docs.world.org). **The World proof is verified by the API, not on the blockchain**: there is no transaction to see |
| **ENS name** | Name resolution | https://sepolia.app.ens.domains/yourname.eth *(may not display ENSv2 names)*; the safe proof is to read the records through the panel/Etherscan |

## 3. Step by step and what to check
| Step | Action | What happens | Check on the blockchain |
|---|---|---|---|
| 1 | Start the relayer (service 1) | Reads `.env`, validates the configuration and listens on `:8787` | `curl http://127.0.0.1:8787/health` → `{"ok":true}`; no transaction yet |
| 2 | Panel (service 2): **Log in** with the OWNER wallet key (copy it from `.env` locally) and the Arkiv key | Stays only in memory | — |
| 3 | **Configuration → Register newsroom** (unique name, e.g. `sw-<your initials>-<number>`; categories; size) | 8 transactions in ~4 min (resolver Deploy Proxy, Commit, Mint, Approve, Register, records Multicall, registry Deploy Proxy, Set Subregistry) | Etherscan, OWNER address: the transactions appear one by one. At the end, `yourname.eth` registered and the records `denuncia.pubkey`, `.pubkey.version`, `.policy` |
| 4 | **Generate backup** (password ≥ 8) and download it | Private keys protected by password | — (keep the file) |
| 5 | Restart the relayer with `NEWSROOMS=yourname.eth` in front of the command | The renewal job starts covering the newsroom | — |
| 6 | Source (service 3): **Search** `yourname.eth` | Reads key, version and policy on ENS | Compare the version and the policy with the records on Etherscan |
| 7 | Write, choose the category, **Continue** | Encrypts in the browser; opens the proof request | — |
| 8 | Copy the proof link and paste it at https://simulator.worldcoin.org/ (service 4); approve | The relayer checks the proof on the World API | Nothing on-chain. See `{"route":"POST /submissions","status":201}` in the relayer log |
| 9 | **Save the receipt** (download) and check the box | The receipt exists only on your device | Arkiv explorer, **relayer** address: the entity creation transaction appeared and the one for **ownership transfer** to the OWNER. The content is **unreadable** (encrypted) |
| 10 | Submit again with the same simulator identity | Refused: "You have already submitted to this newsroom this month" | No new transaction in Arkiv |
| 11 | Panel → **Inbox → Refresh → Open** | Decrypts in the browser | The text matches what you wrote; in Arkiv there are only encrypted bytes |
| 12 | **Mark: under review** | Creates a note entity | Arkiv, OWNER address: new transaction; the tip entity **did not change** |
| 13 | **Send reply** | Creates an encrypted reply entity for the source's box | Arkiv, OWNER address: new transaction |
| 14 | Source → **Replies**: load the receipt | Reads and decrypts the reply | The reply only opens with your receipt |
| 15 | Panel → **Download envelope (.sw)**; Source → **Verify**: enter the newsroom and the file | "The hash matches" and "Exists in Arkiv since block N" | Look for block N in the Arkiv explorer. To prove authorship: paste the receipt and the original text |
| 16 | Panel → **Team**: generate the reader key, register `maria` with the JOURNALIST address, generate the keyring | Subname `maria.yourname.eth` on ENS | Etherscan, OWNER: `register` and `setText` transactions |
| 17 | Panel → **Rotate the key** | Publishes version 2 on ENS | Etherscan, OWNER: transaction with `denuncia.pubkey.version = 2`. Old tips continue to open |
| 18 | Panel → **Retention → See what expires in 30 days** | List (empty now) | Warning: the maximum life is ~182 days |

## 4. If something fails
| Symptom | Likely cause |
|---|---|
| The source screen shows "Could not start" | The `config.json` in `dist` is invalid, or you opened the file without a server. Use `npm run web:source` |
| Browser console shows "violates Content Security Policy" | The app tried a host outside the list. **Note the host**: that is exactly what M-01 is looking for |
| Error "No connection to the submission server" | Relayer stopped, or the origin is not in `ALLOWED_ORIGINS` (use `127.0.0.1` or `localhost` according to the URL opened) |
| Newsroom registration fails with "name not available" | Choose another name (Sepolia `.eth` names are global) |
| Balance error on registration | The OWNER wallet lacked test ETH (Sepolia needs ~0.01 ETH for the 8 transactions) |
| Arkiv read slow or refused in the Replies/Verify tabs | Without an access key the Rabdi public endpoint has a rate limit; try again in a moment |
| Limit reached when testing again | Delete `data/claims.jsonl` (local proof store) and restart the relayer, or use another identity in the simulator |

## 5. Recording the result
Record in `validation/RESULTS.md` (section M-01): date, browser, each step (✓/✗), hosts seen in the network tab, perceived time to encrypt ~100 KiB and the error messages read (proof denied, limit reached, name does not exist). If any third-party host appears, **stop and let me know**.


---

# Walkthrough M-02: newsroom panel with MetaMask (Phase 13)

The newsroom panel **no longer asks for a private key**: you log in with the wallet. The test wallets keep their roles: **OWNER = administrator** and **JOURNALIST = journalist**.

## Preparation (once)
1. Install MetaMask in the browser.
2. **Import the test keys into MetaMask** (Accounts → Import account), copying them from `.env` locally: `OWNER_PRIVATE_KEY` and `JOURNALIST_PRIVATE_KEY`. Testnet only, wallets with no real money. Give the accounts names (Administrator, Journalist) and create a third empty account (Stranger).
3. The **Sepolia** network already exists in MetaMask (enable "show test networks"). The **Rabdi** network (Arkiv) the screen asks to add on the first Arkiv action: confirm. It uses the Arkiv access key you enter at login; without a key, the public endpoint has a rate limit. Network data: id 7794095, currency tGLM, explorer https://rabdi.explorer.arkiv.network.
4. Start `npm run web:newsroom` (and, for the full flow, the relayer and the source screen).

## Steps
| # | Action | Expected result |
|---|---|---|
| 1 | Select the **Administrator** account, open `http://127.0.0.1:5174` and click **Connect wallet** | MetaMask asks for connection, switches to Sepolia and asks to **sign** (no gas). The next screen is "Which newsroom?" |
| 1b | In **My newsrooms**, open yours (or type `jornalista1.eth` and click Enter; for a new one, use **Create a new newsroom**) | Enters as **Administrator** with the tabs Home, Inbox, Team, Keys and policy, Retention. The list comes from blockchain events and may be incomplete; if something is missing, type the name |
| 2 | **Keys and policy** tab → import the backup (or, if the newsroom does not exist yet, the screen offers to register it) | Keys loaded; the getting-started guide advances. If registering: MetaMask asks for 8 confirmations and the screen shows "n of 8" |
| 3 | Check in **Sent transactions** | Each hash becomes a link to Etherscan: open it and confirm on the blockchain |
| 4 | **Team** tab: register the journalist (name, Journalist account address and the public reader key they generated) | 2 transactions (`register` and `setText`) with links; generate the keyring and deliver it |
| 5 | Select the **Journalist** account in MetaMask. The panel warns that the account changed and ends the session | Connect again and, in **Join another newsroom**, enter the newsroom and the journalist **name** (e.g. `maria`): enters as **Journalist** with the tabs Inbox, My key, Retention. Team and Keys and policy **do not** appear |
| 6 | **My key**: generate the reader key (if not generated yet) and import the keyring | The inbox starts opening the tips |
| 7 | Mark a status and reply to a tip | MetaMask asks to add/switch to Rabdi and confirm; the transaction appears in the Arkiv explorer **with the journalist's address** |
| 8 | On the source screen, open Replies with the receipt | The reply appears with the journalist's name; no "ignored" one |
| 9 | Select the **Stranger** account, connect and type the newsroom | Enters as **No access** with the cause ("enter your journalist name") |
| 10 | With the Stranger account, enter `maria` | "belongs to another wallet" |
| 11 | Try to note/reply with the Stranger account (script or explorer) | The panel shows "N note(s) ignored" and the source screen, "N reply(ies) ignored" |
| 12 | As administrator, revoke `maria` (two-step button) | 2 transactions; what Maria noted/replied no longer counts; the panel recommends rotating the key |

## What to note
If MetaMask refuses the Arkiv network, if Arkiv does not sign, if gas is not estimated or any error: copy the exact message. That is the B0 point that only real MetaMask answers. Record the result in `validation/RESULTS.md` (section M-02).
