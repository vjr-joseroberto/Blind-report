# Phase 13 — Wallet, roles and authentication fixes

**Status:** **Part A (A1 to A6), B0 and Part B (B1 to B5) executed** with automated tests. **M-02** (real MetaMask) remains, manual.
> **Adjustment after use:** the login now has **two steps** (connect the wallet; then choose or create the newsroom), for those who do not yet have a newsroom. The "My newsrooms" list comes from the registry events (`findLabelsMintedTo`, validated on the fork) confirmed in ENS (`listAdministered`), plus the names remembered in the browser (the only storage exception, names only). One wallet can administer several newsrooms; each newsroom has a single administrator.
> **Defects fixed (reported in M-02):** (a) the registration form appeared for names that already existed: now it only appears if the registrar says the name is available (`isNameAvailable`, validated on the fork); an already registered name shows an explanation; (b) the backup button was disabled while the Inbox was reading Rabdi (the panel treated every read as "busy"): reads now have their own indicator (`loading`) and do not block the backup; the download uses a link in the document and releases the URL afterward; typed fields survive redraws; the backup text appears to copy if the browser blocks the download.
> **Previously fixed defect:** after registering a newsroom, an ENS read failure during role re-evaluation made the session go back to "Which newsroom?" and the panel discarded the client **with the keys**; upon re-entering, the backup button remained disabled. Now (1) the re-evaluation that fails keeps the session and the panel and shows the error; (2) there is one panel per newsroom during the session, so switching newsrooms does not lose the keys; (3) while there is no backup, the tabs show the warning, **Sign out** asks for confirmation and the browser warns when closing the tab.
> **Deviation from the plan:** instead of two controllers (administrator and journalist), there is only one (`controller.ts`) with a role guard per action (`canDo`), to avoid duplicating code; the permissions test covers the three roles. `updatePolicy` was also added to `newsroom-client` (editing the policy from the panel). Development with TDD, as in the previous phases.
**Rule that does not change:** the anonymity network phase (Phase 12, `99-tor-phase-BLOCKED.md`) remains **blocked**. This phase does not touch `GUARDRAILS.md`, `CLAUDE.md`, `.claude/hooks/` nor `guardrails/`, and no task creates anonymity network code, dependency or test. Mobile connection via WalletConnect is **out**, because it contacts third-party servers (violates RNF-04).
**Out of scope:** the source panel (`apps/web-source`) and `source-client` remain unchanged on screen; the only change in `source-client` is internal (authenticate replies, task A2).

## 1. Objectives
1. **Fix two security defects** recorded in `docs/08-security-review.md` (items 7 and 8):
   - any wallet can create a status note;
   - replies to the source are not authenticated.
2. **Refactor the newsroom panel**: log in by connecting the wallet (MetaMask), instead of pasting the private key; the panel discovers the role (**administrator** or **journalist**) and shows different tabs and actions for each, with a more intuitive interface and the same colors.

The current test wallets keep their roles: **OWNER = administrator**, **JOURNALIST = journalist**. `.env` does not change. To test in the browser, each test key is imported into MetaMask (test network, no real money); the panel only validates what the connected wallet is.

## 2. Part A — Authentication fixes

### 2.1 The idea (applies to both defects)
Arkiv records, for each entity, who **created** it (`creator`): this field is set by the chain and **cannot be forged** by whoever writes. The attributes (such as `byJournalist`) are only declarations. The new rule is:

> A note or a reply is only valid if the **entity's `creator`** is a wallet **authorized** by the newsroom: the **administrator** (custodial address in ENS) or an **active journalist** (owner of an active newsroom subname).

There is no new cryptography: the proof of authorship is the signature of the transaction itself, and authorization comes from ENS.

### 2.2 How the journalist is recognized
ENS does not enumerate subnames, so the entity declares who it claims to be: a new attribute **`authorName`** (the full name, for example `maria.jornalista1.eth`). The verifier checks three things:
1. `authorName` is an **active** journalist in the newsroom registry (`isActiveJournalist`);
2. the **owner** of that subname (`ownerOf`) is the entity's `creator`;
3. the subname belongs to the newsroom in question.

If the `creator` is the newsroom custodian, it is valid without `authorName`. Old entities (without `authorName`) are only valid if the `creator` is the custodian.

### 2.3 Decisions of this part
| ID | Decision | Reason |
|---|---|---|
| D-13-01 | Authorize by the entity's `creator` and by ENS, without an extra signature | Simpler and no new key to manage |
| D-13-02 | The verification is done **on read**, with the current ENS state | Does not require an indexer. Effect: when revoking a journalist, their old notes and replies stop being valid. Accepted and documented |
| D-13-03 | Invalid entities are **ignored and counted** | The panel shows "N ignored notes" and the source "N ignored replies", without hiding the attack |
| D-13-04 | The encrypted reply text carries the newsroom within it (`{v, newsroom, text}`) and the source checks it | Prevents reusing a legitimate reply from another newsroom |

