# Plano de desenvolvimento

Ordem: **validação** primeiro, depois um componente por vez, sempre com **TDD** (`04-estrategia-tdd.md`). Cada fase só começa com a anterior verde. Esforço relativo: **S** (pequeno), **M** (médio), **L** (grande). Sem datas: o plano é por dependência.

```
Fase 0 Validação ─► 1 Fundação ─► 2 core ─► 3 crypto ─► 4 ens-client ─► 5 arkiv-store
                                                                           │
                         6 worldid-gate ◄──────────────────────────────────┘
                                │
                                ▼
                        7 relayer ─► 8 source-client + web-source ─► 9 newsroom-client + web-newsroom
                                                                              │
                                                                              ▼
                                                          10 e2e por script ─► 11 endurecimento
                                                                                               │
                                                                    12 Tor ── ⛔ BLOQUEADA ◄───┘
```
Os pacotes 2 a 6 são independentes entre si depois do `core`: podem avançar em paralelo.

**Todos os testes são scripts executados em Node, sem navegador** (decisão em `06-decisao-testes-sem-navegador.md`). Por isso a lógica dos front-ends vive em **clientes sem interface** (`source-client`, `newsroom-client`), e os front-ends são camadas finas por cima deles.

Legenda de cada fase: **Objetivo**, **Testes primeiro** (lista na ordem dos ciclos), **Pronto quando**, **Riscos**.

---

## Fase 0 — Validação (esforço M)
> **Status:** V-01, V-03, V-04, V-05, V-06, V-07 e V-08 concluídas; V-02 concluída no simulador (`validation/RESULTADOS.md`).
Detalhada em `02-fase-0-validacao.md`. **Pronto quando** os resultados V-01 a V-08 estão registrados ou bloqueados por acesso com dublê definido.

---

## Fase 1 — Fundação do monorepo e guardrail em execução (S)
> **Status:** ✅ concluída.
**Objetivo:** esqueleto do monorepo, ferramentas de teste e a **política de rede em execução**.

**Testes primeiro**
1. *guardrail de dependências:* "nenhum `package.json` do monorepo contém pacote de rede de anonimato" (falha ao adicionar um pacote proibido de exemplo).
2. `network-policy`:
   - `permite_host_da_lista`;
   - `recusa_host_fora_da_lista` (erro tipado `HostNotAllowedError`, antes de qualquer chamada);
   - `recusa_esquema_diferente_de_https_e_localhost`;
   - `recusa_proxy_socks` na configuração;
   - `gera_csp_apenas_com_os_hosts_declarados`;
   - `rpc_configuravel_entra_na_lista_somente_se_https_ou_localhost`.
3. *contrato:* "pacotes só importam o que a regra de dependências permite".
4. `npm run ci` executa as etapas na ordem e falha na primeira com erro.

**Entrega:** `package.json` com workspaces, `tsconfig.base.json`, configuração do Vitest, `packages/network-policy`, `tests/contract`, `tests/fixtures/docker-compose.yml`, script `ci`.
**Pronto quando:** `npm run ci` passa em um repositório vazio de lógica; os testes do guardrail e de política de rede passam.
**Riscos:** configuração de ferramentas demora mais que o esperado. Resposta: manter o mínimo (npm workspaces, Vitest, TypeScript).

---

## Fase 2 — `packages/core` (S)
> **Status:** ✅ concluída.
**Objetivo:** tipos e regras puras, sem rede (RF-19, RF-21, RN-01).

