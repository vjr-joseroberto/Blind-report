# Screens and flows (wireframes)

Principles: few screens, simple text, no third-party font, image or script, works without login. Every screen only connects fields to the corresponding client (`source-client`, `newsroom-client`); business logic stays in the clients. Error messages state the **cause** and **what to do**.

Conventions: `[ ]` field, `( )` option, `[Button]`, `⚠` warning.

## A. Source app (`apps/web-source`)

Navigation: three fixed tabs at the top: **Submit** · **Replies** · **Verify**. Footer always visible: `RPC: publicnode… [change]`.

### A1. Submit — step 1: choose the newsroom
```
┌──────────────────────────────────────────────┐
│ Safe Whistle        Send | Replies | Verify  │
├──────────────────────────────────────────────┤
│ Which newsroom?                              │
│ [ investiga.eth                    ] [Search]│
│                                              │
│ ⚠ Check the name with the newsroom through   │
│   another channel. Anyone can create a name. │
└──────────────────────────────────────────────┘
```
States: searching · invalid name ("use the name.eth format in lowercase") · not found · invalid records ("the newsroom published an incorrect configuration").

### A2. Submit — step 2: confirm the newsroom and write
```
┌──────────────────────────────────────────────┐
│ ✔ investiga.eth        key v2                │
│   Accepts: health, corruption · up to 100 KB │
│   Attachments: no · Limit: 1 submission/month│
├──────────────────────────────────────────────┤
│ Category    ( ) health  ( ) corruption       │
│ Text        [                              ] │
│             [                              ] │
│ Attachment  [Choose file]  (if accepted)     │
│ Size: 1.2 KB of 100 KB                       │
│                                              │
│ Your text is encrypted on this device before │
│ it leaves. Only the newsroom can open it.    │
│                              [Continue]      │
└──────────────────────────────────────────────┘
```
Real-time validation with `validateSubmission` (category, size, attachment).

### A3. Submit — step 3: prove you are a person
```
┌──────────────────────────────────────────────┐
│ Prove that you are a real and unique person. │
│ This does not reveal who you are.            │
│                                              │
│   ┌───────────┐                              │
│   │ link/QR   │  Open World App and confirm  │
│   └───────────┘  [Copy link]                 │
│ Waiting for confirmation… (expires in 9:40)  │
│                              [Cancel]        │
└──────────────────────────────────────────────┘
```
The MVP shows the proof link; the local QR is for Phase 11 (no external service). States: waiting · denied · expired · cancelled (all return to step 2 with the text preserved).

### A4. Submit — step 4: receipt
```
┌──────────────────────────────────────────────┐
│ ✔ Tip sent                                   │
│                                              │
│ ⚠ KEEP THE RECEIPT NOW. It is the only way   │
│   to read replies and prove authorship. We   │
│   keep no copy: if lost, you lose access.    │
│                                              │
│ [Download receipt (.json)]  [Copy]           │
│ ( ) I saved the receipt       [Finish]       │
└──────────────────────────────────────────────┘
```
"Finish" only enables after checking the box. The receipt is never sent to a server.

### A5. Submission errors (messages)
| Relayer code | Text |
|---|---|
| `limit_reached` | "You have already submitted to this newsroom this month. Try next month." |
| `stale_key_version` | (automatic) "The newsroom changed the key; we encrypted again." No user action. |
| `proof_rejected` and similar | "The proof was not accepted. Try again." |
| `epoch_mismatch` | "The month changed during submission. Try again." |
| `publish_failed` / network | "Could not submit now. Your text is still here; try again." |

### A6. Replies
```
┌──────────────────────────────────────────────┐
│ Open your receipt to see the replies.        │
│ [Choose receipt (.json)]  or  [Paste]        │
│                                              │
│ Replies from investiga.eth                   │
│  • 12/11 14:02  "We received it. Let's talk…"│
│  • (none other)                    [Refresh] │
└──────────────────────────────────────────────┘
```
Without a receipt, the tab shows nothing.

### A7. Verify
```
┌──────────────────────────────────────────────┐
│ Verify a published file                      │
│ Newsroom [ investiga.eth ]                   │
│ File [Choose file (.sw)]                     │
│ ✔ Exists in Arkiv since block 1234 (≈ date)  │
│ ✔ The hash matches                           │
│ ─ Prove authorship (optional)                │
│ Original text [          ]  Salt [        ]  │
│ ✔ You are the sender  /  ✖ Does not match    │
└──────────────────────────────────────────────┘
```

### A8. Network configuration
Dialog in the footer: field for RPC (https or localhost), list of contacted hosts (RPC, relayer, World). Proxies are refused. The anonymity network (VPN/Tor Browser) is the user's choice **outside the app**; the app only warns about this in one line.

## B. Newsroom panel (`apps/web-newsroom`) — Phase 13

Login through the **wallet** (MetaMask or another browser wallet). No private key is typed. The panel discovers the role on ENS and shows different tabs and actions.