### 2.4 Tasks (test first)
**A1 — `arkiv-store`: expose the author and filter by authorization**
- Check whether `EntityRow` already brings `creator`; if not, add it in both backends (memory and SDK).
- Attribute `authorName` (text, not indexed) in `anotacao` and `resposta`.
- `annotate` and `publishReply` receive `authorName` (optional).
- `listSubmissions` and `latestStatus` now accept `authorize(annotation)`; refused notes do not enter the status and are counted in `ignoredAnnotations`.
- `getReplies` returns `creator` and `authorName`.
- Tests: `anotacao_de_carteira_nao_autorizada_e_ignorada`, `contagem_de_ignoradas`, `status_volta_ao_anterior_se_a_ultima_anotacao_e_invalida`, `resposta_traz_o_criador`, same contract suite in both backends, and integration in the local node.

**A2 — `ens-client`: the newsroom authority**
- Pure function `createAuthority({ reader, newsroom })` → `isAuthorized({ creator, authorName })`, with cache per name during the read.
- Tests: administrator is valid without `authorName`; active journalist with correct owner is valid; journalist name with owner different from `creator` is not valid; subname of another newsroom is not valid; revoked journalist is not valid; without `authorName` and `creator` different from the custodian is not valid. (Reuses the existing reader; `ownerOf` and `isActiveJournalist` already exist.)

**A3 — `newsroom-client`: annotate and reply with authorship and read only what is valid**
- `setStatus` and `reply` send the `authorName` of the current role (or nothing, if it is the administrator).
- `listInbox`, `statusOf` and `listExpiring` use the authority to filter notes; the return includes `ignoredAnnotations`.
- Tests: `status_forjado_por_carteira_qualquer_nao_aparece`, `status_do_jornalista_ativo_aparece`, `status_do_jornalista_revogado_e_ignorado`, `inbox_informa_quantas_anotacoes_foram_ignoradas`.

**A4 — reply format (`crypto` and `newsroom-client`)**
- Encrypted reply becomes `{ v: 1, newsroom, text }` (D-13-04), with strict decoding.
- Tests: `resposta_com_redacao_errada_e_recusada`, `formato_antigo_e_tratado` (old plain text is only valid if the `creator` is the custodian).

**A5 — `source-client`: accept only authenticated replies**
- `readReplies` now checks each reply with the authority of the receipt's newsroom (the injected `reader` gains `isActiveJournalist` and `ownerOf`; it is still `ens-client`, with no new dependency).
- Returns `{ replies, ignored }`, with the name of who replied (`author`).
- Tests: `resposta_forjada_por_terceiro_e_ignorada` (correctly encrypted for the source, but unknown `creator`), `resposta_do_administrador_vale`, `resposta_de_jornalista_ativo_vale_e_mostra_o_nome`, `resposta_copiada_para_outra_caixa_e_ignorada`, `contagem_de_ignoradas`.
- **Source screen notice:** the source panel does not change layout, but the reply list now brings the author and the ignored count; displaying it is a small text in the same list.

**A6 — E2E (`tests/e2e`)**
- Add to the existing scenario: a strange wallet tries to annotate and reply, and the result is ignored; the active journalist annotates and replies, and it is valid; after revoking, it stops being valid.
- Update `docs/08-security-review.md` (items 7 and 8 become "fixed") and `docs/04-architecture-and-data.md` (new attributes).

**Done when:** unit, contract, integration and E2E tests pass; items 7 and 8 are listed as fixed.

## 3. Part B — Newsroom panel refactoring

### 3.1 Principles
- **Log in with the wallet.** The login screen no longer asks for a private key. Transactions are approved in MetaMask.
- **Discover the role.** After signing a login message, the panel checks in ENS whether the address is administrator, journalist or neither.
- **One interface per role.** Different tabs and actions; what the role cannot do does not appear.
- **Same visual.** Keeps `style.css` and the colors; changes the organization.
- **Encryption keys as today (option A).** The wallet signs; the encryption keys remain in the password backup (administrator) and in the keyring (journalist).
- **Source out.** No wallet on the source screen; it remains anonymous.

### 3.2 Login and roles
**Login flow**
1. The user enters the **newsroom** (`jornalista1.eth`) and, if a journalist, **their name** (`maria`). The administrator enters only the newsroom.
2. Clicks **Connect wallet**. The panel discovers the installed wallets (EIP-6963; `window.ethereum` as fallback) and uses only the provider injected in the browser.
3. The panel requests the **Sepolia** network; if missing, asks to switch.
4. The panel shows a message to sign (no gas cost), with site name, newsroom, random number and short validity. The signature proves control of the address (`verifyMessage`).
5. The panel queries ENS and defines the role.