**Testes primeiro**
1. `epochOf`: `mesma_data_mesma_epoca`, `virada_do_mes_muda_a_epoca`, `usa_utc` (relógio injetado).
2. `actionFor`: `formata_submit_redacao_epoca`; `redacoes_diferentes_geram_acoes_diferentes`.
3. `parsePolicy`: `aceita_politica_valida`; `recusa_json_malformado`; `recusa_categorias_vazias`; `aplica_padroes_quando_campo_ausente`.
4. `validateSubmission(policy, submission)`: `recusa_categoria_fora_da_politica`; `recusa_tamanho_acima_do_maximo`; `recusa_anexo_quando_politica_nao_aceita`.
5. `splitIntoParts` / `joinParts`: `divide_em_partes_no_limite`; `junta_devolve_o_original` (propriedade); `ordem_invertida_ainda_remonta`; `parte_faltando_gera_erro`.
6. Constantes: `limite_de_parte_cabe_com_folga_no_limite_da_entidade`.

**Pronto quando:** cobertura ≥ 90%; nenhum acesso à rede (teste que falha se `fetch` for chamado).
**Riscos:** definir a época (mensal) — decisão de produto: registrar em `docs/`.

---

## Fase 3 — `packages/crypto` (M)
> **Status:** ✅ concluída.
**Objetivo:** envelope, mailbox e compromisso (RF-07, RF-08, RF-13, RF-15, RF-16, RF-17). Referência: `POC-Cofre/poc-cripto`; **reescrever com testes**.

**Testes primeiro**
1. `newKeypair`: `gera_chaves_de_32_bytes`; `duas_chamadas_geram_chaves_diferentes`.
2. `seal` / `open`:
   - `destinatario_abre_o_envelope`;
   - `segundo_destinatario_tambem_abre`;
   - `outra_chave_nao_abre`; `nao_destinatario_nao_abre`;
   - `alterar_ciphertext_falha`; `alterar_categoria_falha`; `alterar_redacao_falha`; `alterar_versao_da_chave_falha`.
3. Propriedades (fast-check): `abrir(cifrar(x)) == x` para qualquer bytes; `mesmo_texto_gera_envelopes_diferentes`.
4. `contentHash` e `verifyContentHash`: `hash_confere`; `adulteracao_e_detectada`.
5. `commitment`: `confere_com_texto_e_sal`; `falha_com_outro_texto`; `falha_com_outro_sal`.
6. Mailbox e respostas: `mailbox_id_e_estavel`; `mailboxes_diferentes_geram_ids_diferentes`; `redacao_responde_e_fonte_abre`; `terceiro_nao_abre_a_resposta`.
7. Formato: `ciphertext_em_binario_sem_base64`; `serializa_e_desserializa_o_envelope` (ida e volta); `envelope_de_100_KiB_cabe_em_uma_entidade_ou_e_dividido`.
8. Sem rede: o pacote não importa módulos de rede.

**Pronto quando:** cobertura ≥ 90%; propriedades passam com 1.000 execuções; desempenho: 100 KiB em menos de 100 ms (meta validada em V-07).
**Riscos:** erro de criptografia. Resposta: só libsodium, nenhuma primitiva própria, revisão cruzada.

---

## Fase 4 — `packages/ens-client` (M)
> **Status:** ✅ concluída: 30 testes unitários (cobertura 100% de linhas) e 11 testes de integração contra o fork local da Sepolia (`npm run test:integration`).
> **Decisões que a implementação confirmou:** os registros da redação são publicados em **uma única transação** (`multicall`); os jornalistas vivem sob o `.eth` de segundo nível da redação (`<jornalista>.<redação>.eth`); o jornalista ativo é decidido pelo registry.
**Objetivo:** leitura e administração do ENS (RF-01 a RF-06). Referência: `POC-Cofre/poc-ens`, `POC-ENS/src`.

**Testes primeiro (unitários, sem rede)**
1. `dns.encode`: `codifica_nome_em_formato_dns`; `recusa_rotulo_invalido`.
2. `parseRecords`: `extrai_chave_versao_politica`; `faltando_chave_gera_erro_claro`; `chave_com_tamanho_errado_gera_erro`.
3. `buildSetterCalldata`: monta a chamada de `setText` com o nome em formato DNS.

