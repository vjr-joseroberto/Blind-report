# Development plan

Order: **validation** first, then one component at a time, always with **TDD** (`04-tdd-strategy.md`). Each phase only starts with the previous one green. Relative effort: **S** (small), **M** (medium), **L** (large). No dates: the plan is by dependency.

```
Phase 0 Validation ─► 1 Foundation ─► 2 core ─► 3 crypto ─► 4 ens-client ─► 5 arkiv-store
                                                                           │
                         6 worldid-gate ◄──────────────────────────────────┘
                                │
                                ▼
                        7 relayer ─► 8 source-client + web-source ─► 9 newsroom-client + web-newsroom
                                                                              │
                                                                              ▼
                                                          10 e2e by script ─► 11 hardening
                                                                                               │
                                                                    12 Tor ── ⛔ BLOCKED ◄───┘
```
Packages 2 to 6 are independent from each other after `core`: they can advance in parallel.

**All tests are scripts run in Node, without a browser** (decision in `06-decision-tests-without-browser.md`). Therefore the front-end logic lives in **interface-less clients** (`source-client`, `newsroom-client`), and the front-ends are thin layers on top of them.

Legend for each phase: **Goal**, **Tests first** (list in the order of the cycles), **Done when**, **Risks**.

---

## Phase 0 — Validation (effort M)
> **Status:** V-01, V-03, V-04, V-05, V-06, V-07 and V-08 completed; V-02 completed in the simulator (`validation/RESULTS.md`).
Detailed in `02-phase-0-validation.md`. **Done when** the results V-01 to V-08 are recorded or blocked by access with a defined stand-in.

---

## Phase 1 — Monorepo foundation and guardrail at runtime (S)
> **Status:** ✅ completed.
**Goal:** monorepo skeleton, test tooling and the **network policy at runtime**.

**Tests first**
1. *dependency guardrail:* "no `package.json` in the monorepo contains an anonymity-network package" (fails when adding an example forbidden package).
2. `network-policy`:
   - `permite_host_da_lista`;
   - `recusa_host_fora_da_lista` (typed error `HostNotAllowedError`, before any call);
   - `recusa_esquema_diferente_de_https_e_localhost`;
   - `recusa_proxy_socks` in the configuration;
   - `gera_csp_apenas_com_os_hosts_declarados`;
   - `rpc_configuravel_entra_na_lista_somente_se_https_ou_localhost`.
3. *contract:* "packages only import what the dependency rule allows".
4. `npm run ci` runs the stages in order and fails at the first with an error.

**Deliverable:** `package.json` with workspaces, `tsconfig.base.json`, Vitest configuration, `packages/network-policy`, `tests/contract`, `tests/fixtures/docker-compose.yml`, `ci` script.
**Done when:** `npm run ci` passes in a repository empty of logic; the guardrail and network policy tests pass.
**Risks:** tool configuration takes longer than expected. Response: keep the minimum (npm workspaces, Vitest, TypeScript).

---

## Phase 2 — `packages/core` (S)
> **Status:** ✅ completed.
**Goal:** types and pure rules, no network (RF-19, RF-21, RN-01).

**Tests first**
1. `epochOf`: `mesma_data_mesma_epoca`, `virada_do_mes_muda_a_epoca`, `usa_utc` (injected clock).
2. `actionFor`: `formata_submit_redacao_epoca`; `redacoes_diferentes_geram_acoes_diferentes`.
3. `parsePolicy`: `aceita_politica_valida`; `recusa_json_malformado`; `recusa_categorias_vazias`; `aplica_padroes_quando_campo_ausente`.
4. `validateSubmission(policy, submission)`: `recusa_categoria_fora_da_politica`; `recusa_tamanho_acima_do_maximo`; `recusa_anexo_quando_politica_nao_aceita`.
5. `splitIntoParts` / `joinParts`: `divide_em_partes_no_limite`; `junta_devolve_o_original` (property); `ordem_invertida_ainda_remonta`; `parte_faltando_gera_erro`.
6. Constants: `limite_de_parte_cabe_com_folga_no_limite_da_entidade`.