**Role rules (`detectRole`, pure and tested function)**
| Condition | Role |
|---|---|
| Connected address = newsroom custodian (address record in ENS) | **Administrator** |
| `maria.<newsroom>` is an **active** journalist and the subname owner = connected address | **Journalist** |
| Any other case | **No access**, with the cause (nonexistent newsroom, journalist name not found, wallet different from the owner, revoked journalist) and what to do |

The session stays **in memory only**; reloading the page exits. Switching accounts in MetaMask ends the session and re-evaluates the role.

### 3.3 Panel structure by role
**Administrator**
| Tab | Content |
|---|---|
| **Home** | Newsroom status: name, key version, policy, how many new tips; **alerts** (backup not done, key not loaded, tips expiring, ignored notes) and next steps |
| **Inbox** | List, filters, open, decrypt, status, reply (the administrator also reads, since they have the keys) |
| **Team** | Register journalist (name, address, public read key), deliver keyring, revoke (with warning and shortcut to rotate the key), list of journalists registered in this session |
| **Keys and policy** | Rotate key, edit policy (categories, size, attachments), generate and download backup, import backup |
| **Retention** | What expires in N days and renewal |

**Journalist**
| Tab | Content |
|---|---|
| **Inbox** (default) | Same as the administrator's, without what depends on administration |
| **My key** | Generate the read key (keeps the private one on the device, shows the public one to send to the administrator) and import the received keyring; shows whether the box can already be opened |
| **Retention** | View and renew what expires (any wallet can extend, but only the active journalist sees the panel) |

The journalist **does not see** team registration/revocation, key rotation, policy or backup. If a button is called by mistake outside the role, the controller refuses (the rule applies in the code, not only on the screen).

### 3.4 Experience
- **First-steps guide** by role, with marking of what has already been done (e.g. "1. Wallet connected ✔ · 2. Import backup · 3. Register journalist").
- **Empty states that explain** what to do instead of blank lists.
- **Several approvals:** newsroom registration is 8 transactions; the screen shows "Confirm in the wallet (3 of 8)" with the name of each step.
- **Links to the blockchain** after each action: transaction hash on Etherscan (Sepolia) or address in the Arkiv explorer.
- **Confirmation before heavy actions** (revoke, rotate key) stating the effect.
- **Messages with cause and exit**, in the same pattern as the current screens.
- **Accessibility:** labels, visible focus, keyboard navigation, tabs with `role="tablist"`.

### 3.5 Architecture
- `apps/web-newsroom/src/wallet.ts`: wallet adapter over an injected **EIP-1193** interface (`request`, `on`), to swap for a fake wallet in tests. Functions: discover, connect, switch network, sign, watch account change.
- `packages/newsroom-client/src/login.ts`: builds the login message and verifies it (`verifyMessage`, validity, unique number).
- `packages/newsroom-client/src/access.ts`: `detectRole` and `canDo(role, action)`, the permission table used by the controllers.
- `apps/web-newsroom/src/session.ts`: session state (connected, role, newsroom).
- Separate controllers: `admin-controller.ts` and `journalist-controller.ts`, over the `newsroom-client`, both checking `canDo`.
- Reading continues through the configured public RPC (via `guardedFetch`); only **signing and sending** goes through the wallet. Sending from the wallet uses its RPC, which is outside the app's control and is documented.
- The pasted private key no longer exists in the interface. The E2E tests continue to use local viem wallets by code, without a browser.

### 3.6 Decisions of this part
| ID | Decision | Reason |
|---|---|---|
| D-13-05 | Role = custodian in ENS (administrator) or owner of an active subname (journalist) | Uses only what is already in ENS |
| D-13-06 | Journalist informs their own name when logging in | ENS does not enumerate subnames |
| D-13-07 | Injected wallet only; no WalletConnect | Avoids third-party servers |
| D-13-08 | Option A for the encryption keys | Keeps password backup; deriving from the wallet remains as a possible future Phase |
| D-13-09 | Session in memory only | Same secrets rule as the current panel |
| D-13-10 | Test wallets keep their roles; imported into MetaMask by the user | No key passes through the chat nor changes `.env` |