**Testes de integração (fork local da Sepolia)**
4. Leitor: `resolve_chave_politica_e_versao_pelo_nome`; `nome_inexistente_devolve_erro_tipado`; `resolve_subname_sem_registro_pelo_resolver_pai`.
5. Administração: `cria_resolver_proprio`; `registra_nome_com_commit_reveal` (relógio do fork avançado); `publica_chave_e_versao`.
6. Permissões: `jornalista_sem_role_nao_troca_a_chave`; `admin_de_uma_redacao_nao_escreve_no_resolver_de_outra`.
7. Rotação: `rotaciona_e_incrementa_a_versao`.
8. Jornalistas (resultado de V-04):
   - `cadastra_subname_com_chave_de_leitura_e_sem_papel_de_transferencia`;
   - `jornalista_ativo_e_decidido_pelo_registry_e_nao_pelo_texto` (depois de revogar ou expirar, a chave ainda resolve, mas `isActiveJournalist` é falso);
   - `revoga_com_unregister_e_limpa_a_chave_de_leitura`;
   - `terceiro_nao_revoga_nem_renova`;
   - `renova_o_prazo_do_subname`;
   - `permite_recadastrar_o_rotulo_depois_de_revogar_ou_expirar`.
9. Custodiante: `le_o_endereco_da_redacao_como_custodiante`.

**Pronto quando:** testes de integração passam contra o fork; endereços dos contratos em **configuração** (não espalhados no código); cobertura ≥ 80%.
**Riscos:** ENSv2 redeployado. Resposta: ABIs e endereços em um único arquivo versionado; teste de integridade que falha se os contratos não tiverem código.

---

## Fase 5 — `packages/arkiv-store` (M)
> **Status:** ✅ concluída (ver o fim da seção): 44 testes unitários e 14 de integração contra o nó Arkiv local.
> **Achado:** a cadeia limita a vida de uma entidade a **7.884.000 blocos (~182,5 dias)**; a loja valida isso e a renovação é obrigatória.
**Objetivo:** persistência e consulta (RF-10 a RF-12, RF-14, RF-15, RF-18, RF-19). Referência: `POC-Cofre/poc-arkiv`.

**Testes primeiro (unitários com repositório em memória)**
1. Esquemas: `rejeita_atributo_que_identifica_a_fonte`; `envelope_vai_em_bytes_e_nao_em_atributo`.
2. `publishSubmission` (resultado de V-08): `cria_entidade_com_atributos_indexados`; `marca_readonly_e_permissionlessExtension`; `transfere_custodia_para_a_redacao`; `depois_da_transferencia_o_relayer_nao_apaga_mas_ainda_estende`.
3. Consulta: `lista_por_redacao_e_status`; `filtra_por_categoria`; `exige_ao_menos_um_filtro`; `ordena_no_cliente_por_data_de_criacao`; `pagina_em_blocos_de_100`.
4. Respostas: `busca_por_mailbox_id`; `outro_mailbox_nao_devolve_nada`.
5. Anotações: `registra_status_sem_alterar_o_envelope`.
6. Retenção: `estende_expiracao_antes_do_vencimento`; `nao_estende_para_data_anterior`.
7. Anexos grandes: `divide_e_grava_partes`; `remonta_na_leitura`.

**Testes de integração (nó Arkiv local)**
8. Os mesmos comportamentos contra o nó real: `terceiro_nao_apaga`; `relayer_nao_apaga_depois_da_transferencia`; `entidade_expirada_some_da_consulta`; `128_KiB_exatos_sao_recusados_e_o_limite_pratico_e_respeitado`.

**Pronto quando:** testes unitários e de integração passam; custo e limites reais reconciliados com V-01.
**Riscos:** diferença entre nó local e Rabdi. Resposta: V-01; constantes de limite em `core`.

---