**Done when:** coverage ≥ 90%; no network access (test that fails if `fetch` is called).
**Risks:** defining the epoch (monthly) — product decision: record in `docs/`.

---

## Phase 3 — `packages/crypto` (M)
> **Status:** ✅ completed.
**Goal:** envelope, mailbox and commitment (RF-07, RF-08, RF-13, RF-15, RF-16, RF-17). Reference: `POC-Cofre/poc-cripto`; **rewrite with tests**.

**Tests first**
1. `newKeypair`: `gera_chaves_de_32_bytes`; `duas_chamadas_geram_chaves_diferentes`.
2. `seal` / `open`:
   - `destinatario_abre_o_envelope`;
   - `segundo_destinatario_tambem_abre`;
   - `outra_chave_nao_abre`; `nao_destinatario_nao_abre`;
   - `alterar_ciphertext_falha`; `alterar_categoria_falha`; `alterar_redacao_falha`; `alterar_versao_da_chave_falha`.
3. Properties (fast-check): `abrir(cifrar(x)) == x` for any bytes; `mesmo_texto_gera_envelopes_diferentes`.
4. `contentHash` and `verifyContentHash`: `hash_confere`; `adulteracao_e_detectada`.
5. `commitment`: `confere_com_texto_e_sal`; `falha_com_outro_texto`; `falha_com_outro_sal`.
6. Mailbox and replies: `mailbox_id_e_estavel`; `mailboxes_diferentes_geram_ids_diferentes`; `redacao_responde_e_fonte_abre`; `terceiro_nao_abre_a_resposta`.
7. Format: `ciphertext_em_binario_sem_base64`; `serializa_e_desserializa_o_envelope` (round trip); `envelope_de_100_KiB_cabe_em_uma_entidade_ou_e_dividido`.
8. No network: the package does not import network modules.

**Done when:** coverage ≥ 90%; properties pass with 1,000 runs; performance: 100 KiB in under 100 ms (goal validated in V-07).
**Risks:** cryptography error. Response: libsodium only, no own primitive, cross review.

---

## Phase 4 — `packages/ens-client` (M)
> **Status:** ✅ completed: 30 unit tests (100% line coverage) and 11 integration tests against the local Sepolia fork (`npm run test:integration`).
> **Decisions that the implementation confirmed:** the newsroom records are published in **a single transaction** (`multicall`); journalists live under the newsroom's second-level `.eth` (`<journalist>.<newsroom>.eth`); the active journalist is decided by the registry.
**Goal:** ENS reading and administration (RF-01 to RF-06). Reference: `POC-Cofre/poc-ens`, `POC-ENS/src`.

**Tests first (unit, no network)**
1. `dns.encode`: `codifica_nome_em_formato_dns`; `recusa_rotulo_invalido`.
2. `parseRecords`: `extrai_chave_versao_politica`; `faltando_chave_gera_erro_claro`; `chave_com_tamanho_errado_gera_erro`.
3. `buildSetterCalldata`: builds the `setText` call with the name in DNS format.

**Integration tests (local Sepolia fork)**
4. Reader: `resolve_chave_politica_e_versao_pelo_nome`; `nome_inexistente_devolve_erro_tipado`; `resolve_subname_sem_registro_pelo_resolver_pai`.
5. Administration: `cria_resolver_proprio`; `registra_nome_com_commit_reveal` (advanced fork clock); `publica_chave_e_versao`.
6. Permissions: `jornalista_sem_role_nao_troca_a_chave`; `admin_de_uma_redacao_nao_escreve_no_resolver_de_outra`.
7. Rotation: `rotaciona_e_incrementa_a_versao`.
8. Journalists (result of V-04):
   - `cadastra_subname_com_chave_de_leitura_e_sem_papel_de_transferencia`;
   - `jornalista_ativo_e_decidido_pelo_registry_e_nao_pelo_texto` (after revoking or expiring, the key still resolves, but `isActiveJournalist` is false);
   - `revoga_com_unregister_e_limpa_a_chave_de_leitura`;
   - `terceiro_nao_revoga_nem_renova`;
   - `renova_o_prazo_do_subname`;
   - `permite_recadastrar_o_rotulo_depois_de_revogar_ou_expirar`.