### B0. Two-step login
**Step 1: connect the wallet.** That is all: no newsroom name.
```
┌──────────────────────────────────────────────┐
│ Sign in with the wallet                      │
│ Arkiv access key  [ ******* ] optional       │
│                         [Connect wallet]     │
└──────────────────────────────────────────────┘
```
The wallet switches to Sepolia and signs a message (no gas, 5 min validity, unique number). If it is not installed, the screen says how to install it.

**Step 2: choose the newsroom.**
```
┌──────────────────────────────────────────────┐
│ Which newsroom?      wallet 0xdC35…037e      │
│ ┌ My newsrooms ────────────────────────────┐ │
│ │ jornalista1.eth · administrator   [Open] │ │
│ │ outra.eth · journalist (maria)    [Open] │ │
│ │ [Refresh list]                           │ │
│ └──────────────────────────────────────────┘ │
│ ┌ Create a new newsroom ───────────────────┐ │
│ │ [ my-newsroom.eth ]        [Continue]   │ │
│ └──────────────────────────────────────────┘ │
│ ┌ Join another newsroom ───────────────────┐ │
│ │ Newsroom [        ]  My name [maria]     │ │
│ │                            [Join]        │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```
- **My newsrooms** combines two sources: (1) those the wallet **administers**, found in the ENS registry events and confirmed on ENS (they have the Safe Whistle records and the custodian is the wallet); (2) the **names remembered** in this browser. The search only looks at recent blocks and may be incomplete; the screen warns and the "Join another newsroom" field covers the rest.
- **Create new**: if the name is free, the panel offers registration (8 transactions) and the wallet becomes administrator. A wallet can have several newsrooms.
- **Journalist** does not appear in the automatic list (ENS does not say which newsrooms a wallet has a subname in): you type the newsroom name and your name; afterwards it is remembered.
- **Switch newsroom** (button at the top) returns to this step without signing again. Within the same session, the keys of each open newsroom remain **in memory**: when you return to it, nothing is lost. **Sign out** erases everything.
- **Backup effectively mandatory:** while the administrator has keys loaded and has not generated the backup, all tabs show the warning "Generate the backup now", the **Sign out** button asks for confirmation and the browser warns when the tab is closed.
- **Storage exception:** the browser stores, per wallet, only the **names** of open newsrooms (never keys, passwords, receipts or backups).

### B1. Roles
| Result | When | What appears |
|---|---|---|
| **Administrator** | The wallet is the newsroom's custodian on ENS | Home · Inbox · Team · Keys and policy · Retention |
| **Journalist** | The wallet owns an active subname (`maria.newsroom.eth`) | Inbox · My key · Retention |
| **No access** | Any other case | The cause and what to do (journalist name, wrong wallet, revoked, newsroom does not exist) |

If the newsroom **does not exist** on ENS, the "no access" screen offers to **register the newsroom**: whoever registers it becomes the administrator. Switching accounts in the wallet ends the session.

### B2. Home (administrator)
```
 Newsroom jornalista1.eth               [Administrator]  [Sign out]
 ┌ Getting started ───────────────────────────┐
 │ ✔ Wallet connected                         │
 │ ○ Load the keys (backup)         ← next    │
 │ ○ Generate and save the backup             │
 │ ○ Register the journalists                 │
 └────────────────────────────────────────────┘
 ⚠ 2 status notes ignored (author is not from the newsroom)
 Summary: key v2 · 14 tips · new 3 · under review 5 …
```

### B3. Inbox (administrator and journalist)
List with filters, open (decrypts in the browser), download attachment and `.sw` envelope, mark status, reply to the source. When empty, the screen explains how to load.

### B4. Team (administrator)
1. Register journalist (name, address, public reader key): 2 transactions.
2. Deliver the keyring (text encrypted for their public key).
3. Revoke: a **two-step** button that warns that already-delivered keys continue to open old tips.

### B5. Keys and policy (administrator)
Rotate the key (two steps), policy (categories, size, attachments, 1 transaction), password backup (generate/download) and import backup.

### B6. My key (journalist)
1. Generate the reader key (the private one stays only with them; the public one goes to the administrator).
2. Import the received keyring.

### B7. Retention (administrator and journalist)
What expires in 30 days and renew everything (150 days).

### B8. Transactions
Each action that uses the wallet shows, in "Transactions sent in this session", the link of each transaction in the network explorer (Etherscan on Sepolia; Rabdi explorer on Arkiv). During newsroom registration, the screen shows "confirm in the wallet (n of 8)".

## C. Common interface rules
- Language: English; short texts; no jargon ("receipt", not "mailbox").
- Accessibility: labels on all fields, visible focus, high contrast, works with keyboard only.
- No trackers, no external fonts, CSP from `cspFor` (network policy).
- Secrets (private key, receipt, salt) never go to `localStorage` without the user asking; the default is tab memory.
- Visual verification: manual checklist M-01 (Phase 11).