## Fase 6 — `packages/worldid-gate` (S)
> **Status:** ✅ concluída (58 testes, 99% de linhas). A prova real (V-02) foi validada no simulador em `staging`: A1 e B1 aceitos, A2 recusado (`limit_reached`).
> **Extras que a implementação trouxe:** o portão devolve uma reserva liberável (`release`) para o relayer devolver a vaga se a publicação falhar; a reserva é atômica contra tentativas simultâneas; o armazém persistente guarda só hashes.
**Objetivo:** anti-spam (RF-09, RN-01, RN-05, RN-09). Referência: `POC-Cofre/poc-worldid`.

**Testes primeiro (verificador simulado)**
1. `rpContextFor`: `gera_assinatura_amarrada_a_acao`; `acoes_diferentes_geram_assinaturas_diferentes`; `expira_no_prazo_definido` (relógio injetado).
2. `SubmissionGate.admit`:
   - `aceita_a_primeira_denuncia`;
   - `bloqueia_a_segunda_na_mesma_redacao_e_epoca`;
   - `permite_outra_redacao`; `permite_proxima_epoca`;
   - `recusa_replay_entre_redacoes`;
   - `recusa_ambiente_errado`;
   - `recusa_prova_invalida`;
   - `recusa_nullifier_malformado`.
3. Armazém: `guarda_apenas_o_hash_do_par`; `nao_guarda_a_prova`.
4. Contrato: o verificador simulado e o real compartilham a mesma suíte de contrato.

**Testes de validação (`@validation`)**
5. Com o simulador do World: prova real aceita; segunda na mesma ação, bloqueada.

**Pronto quando:** testes com dublê passam; teste de contrato do verificador real marcado `@validation` documentado.
**Riscos:** sem app no Developer Portal, só o dublê. Resposta: manter o contrato do verificador estável.

---

## Fase 7 — `apps/relayer` (M)
> **Status:** ✅ concluída: 43 testes unitários (95% de linhas) e 4 de integração com ENS (fork), Arkiv (nó local) e o relayer juntos. O fluxo completo foi provado: a redação decifra a denúncia e a custódia é dela. API documentada em `docs/05-api-do-relayer.md`.
> **Decisões:** o corpo do envio é JSON com o envelope em base64url; as verificações baratas vêm antes da chamada à API do World; a reserva da prova é devolvida se a publicação falhar.
**Objetivo:** serviço HTTP que une os pacotes (RF-09 a RF-11, RF-18, RF-21, RNF-11).

**Testes primeiro (com dublês dos pacotes)**
1. `GET /health`: `responde_ok`.
2. `GET /rp-context`: `devolve_assinatura_para_a_acao_da_epoca_corrente`; `recusa_redacao_inexistente`.
3. `POST /submissions`:
   - `aceita_envio_valido_e_responde_com_o_identificador`;
   - `recusa_prova_invalida (403)`;
   - `recusa_limite_atingido (409)`;
   - `recusa_versao_de_chave_desatualizada (409, pede nova cifragem)`;
   - `recusa_categoria_fora_da_politica (422)`;
   - `recusa_corpo_acima_do_maximo (413)`;
   - `transfere_a_custodia_depois_de_criar`;
   - `nao_publica_se_a_prova_falhar`.
4. Privacidade: `nao_registra_ip_nem_corpo_nos_logs`; `resposta_nao_inclui_dados_da_prova`.
5. Renovação (job): `renova_denuncias_proximas_do_vencimento`; `nao_renova_quando_nao_e_custodiante`; `repete_com_recuo_quando_o_rpc_falha`.
6. Rede: `so_contata_os_hosts_permitidos`.

**Integração:** relayer + fork local + nó Arkiv local + verificador simulado: `fluxo_de_envio_completo`.
**Pronto quando:** testes unitários e de integração passam; logs verificados.
**Riscos:** o relayer vê o IP. Resposta: sem logs de IP; limite declarado em `docs/`.

---