### 3.7 Tasks (test first)
**B0 — Short investigation (before everything)** — ✅ **completed** (`validation/B0-RESULT.md`, script `validation/b0-arkiv-wallet-spike.ts`)
> **Result:** the Arkiv SDK writes with `createWalletClient({ account: <address>, chain, transport: custom(provider) })`, and the four operations (create, read, extend, change ownership) worked with a fake EIP-1193 provider, without an adapter. Each write becomes a single `eth_sendTransaction`. Rabdi: chainId 7794095 (`0x76edaf`), currency tGLM (18 decimals), explorer `https://rabdi.explorer.arkiv.network`; the access key goes in the RPC path, so it stays in the user's wallet configuration (decide whether that is acceptable). **Not verified:** real MetaMask (prompts, gas estimation, chain switching), which is left for M-02. The app must call `eth_requestAccounts` and `wallet_switchEthereumChain` before using the address.
Verify, on testnet, whether the Arkiv SDK signs through a browser provider (account of type address, custom transport) and whether MetaMask accepts the Rabdi network (chain id comes from the SDK itself). **Decision point:** if it does not work, choose between a minimal adapter for Arkiv or keeping, only for Arkiv, a local session signature; the decision is recorded here before proceeding. Controller tests use a fake provider and do not depend on this.

**B1 — `login.ts` and `access.ts`**
- Tests: `mensagem_tem_dominio_redacao_numero_e_validade`, `assinatura_valida_confere_o_endereco`, `assinatura_de_outro_endereco_e_recusada`, `mensagem_expirada_ou_reutilizada_e_recusada`, `detectRole` for the five cases, `canDo` for each role and action (journalist does not administer).

**B2 — `wallet.ts` (EIP-1193 adapter)**
- Tests with fake provider: `conecta_e_le_o_endereco`, `pede_troca_para_sepolia`, `recusa_do_usuario_vira_mensagem_clara`, `assina_a_mensagem`, `troca_de_conta_encerra_a_sessao`, `sem_carteira_instalada_mostra_orientacao`.

**B3 — Session and controllers by role**
- Tests: administrator can register journalist and rotate key; journalist receives refusal on administrative actions; account change re-evaluates the role; `sem_acesso` brings the cause; "3 of 8" progress in registration.

**B4 — Screens**
- Login, **Home**, **Inbox**, **Team**, **Keys and policy**, **My key**, **Retention**, tabs with `role="tablist"`, transaction links, first-steps guide, empty states.
- Update the static HTML/CSP tests (no new hosts; the wallet does not use the app's network) and the secrets test (the screen does not ask for a private key).
- Update `docs/06-screens.md` with the new wireframes.

**B5 — Documentation and walkthrough**
- `docs/09-manual-walkthrough.md`: how to import the test keys into MetaMask, add Sepolia and the Arkiv network, and the test order by role.
- New manual list **M-02** (real wallet), below.

## 4. Manual list M-02 (MetaMask, on the testnets)
1. Connect with the **OWNER** wallet: logs in as **administrator**; sees Home, Team, Keys and policy, Retention.
2. Connect with the **JOURNALIST** wallet, entering the registered name: logs in as **journalist**; does not see Team nor Keys and policy.
3. Connect with a **third wallet**: "No access" with the cause.
4. Switch accounts in MetaMask with the panel open: the session ends and the role is re-evaluated.
5. Register the newsroom: 8 approvals, each with the transaction link.
6. Annotate and reply as a journalist: the transactions appear in the Arkiv explorer with the journalist's address.
7. Try to annotate with the third wallet (by script or through the explorer): the note does not appear in the status; the panel shows "1 ignored note".
8. Through the source screen, read the journalist's reply (appears with the name) and confirm that a forged reply is ignored.
9. Record the result in `validation/RESULTS.md`.

## 5. Execution order and dependencies
```
A1 ─► A2 ─► A3 ─► A4 ─► A5 ─► A6        (fixes; independent of the interface)
B0 ─► B1 ─► B2 ─► B3 ─► B4 ─► B5        (panel; B3 uses A3)
```
Suggestion: do **A1 to A6 first**, since the new interface depends on `authorName` and the authority; **B0** can run in parallel, as it is a quick investigation.

## 6. Risks
| Risk | Mitigation |
|---|---|
| The Arkiv SDK may not sign through a browser provider | B0 before the rest; decision point recorded |
| Revoking a journalist invalidates their history (D-13-02) | Documented; the newsroom can record a new status as administrator |
| Journalist role depends on the user entering their own name | Guidance on the screen; error with the cause |
| Smart wallet (contract) as administrator is not supported (contract signature) | Out of scope; documented |
| Sending through MetaMask uses its RPC (third party) | Unavoidable; outside the app; documented in `docs/08` |
| Many approvals in registration (8) | Clear progress and links; there is no way to avoid it |

## 7. Done when
- `npm run ci` green, with new tests in the affected packages and coverage goals maintained;
- `npm run test:integration` and `npm run test:e2e` green, with the authorship scenarios;
- `docs/08` with items 7 and 8 fixed; `docs/04`, `docs/06` and `docs/09` updated;
- **M-02** done by you and recorded;
- the newsroom panel without a private key field;
- no change in `GUARDRAILS.md`, `CLAUDE.md`, hook or `guardrails/`.