9. Custodian: `le_o_endereco_da_redacao_como_custodiante`.

**Done when:** integration tests pass against the fork; contract addresses in **configuration** (not spread through the code); coverage ≥ 80%.
**Risks:** ENSv2 redeployed. Response: ABIs and addresses in a single versioned file; integrity test that fails if the contracts have no code.

---

## Phase 5 — `packages/arkiv-store` (M)
> **Status:** ✅ completed (see the end of the section): 44 unit tests and 14 integration tests against the local Arkiv node.
> **Finding:** the chain limits the lifetime of an entity to **7,884,000 blocks (~182.5 days)**; the store validates this and renewal is mandatory.
**Goal:** persistence and query (RF-10 to RF-12, RF-14, RF-15, RF-18, RF-19). Reference: `POC-Cofre/poc-arkiv`.

**Tests first (unit with in-memory repository)**
1. Schemas: `rejeita_atributo_que_identifica_a_fonte`; `envelope_vai_em_bytes_e_nao_em_atributo`.
2. `publishSubmission` (result of V-08): `cria_entidade_com_atributos_indexados`; `marca_readonly_e_permissionlessExtension`; `transfere_custodia_para_a_redacao`; `depois_da_transferencia_o_relayer_nao_apaga_mas_ainda_estende`.
3. Query: `lista_por_redacao_e_status`; `filtra_por_categoria`; `exige_ao_menos_um_filtro`; `ordena_no_cliente_por_data_de_criacao`; `pagina_em_blocos_de_100`.
4. Replies: `busca_por_mailbox_id`; `outro_mailbox_nao_devolve_nada`.
5. Notes: `registra_status_sem_alterar_o_envelope`.
6. Retention: `estende_expiracao_antes_do_vencimento`; `nao_estende_para_data_anterior`.
7. Large attachments: `divide_e_grava_partes`; `remonta_na_leitura`.

**Integration tests (local Arkiv node)**
8. The same behaviors against the real node: `terceiro_nao_apaga`; `relayer_nao_apaga_depois_da_transferencia`; `entidade_expirada_some_da_consulta`; `128_KiB_exatos_sao_recusados_e_o_limite_pratico_e_respeitado`.

**Done when:** unit and integration tests pass; real cost and limits reconciled with V-01.
**Risks:** difference between local node and Rabdi. Response: V-01; limit constants in `core`.

---

## Phase 6 — `packages/worldid-gate` (S)
> **Status:** ✅ completed (58 tests, 99% lines). The real proof (V-02) was validated in the simulator in `staging`: A1 and B1 accepted, A2 refused (`limit_reached`).
> **Extras that the implementation brought:** the gate returns a releasable reservation (`release`) for the relayer to return the slot if publication fails; the reservation is atomic against simultaneous attempts; the persistent store keeps only hashes.
**Goal:** anti-spam (RF-09, RN-01, RN-05, RN-09). Reference: `POC-Cofre/poc-worldid`.

**Tests first (simulated verifier)**
1. `rpContextFor`: `gera_assinatura_amarrada_a_acao`; `acoes_diferentes_geram_assinaturas_diferentes`; `expira_no_prazo_definido` (injected clock).
2. `SubmissionGate.admit`:
   - `aceita_a_primeira_denuncia`;
   - `bloqueia_a_segunda_na_mesma_redacao_e_epoca`;
   - `permite_outra_redacao`; `permite_proxima_epoca`;
   - `recusa_replay_entre_redacoes`;
   - `recusa_ambiente_errado`;
   - `recusa_prova_invalida`;
   - `recusa_nullifier_malformado`.
3. Store: `guarda_apenas_o_hash_do_par`; `nao_guarda_a_prova`.
4. Contract: the simulated and the real verifier share the same contract suite.

**Validation tests (`@validation`)**
5. With the World simulator: real proof accepted; second on the same action, blocked.

**Done when:** tests with stand-in pass; contract test of the real verifier marked `@validation` documented.
**Risks:** without app in the Developer Portal, only the stand-in. Response: keep the verifier contract stable.

---