## Fase 8 — `packages/source-client` e `apps/web-source` (M)
> **Status:** ✅ concluída (testes automáticos). `source-client`: 41 testes; `web-source`: 21 (controlador sem DOM + análise estática do HTML/pacote + CSP gerada). Telas desenhadas em `docs/06-telas.md`. **Pendente, só manual:** M-01 (Fase 11) e a prova com o World App/simulador pela tela.
> **Decisões:** conteúdo cifrado = JSON `{text, attachment?}` (`core/payload`); o recibo guarda também redação e chave da entidade; a tela é a raiz de composição (liga ENS e Arkiv reais) e a lógica fica no `source-client`; a CSP vem de `cspFor` e é escrita no HTML pelo build.
> **Limites conhecidos:** (1) sem QR local ainda: a tela mostra o link da prova; (2) ler respostas no Arkiv sem chave de acesso usa o endpoint público da Rabdi (limitado em taxa), e uma chave de acesso no app público seria exposta, então ela fica opcional e vazia; (3) a CSP em `<meta>` não aplica `frame-ancestors`: o servidor estático deve enviar a CSP também como cabeçalho; (4) o pacote traz URLs padrão de bibliotecas (lista revisada em `static.test.ts`), todas bloqueadas pela política de rede e pela CSP; (5) os hosts que o IDKit contata no navegador além de `bridge.worldcoin.org` só serão confirmados na M-01.
**Objetivo:** toda a lógica do lado da fonte (RF-06 a RF-09, RF-15 a RF-17, RF-20) em um **cliente sem interface**, mais uma camada fina de tela por cima.

**Parte A — `source-client` (lógica; testes sem navegador)**
Dependências injetadas: `fetch` (envolvido por `guardedFetch`), cliente do ENS, relógio, aleatoriedade e um `ProofProvider` (na tela usa o pacote **headless `@worldcoin/idkit-core`**, sem o widget, por causa das fontes de terceiros — V-05; nos testes é um dublê).

1. Consulta: `resolve_nome_e_devolve_chave_versao_e_politica`; `nome_inexistente_gera_erro_claro`.
2. Montagem: `so_aceita_categoria_da_politica`; `recusa_arquivo_acima_do_tamanho`; `divide_anexo_grande_em_partes`.
3. Envio:
   - `cifra_antes_de_enviar` (um **gravador de requisições** confirma que nenhum corpo contém o texto original);
   - `nao_envia_a_chave_privada_nem_o_sal`;
   - `pede_a_prova_com_a_acao_da_redacao_e_da_epoca`;
   - `nao_envia_se_a_prova_for_negada`, `expirada` ou `cancelada`;
   - `refaz_a_cifragem_quando_o_relayer_diz_versao_desatualizada`;
   - `traduz_os_erros_do_relayer_para_causas_legiveis`.
4. Recibo: `serializa_e_restaura_o_recibo`; `sem_recibo_nao_abre_respostas`.
5. Respostas: `consulta_por_mailbox_e_decifra`; `ignora_resposta_de_outro_mailbox`.
6. Verificação: `confere_hash_e_data`; `prova_autoria_com_texto_e_sal`.
7. Rede: `so_contata_hosts_declarados`; `rpc_configuravel_pelo_usuario`.

**Parte B — `web-source` (camada fina de tela)**
A tela só liga os campos ao `source-client` e mostra o resultado. **Testes (em Node, sem navegador):**
8. `html_gerado_nao_referencia_hosts_de_terceiros` (análise estática do HTML e do pacote gerado);
9. `csp_do_html_vem_da_politica_de_rede`;
10. (opcional) com DOM simulado em Node: `renderiza_as_categorias_da_politica` e `mostra_a_causa_do_erro`.

**Pronto quando:** testes do `source-client` e da camada fina passam; a **lista de verificação manual M-01** (`06-decisao-testes-sem-navegador.md`) está preparada para a Fase 11.

---

## Fase 9 — `packages/newsroom-client` e `apps/web-newsroom` (M)
> **Status:** ✅ concluída (testes automáticos). `newsroom-client`: 30 testes (usa a loja do Arkiv em memória, com permissões reais); `web-newsroom`: 20 (controlador sem DOM + análise estática). A `crypto` ganhou proteção por senha e caixa selada genérica (+9 testes); o `ens-client` ganhou `onProgress` no cadastro.
> **Decisões:** (1) a fonte cifra só para a **chave da redação**; um jornalista lê porque recebe o **chaveiro** (todas as versões da chave privada) cifrado para a sua chave de leitura, que ele gera no próprio aparelho — o que o ENS guarda em `denuncia.readerkey` é essa chave pública; (2) revogar um jornalista não desfaz chaves já entregues, então o cliente recomenda girar a chave; (3) o backup usa PBKDF2-SHA256 (600 mil iterações, WebCrypto) + secretbox, porque o libsodium padrão não traz Argon2; (4) o painel entra com uma **chave privada de carteira de teste colada pela pessoa**, só em memória e nunca gravada.
> **Limites conhecidos:** a integração de carteira de navegador (assinar no ENS e no Arkiv sem colar chave) fica para depois; o painel não lista jornalistas ativos (o ENS não enumera subnames sem um indexador); a conferência visual fica na M-01 (Fase 11).
**Objetivo:** toda a lógica do lado da redação (RF-01 a RF-05, RF-12 a RF-15) em um **cliente sem interface**, mais uma camada fina de tela.

**Parte A — `newsroom-client` (lógica; testes sem navegador)**
1. Cadastro: `registra_a_redacao_e_informa_a_espera_do_commit`; `publica_chave_e_politica`.
2. Chaves: `gera_a_chave_privada_localmente_e_nunca_a_envia` (gravador de requisições); `exporta_a_chave_protegida_por_senha`; `importa_e_restaura`; `senha_errada_falha`.
3. Jornalistas: `cadastra_e_revoga`.
4. Lista: `lista_por_status_e_categoria`; `pagina_em_blocos`.
5. Decifragem: `decifra_com_a_chave_do_jornalista`; `envelope_de_versao_antiga_usa_a_chave_antiga`; `nao_decifra_sem_a_chave`.
6. Status: `registra_anotacao_sem_alterar_o_envelope`.
7. Resposta: `cifra_para_o_mailbox_da_denuncia`.
8. Retenção: `lista_denuncias_proximas_do_vencimento`; `renova_a_expiracao`.
9. Rede: `so_contata_hosts_declarados`.

**Parte B — `web-newsroom` (camada fina de tela)**
10. Os mesmos testes estáticos de HTML e de CSP da `web-source`; opcionalmente, DOM simulado em Node para a lista e os erros.

**Pronto quando:** testes passam; a chave privada nunca aparece em requisição gravada nem em arquivo de recibo sem proteção.

---

## Fase 10 — E2E por script (M)
> **Status:** ✅ concluída: `npm run test:e2e` passa (17 testes, ~2,7 min, mais a subida dos nós). Descrição em `docs/07-testes-e2e.md`.
> **Decisões:** o relayer roda como processo filho de verdade com `SIMULATE_WORLD=1`, flag que ele recusa se algum RPC não for localhost; a retenção foi testada com vida de 30 s no nó local; o `test:e2e` fica fora do `npm run ci` por ser lento.
**Objetivo:** provar os casos de uso de ponta a ponta **sem navegador**, com scripts que usam os clientes `source-client` e `newsroom-client` contra o sistema real local.

**Montagem do ambiente (um script de preparação em `tests/e2e/setup`)**
1. Sobe o fork local da Sepolia e o nó Arkiv local (Docker).
2. Sobe o `relayer` como processo filho, com o verificador do World **simulado**.
3. Cria a redação de teste e o jornalista de teste com o `newsroom-client`.
4. Ao final, derruba tudo.