## Phase 7 — `apps/relayer` (M)
> **Status:** ✅ completed: 43 unit tests (95% lines) and 4 integration tests with ENS (fork), Arkiv (local node) and the relayer together. The complete flow was proven: the newsroom decrypts the tip and the custody belongs to it. API documented in `docs/05-relayer-api.md`.
> **Decisions:** the submission body is JSON with the envelope in base64url; cheap checks come before the call to the World API; the proof reservation is returned if publication fails.
**Goal:** HTTP service that joins the packages (RF-09 to RF-11, RF-18, RF-21, RNF-11).

**Tests first (with stand-ins of the packages)**
1. `GET /health`: `responde_ok`.
2. `GET /rp-context`: `devolve_assinatura_para_a_acao_da_epoca_corrente`; `recusa_redacao_inexistente`.
3. `POST /submissions`:
   - `aceita_envio_valido_e_responde_com_o_identificador`;
   - `recusa_prova_invalida (403)`;
   - `recusa_limite_atingido (409)`;
   - `recusa_versao_de_chave_desatualizada (409, asks for re-encryption)`;
   - `recusa_categoria_fora_da_politica (422)`;
   - `recusa_corpo_acima_do_maximo (413)`;
   - `transfere_a_custodia_depois_de_criar`;
   - `nao_publica_se_a_prova_falhar`.
4. Privacy: `nao_registra_ip_nem_corpo_nos_logs`; `resposta_nao_inclui_dados_da_prova`.
5. Renewal (job): `renova_denuncias_proximas_do_vencimento`; `nao_renova_quando_nao_e_custodiante`; `repete_com_recuo_quando_o_rpc_falha`.
6. Network: `so_contata_os_hosts_permitidos`.

**Integration:** relayer + local fork + local Arkiv node + simulated verifier: `fluxo_de_envio_completo`.
**Done when:** unit and integration tests pass; logs verified.
**Risks:** the relayer sees the IP. Response: no IP logs; limit declared in `docs/`.

---

## Phase 8 — `packages/source-client` and `apps/web-source` (M)
> **Status:** ✅ completed (automated tests). `source-client`: 41 tests; `web-source`: 21 (DOM-less controller + static analysis of the HTML/bundle + generated CSP). Screens designed in `docs/06-screens.md`. **Pending, manual only:** M-01 (Phase 11) and the proof with the World App/simulator through the screen.
> **Decisions:** encrypted content = JSON `{text, attachment?}` (`core/payload`); the receipt also stores the newsroom and the entity key; the screen is the composition root (wires real ENS and Arkiv) and the logic stays in the `source-client`; the CSP comes from `cspFor` and is written into the HTML by the build.
> **Known limits:** (1) no local QR yet: the screen shows the proof link; (2) reading replies in Arkiv without an access key uses Rabdi's public endpoint (rate-limited), and an access key in the public app would be exposed, so it stays optional and empty; (3) the CSP in `<meta>` does not apply `frame-ancestors`: the static server must also send the CSP as a header; (4) the bundle brings default library URLs (list reviewed in `static.test.ts`), all blocked by the network policy and the CSP; (5) the hosts that IDKit contacts in the browser beyond `bridge.worldcoin.org` will only be confirmed in M-01.
**Goal:** all the source-side logic (RF-06 to RF-09, RF-15 to RF-17, RF-20) in an **interface-less client**, plus a thin screen layer on top.

**Part A — `source-client` (logic; tests without browser)**
Injected dependencies: `fetch` (wrapped by `guardedFetch`), ENS client, clock, randomness and a `ProofProvider` (on screen it uses the **headless package `@worldcoin/idkit-core`**, without the widget, because of third-party sources — V-05; in tests it is a stand-in).

1. Lookup: `resolve_nome_e_devolve_chave_versao_e_politica`; `nome_inexistente_gera_erro_claro`.
2. Assembly: `so_aceita_categoria_da_politica`; `recusa_arquivo_acima_do_tamanho`; `divide_anexo_grande_em_partes`.
3. Submission:
   - `cifra_antes_de_enviar` (a **request recorder** confirms that no body contains the original text);
   - `nao_envia_a_chave_privada_nem_o_sal`;
   - `pede_a_prova_com_a_acao_da_redacao_e_da_epoca`;
   - `nao_envia_se_a_prova_for_negada`, `expirada` or `cancelada`;
   - `refaz_a_cifragem_quando_o_relayer_diz_versao_desatualizada`;
   - `traduz_os_erros_do_relayer_para_causas_legiveis`.