**Cenários (scripts Vitest em `tests/e2e/*.e2e.test.ts`)**
1. **UC-01 a UC-03:** o administrador cadastra a redação e o jornalista.
2. **UC-05 e UC-06:** a fonte consulta a redação, envia e recebe o recibo.
3. **UC-07 e UC-08:** o jornalista lista, decifra e classifica.
4. **UC-09 e UC-10:** o jornalista responde; a fonte lê a resposta com o recibo.
5. **UC-11 e UC-12:** verificação de hash e data; prova de autoria.
6. **Limite:** o segundo envio na mesma época é recusado.
7. **Rotação de chave:** o envio feito durante a rotação refaz a cifragem.
8. **Retenção:** a denúncia renovada permanece; a não renovada some.
9. **Privacidade (RNF-01):** o gravador de requisições, presente nos clientes e no relayer, confirma que nenhuma requisição leva texto original ou chave privada.
10. **Rede (RNF-04, RNF-05):** o mesmo gravador confirma que nenhum host fora da lista foi contatado.

**Pronto quando:** todos os cenários passam em `npm run test:e2e` e `npm run ci`.
**Riscos:** os nós locais deixam os testes mais lentos. Resposta: reaproveitar o ambiente entre cenários e separar `test:e2e` do ciclo rápido de TDD.

---

## Fase 11 — Endurecimento (S a M)
> **Status:** parte **automática concluída** (revisão em `docs/08-revisao-de-seguranca.md`): limite global de requisições no relayer, repetição do RPC (`RPC_TRANSPORT`), servidor estático com CSP em cabeçalho, botão de baixar o envelope no painel, `npm audit --omit=dev` sem vulnerabilidades, metas de cobertura mantidas. **Pendente (manual): a lista M-01 no navegador**, com o roteiro em `docs/09-roteiro-manual.md`.
**Objetivo:** qualidade e segurança antes de considerar o MVP completo.

**Tarefas (cada uma com teste primeiro)**
1. Revisão de segurança e privacidade com a lista de `04-estrategia-tdd.md` §11.
2. Auditoria de rede do cliente: resultado de **V-05** (análise estática do pacote do IDKit) e **lista de verificação manual M-01** (abrir o app construído em um navegador e conferir os hosts); ajustar a lista de hosts e a CSP.
3. Tratamento de erros e mensagens ao usuário.
4. Desempenho: reconferir RNF-08 com dados reais da Rabdi (V-01).
5. Repetição com recuo para o RPC público (V-06).
6. Documentação final em `docs/`; licença; repositório próprio.
7. Cobertura: confirmar as metas por pacote.

**Pronto quando:** `npm run ci` verde; revisão de segurança sem pendências críticas; `docs/` atualizado.

---

## Fase 12 — Demonstração com rede anônima: ⛔ BLOQUEADA
Esta fase **não faz parte do desenvolvimento**. Está bloqueada: veja `99-fase-tor-BLOQUEADA.md`. Nenhuma tarefa, teste ou dependência desta fase deve ser criada.

---

## Fase 13 — Carteira, papéis e correções de autenticação (M a G)
**Planejada.** Detalhes, tarefas e testes em `08-fase-13-carteira-papeis-e-correcoes.md`. Corrige a autenticação das anotações e das respostas (riscos 7 e 8 de `docs/08-revisao-de-seguranca.md`) e refaz o painel da redação com entrada por carteira (MetaMask) e abas por papel (administrador e jornalista). O painel da fonte não muda. A Fase 12 permanece bloqueada e os guardrails não são alterados.

---

## Resumo de esforço
| Fase | Componente | Esforço |
|---|---|---|
| 0 | Validação | M |
| 1 | Fundação + política de rede | S |
| 2 | core | S |
| 3 | crypto | M |
| 4 | ens-client | M |
| 5 | arkiv-store | M |
| 6 | worldid-gate | S |
| 7 | relayer | M |
| 8 | source-client + web-source | M |
| 9 | newsroom-client + web-newsroom | M |
| 10 | e2e por script | M |
| 11 | endurecimento | S a M |
| 12 | Tor | ⛔ bloqueada |
| 13 | carteira, papéis e correções de autenticação | M a G |