4. Receipt: `serializa_e_restaura_o_recibo`; `sem_recibo_nao_abre_respostas`.
5. Replies: `consulta_por_mailbox_e_decifra`; `ignora_resposta_de_outro_mailbox`.
6. Verification: `confere_hash_e_data`; `prova_autoria_com_texto_e_sal`.
7. Network: `so_contata_hosts_declarados`; `rpc_configuravel_pelo_usuario`.

**Part B — `web-source` (thin screen layer)**
The screen only connects the fields to the `source-client` and shows the result. **Tests (in Node, without browser):**
8. `html_gerado_nao_referencia_hosts_de_terceiros` (static analysis of the generated HTML and bundle);
9. `csp_do_html_vem_da_politica_de_rede`;
10. (optional) with simulated DOM in Node: `renderiza_as_categorias_da_politica` and `mostra_a_causa_do_erro`.

**Done when:** `source-client` and thin layer tests pass; the **manual checklist M-01** (`06-decision-tests-without-browser.md`) is prepared for Phase 11.

---

## Phase 9 — `packages/newsroom-client` and `apps/web-newsroom` (M)
> **Status:** ✅ completed (automated tests). `newsroom-client`: 30 tests (uses the in-memory Arkiv store, with real permissions); `web-newsroom`: 20 (DOM-less controller + static analysis). `crypto` gained password protection and a generic sealed box (+9 tests); `ens-client` gained `onProgress` in registration.
> **Decisions:** (1) the source encrypts only to the **newsroom key**; a journalist reads because they receive the **keyring** (all versions of the private key) encrypted to their read key, which they generate on their own device — what ENS stores in `denuncia.readerkey` is this public key; (2) revoking a journalist does not undo keys already delivered, so the client recommends rotating the key; (3) the backup uses PBKDF2-SHA256 (600 thousand iterations, WebCrypto) + secretbox, because standard libsodium does not bring Argon2; (4) the panel logs in with a **test wallet private key pasted by the person**, in memory only and never stored.
> **Known limits:** browser wallet integration (signing in ENS and Arkiv without pasting a key) is left for later; the panel does not list active journalists (ENS does not enumerate subnames without an indexer); the visual check is in M-01 (Phase 11).
**Goal:** all the newsroom-side logic (RF-01 to RF-05, RF-12 to RF-15) in an **interface-less client**, plus a thin screen layer.

**Part A — `newsroom-client` (logic; tests without browser)**
1. Registration: `registra_a_redacao_e_informa_a_espera_do_commit`; `publica_chave_e_politica`.
2. Keys: `gera_a_chave_privada_localmente_e_nunca_a_envia` (request recorder); `exporta_a_chave_protegida_por_senha`; `importa_e_restaura`; `senha_errada_falha`.
3. Journalists: `cadastra_e_revoga`.
4. List: `lista_por_status_e_categoria`; `pagina_em_blocos`.
5. Decryption: `decifra_com_a_chave_do_jornalista`; `envelope_de_versao_antiga_usa_a_chave_antiga`; `nao_decifra_sem_a_chave`.
6. Status: `registra_anotacao_sem_alterar_o_envelope`.
7. Reply: `cifra_para_o_mailbox_da_denuncia`.
8. Retention: `lista_denuncias_proximas_do_vencimento`; `renova_a_expiracao`.
9. Network: `so_contata_hosts_declarados`.

**Part B — `web-newsroom` (thin screen layer)**
10. The same static HTML and CSP tests as `web-source`; optionally, simulated DOM in Node for the list and errors.

**Done when:** tests pass; the private key never appears in a recorded request nor in a receipt file without protection.

---

## Phase 10 — E2E by script (M)
> **Status:** ✅ completed: `npm run test:e2e` passes (17 tests, ~2.7 min, plus node startup). Description in `docs/07-e2e-tests.md`.
> **Decisions:** the relayer runs as a real child process with `SIMULATE_WORLD=1`, a flag it refuses if any RPC is not localhost; retention was tested with a 30 s lifetime in the local node; `test:e2e` stays out of `npm run ci` because it is slow.
**Goal:** prove the use cases end to end **without a browser**, with scripts that use the `source-client` and `newsroom-client` clients against the real local system.

**Environment setup (a preparation script in `tests/e2e/setup`)**
1. Starts the local Sepolia fork and the local Arkiv node (Docker).
2. Starts the `relayer` as a child process, with the World verifier **simulated**.
3. Creates the test newsroom and the test journalist with the `newsroom-client`.
4. At the end, tears everything down.

**Scenarios (Vitest scripts in `tests/e2e/*.e2e.test.ts`)**
1. **UC-01 to UC-03:** the administrator registers the newsroom and the journalist.
2. **UC-05 and UC-06:** the source looks up the newsroom, submits and receives the receipt.
3. **UC-07 and UC-08:** the journalist lists, decrypts and classifies.
4. **UC-09 and UC-10:** the journalist replies; the source reads the reply with the receipt.
5. **UC-11 and UC-12:** hash and date verification; proof of authorship.
6. **Limit:** the second submission in the same epoch is refused.
7. **Key rotation:** the submission made during rotation re-encrypts.
8. **Retention:** the renewed tip remains; the non-renewed one disappears.
9. **Privacy (RNF-01):** the request recorder, present in the clients and in the relayer, confirms that no request carries original text or a private key.
10. **Network (RNF-04, RNF-05):** the same recorder confirms that no host outside the list was contacted.

**Done when:** all scenarios pass in `npm run test:e2e` and `npm run ci`.
**Risks:** local nodes make tests slower. Response: reuse the environment between scenarios and separate `test:e2e` from the fast TDD cycle.

---

## Phase 11 — Hardening (S to M)
> **Status:** **automated part completed** (review in `docs/08-security-review.md`): global request limit in the relayer, RPC retry (`RPC_TRANSPORT`), static server with CSP in the header, button to download the envelope in the panel, `npm audit --omit=dev` without vulnerabilities, coverage goals maintained. **Pending (manual): list M-01 in the browser**, with the walkthrough in `docs/09-manual-walkthrough.md`.
**Goal:** quality and security before considering the MVP complete.

**Tasks (each with a test first)**
1. Security and privacy review with the checklist from `04-tdd-strategy.md` §11.
2. Client network audit: result of **V-05** (static analysis of the IDKit package) and **manual checklist M-01** (open the built app in a browser and check the hosts); adjust the host list and the CSP.
3. Error handling and user messages.
4. Performance: recheck RNF-08 with real Rabdi data (V-01).
5. Retry with backoff for the public RPC (V-06).
6. Final documentation in `docs/`; license; own repository.
7. Coverage: confirm the per-package goals.

**Done when:** `npm run ci` green; security review with no critical pending items; `docs/` updated.

---

## Phase 12 — Demonstration with anonymity network: ⛔ BLOCKED
This phase **is not part of development**. It is blocked: see `99-tor-phase-BLOCKED.md`. No task, test or dependency of this phase must be created.

---

## Phase 13 — Wallet, roles and authentication fixes (M to L)
**Planned.** Details, tasks and tests in `08-phase-13-wallet-roles-and-fixes.md`. Fixes the authentication of notes and replies (risks 7 and 8 of `docs/08-security-review.md`) and reworks the newsroom panel with wallet login (MetaMask) and tabs by role (administrator and journalist). The source panel does not change. Phase 12 remains blocked and the guardrails are not changed.

---

## Effort summary
| Phase | Component | Effort |
|---|---|---|
| 0 | Validation | M |
| 1 | Foundation + network policy | S |
| 2 | core | S |
| 3 | crypto | M |
| 4 | ens-client | M |
| 5 | arkiv-store | M |
| 6 | worldid-gate | S |
| 7 | relayer | M |
| 8 | source-client + web-source | M |
| 9 | newsroom-client + web-newsroom | M |
| 10 | e2e by script | M |
| 11 | hardening | S to M |
| 12 | Tor | ⛔ blocked |
| 13 | wallet, roles and authentication fixes | M to L |
