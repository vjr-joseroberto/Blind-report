# Fase 13 — Carteira, papéis e correções de autenticação

**Status:** **Parte A (A1 a A6), B0 e Parte B (B1 a B5) executadas** com testes automáticos. Falta a **M-02** (MetaMask real), manual.
> **Ajuste após o uso:** a entrada passou a ter **dois passos** (conectar a carteira; depois escolher ou criar a redação), para quem ainda não tem redação. A lista "Minhas redações" vem dos eventos do registry (`findLabelsMintedTo`, validado no fork) confirmados no ENS (`listAdministered`), mais os nomes lembrados no navegador (única exceção de armazenamento, só nomes). Uma carteira pode administrar várias redações; cada redação tem um único administrador.
> **Defeitos corrigidos (relatados no M-02):** (a) o formulário de cadastro aparecia para nomes que já existiam: agora só aparece se o registrar diz que o nome está livre (`isNameAvailable`, validado no fork); nome já registrado mostra uma explicação; (b) o botão de backup ficava desativado enquanto a Caixa de entrada lia a Rabdi (o painel tratava toda leitura como "ocupado"): leituras agora têm o próprio indicador (`loading`) e não travam o backup; o download usa um link no documento e libera a URL depois; os campos digitados sobrevivem aos redesenhos; o texto do backup aparece para copiar se o navegador bloquear o download.
> **Defeito anterior corrigido:** depois de cadastrar uma redação, uma falha de leitura do ENS na reavaliação do papel fazia a sessão voltar a "Qual redação?" e o painel descartava o cliente **com as chaves**; ao reentrar, o botão de backup ficava desativado. Agora (1) a reavaliação que falha mantém a sessão e o painel e mostra o erro; (2) há um painel por redação durante a sessão, então trocar de redação não perde as chaves; (3) enquanto não há backup, as abas mostram o aviso, **Sair** pede confirmação e o navegador avisa ao fechar a aba.
> **Desvio do plano:** em vez de dois controladores (administrador e jornalista), há um só (`controller.ts`) com guarda de papel por ação (`canDo`), para não duplicar código; o teste de permissões cobre os três papéis. Também entrou `updatePolicy` no `newsroom-client` (editar a política pelo painel). Desenvolvimento com TDD, como nas fases anteriores.
**Regra que não muda:** a fase de rede anônima (Fase 12, `99-fase-tor-BLOQUEADA.md`) continua **bloqueada**. Esta fase não toca em `GUARDRAILS.md`, `CLAUDE.md`, `.claude/hooks/` nem em `guardrails/`, e nenhuma tarefa cria código, dependência ou teste de rede anônima. Conexão por celular via WalletConnect fica **fora**, porque contata servidores de terceiros (viola RNF-04).
**Fora do escopo:** o painel da fonte (`apps/web-source`) e o `source-client` ficam sem mudança de tela; a única mudança no `source-client` é interna (autenticar respostas, tarefa A2).

## 1. Objetivos
1. **Corrigir dois defeitos de segurança** registrados em `docs/08-revisao-de-seguranca.md` (itens 7 e 8):
   - qualquer carteira pode criar uma anotação de status;
   - as respostas à fonte não são autenticadas.
2. **Refatorar o painel da redação**: entrar conectando a carteira (MetaMask), em vez de colar a chave privada; o painel descobre o papel (**administrador** ou **jornalista**) e mostra abas e ações diferentes para cada um, com interface mais intuitiva e as mesmas cores.

As carteiras de teste atuais mantêm seus papéis: **OWNER = administrador**, **JOURNALIST = jornalista**. O `.env` não muda. Para testar no navegador, importa-se cada chave de teste na MetaMask (rede de teste, sem dinheiro real); o painel só valida o que a carteira conectada é.

## 2. Parte A — Correções de autenticação

### 2.1 A ideia (vale para os dois defeitos)
O Arkiv registra, para cada entidade, quem a **criou** (`creator`): esse campo é definido pela cadeia e **não pode ser forjado** por quem escreve. Os atributos (como `byJournalist`) são apenas declarações. A regra nova é:

> Uma anotação ou uma resposta só vale se o **`creator` da entidade** for uma carteira **autorizada** pela redação: o **administrador** (endereço custodiante no ENS) ou um **jornalista ativo** (dono de um subnome ativo da redação).

Não há criptografia nova: a prova de autoria é a assinatura da própria transação, e a autorização vem do ENS.

### 2.2 Como o jornalista é reconhecido
O ENS não enumera subnomes, então a entidade declara quem diz ser: um atributo novo **`authorName`** (o nome completo, por exemplo `maria.jornalista1.eth`). O verificador confere três coisas:
1. `authorName` é um jornalista **ativo** no registry da redação (`isActiveJournalist`);
2. o **dono** desse subnome (`ownerOf`) é o `creator` da entidade;
3. o subnome pertence à redação em questão.

Se o `creator` for o custodiante da redação, vale sem `authorName`. Entidades antigas (sem `authorName`) só valem se o `creator` for o custodiante.

### 2.3 Decisões desta parte
| ID | Decisão | Motivo |
|---|---|---|
| D-13-01 | Autorizar pelo `creator` da entidade e pelo ENS, sem assinatura extra | Mais simples e sem chave nova para gerenciar |
| D-13-02 | A verificação é feita **na leitura**, com o estado atual do ENS | Não exige indexador. Efeito: ao revogar um jornalista, suas anotações e respostas antigas deixam de valer. Aceito e documentado |
| D-13-03 | Entidades inválidas são **ignoradas e contadas** | O painel mostra "N anotações ignoradas" e a fonte "N respostas ignoradas", sem esconder o ataque |
| D-13-04 | O texto da resposta cifrada leva a redação dentro dele (`{v, newsroom, text}`) e a fonte confere | Impede reaproveitar uma resposta legítima de outra redação |

### 2.4 Tarefas (teste primeiro)
**A1 — `arkiv-store`: expor o autor e filtrar por autorização**
- Conferir se `EntityRow` já traz `creator`; se não, adicionar nos dois backends (memória e SDK).
- Atributo `authorName` (texto, não indexado) em `anotacao` e `resposta`.
- `annotate` e `publishReply` recebem `authorName` (opcional).
- `listSubmissions` e `latestStatus` passam a aceitar `authorize(annotation)`; anotações recusadas não entram no status e são contadas em `ignoredAnnotations`.
- `getReplies` devolve `creator` e `authorName`.
- Testes: `anotacao_de_carteira_nao_autorizada_e_ignorada`, `contagem_de_ignoradas`, `status_volta_ao_anterior_se_a_ultima_anotacao_e_invalida`, `resposta_traz_o_criador`, mesma suíte de contrato nos dois backends, e integração no nó local.

**A2 — `ens-client`: a autoridade da redação**
- Função pura `createAuthority({ reader, newsroom })` → `isAuthorized({ creator, authorName })`, com cache por nome durante a leitura.
- Testes: administrador vale sem `authorName`; jornalista ativo com dono correto vale; nome de jornalista com dono diferente do `creator` não vale; subnome de outra redação não vale; jornalista revogado não vale; sem `authorName` e `creator` diferente do custodiante não vale. (Reaproveita o leitor existente; `ownerOf` e `isActiveJournalist` já existem.)

**A3 — `newsroom-client`: anotar e responder com autoria e ler só o que vale**
- `setStatus` e `reply` enviam o `authorName` do papel atual (ou nada, se for o administrador).
- `listInbox`, `statusOf` e `listExpiring` usam a autoridade para filtrar anotações; o retorno inclui `ignoredAnnotations`.
- Testes: `status_forjado_por_carteira_qualquer_nao_aparece`, `status_do_jornalista_ativo_aparece`, `status_do_jornalista_revogado_e_ignorado`, `inbox_informa_quantas_anotacoes_foram_ignoradas`.

**A4 — formato da resposta (`crypto` e `newsroom-client`)**
- Resposta cifrada passa a ser `{ v: 1, newsroom, text }` (D-13-04), com decodificação rígida.
- Testes: `resposta_com_redacao_errada_e_recusada`, `formato_antigo_e_tratado` (texto puro antigo só vale se o `creator` for o custodiante).

**A5 — `source-client`: aceitar só respostas autenticadas**
- `readReplies` passa a conferir cada resposta com a autoridade da redação do recibo (o `reader` injetado ganha `isActiveJournalist` e `ownerOf`; ainda é `ens-client`, sem dependência nova).
- Retorna `{ replies, ignored }`, com o nome de quem respondeu (`author`).
- Testes: `resposta_forjada_por_terceiro_e_ignorada` (cifrada corretamente para a fonte, mas `creator` desconhecido), `resposta_do_administrador_vale`, `resposta_de_jornalista_ativo_vale_e_mostra_o_nome`, `resposta_copiada_para_outra_caixa_e_ignorada`, `contagem_de_ignoradas`.
- **Aviso da tela da fonte:** o painel da fonte não muda de layout, mas a lista de respostas já passa a trazer o autor e a contagem de ignoradas; a exibição disso é um texto pequeno na mesma lista.

**A6 — E2E (`tests/e2e`)**
- Acrescentar ao cenário existente: uma carteira estranha tenta anotar e responder, e o resultado é ignorado; o jornalista ativo anota e responde, e vale; após revogar, deixa de valer.
- Atualizar `docs/08-revisao-de-seguranca.md` (itens 7 e 8 passam a "corrigidos") e `docs/04-arquitetura-e-dados.md` (novos atributos).

**Pronto quando:** testes unitários, de contrato, de integração e E2E passam; os itens 7 e 8 constam como corrigidos.

## 3. Parte B — Refatoração do painel da redação

### 3.1 Princípios
- **Entrar com a carteira.** A tela de entrada não pede mais chave privada. As transações são aprovadas na MetaMask.
- **Descobrir o papel.** Depois de assinar uma mensagem de entrada, o painel verifica no ENS se o endereço é administrador, jornalista ou nenhum dos dois.
- **Uma interface por papel.** Abas e ações diferentes; o que o papel não pode fazer não aparece.
- **Mesmo visual.** Mantém `style.css` e as cores; muda a organização.
- **Chaves de cifragem como hoje (opção A).** A carteira assina; as chaves de cifragem continuam no backup com senha (administrador) e no chaveiro (jornalista).
- **Fonte fora.** Nenhuma carteira na tela da fonte; ela continua anônima.

### 3.2 Entrada e papéis
**Fluxo de entrada**
1. O usuário informa a **redação** (`jornalista1.eth`) e, se for jornalista, o **seu nome** (`maria`). O administrador informa só a redação.
2. Clica **Conectar carteira**. O painel descobre as carteiras instaladas (EIP-6963; `window.ethereum` como alternativa) e usa só o provedor injetado no navegador.
3. O painel pede a rede **Sepolia**; se faltar, pede para trocar.
4. O painel mostra uma mensagem para assinar (sem gasto de gás), com nome do site, redação, número aleatório e validade curta. A assinatura prova o controle do endereço (`verifyMessage`).
5. O painel consulta o ENS e define o papel.

**Regras de papel (`detectRole`, função pura e testada)**
| Condição | Papel |
|---|---|
| Endereço conectado = custodiante da redação (registro de endereço no ENS) | **Administrador** |
| `maria.<redação>` é jornalista **ativo** e o dono do subnome = endereço conectado | **Jornalista** |
| Qualquer outro caso | **Sem acesso**, com a causa (redação inexistente, nome de jornalista não encontrado, carteira diferente do dono, jornalista revogado) e o que fazer |

A sessão fica **só em memória**; recarregar a página sai. Trocar de conta na MetaMask encerra a sessão e reavalia o papel.

### 3.3 Estrutura do painel por papel
**Administrador**
| Aba | Conteúdo |
|---|---|
| **Início** | Estado da redação: nome, versão da chave, política, quantas denúncias novas; **alertas** (backup não feito, chave não carregada, denúncias vencendo, anotações ignoradas) e próximos passos |
| **Caixa de entrada** | Lista, filtros, abrir, decifrar, status, responder (o administrador também lê, pois tem as chaves) |
| **Equipe** | Cadastrar jornalista (nome, endereço, chave de leitura pública), entregar chaveiro, revogar (com aviso e atalho para girar a chave), lista dos jornalistas cadastrados nesta sessão |
| **Chaves e política** | Girar chave, editar política (categorias, tamanho, anexos), gerar e baixar backup, importar backup |
| **Retenção** | O que vence em N dias e renovação |

**Jornalista**
| Aba | Conteúdo |
|---|---|
| **Caixa de entrada** (padrão) | Igual à do administrador, sem o que depende de administração |
| **Minha chave** | Gerar a chave de leitura (guarda a privada no aparelho, mostra a pública para enviar ao administrador) e importar o chaveiro recebido; mostra se a caixa já pode ser aberta |
| **Retenção** | Ver e renovar o que vence (qualquer carteira pode estender, mas só o jornalista ativo vê o painel) |

O jornalista **não vê** cadastro/revogação de equipe, giro de chave, política nem backup. Se um botão for chamado por engano fora do papel, o controlador recusa (a regra vale no código, não só na tela).

### 3.4 Experiência
- **Guia de primeiros passos** por papel, com marcação do que já foi feito (ex.: "1. Carteira conectada ✔ · 2. Importar backup · 3. Cadastrar jornalista").
- **Estados vazios que explicam** o que fazer em vez de listas em branco.
- **Várias aprovações:** o cadastro da redação são 8 transações; a tela mostra "Confirme na carteira (3 de 8)" com o nome de cada etapa.
- **Links para a blockchain** depois de cada ação: hash da transação no Etherscan (Sepolia) ou endereço no explorador do Arkiv.
- **Confirmação antes de ações pesadas** (revogar, girar chave) dizendo o efeito.
- **Mensagens com causa e saída**, no mesmo padrão das telas atuais.
- **Acessibilidade:** rótulos, foco visível, navegação por teclado, abas com `role="tablist"`.

### 3.5 Arquitetura
- `apps/web-newsroom/src/wallet.ts`: adaptador de carteira sobre uma interface **EIP-1193** injetada (`request`, `on`), para trocar por uma carteira falsa nos testes. Funções: descobrir, conectar, trocar de rede, assinar, observar troca de conta.
- `packages/newsroom-client/src/login.ts`: monta a mensagem de entrada e a verifica (`verifyMessage`, validade, número único).
- `packages/newsroom-client/src/access.ts`: `detectRole` e `canDo(role, action)`, a tabela de permissões usada pelos controladores.
- `apps/web-newsroom/src/session.ts`: estado da sessão (conectado, papel, redação).
- Controladores separados: `admin-controller.ts` e `journalist-controller.ts`, sobre o `newsroom-client`, ambos checando `canDo`.
- A leitura continua pelo RPC público configurado (via `guardedFetch`); só **assinar e enviar** passa pela carteira. O envio da carteira usa o RPC dela, o que está fora do controle do app e fica documentado.
- A chave privada colada deixa de existir na interface. Os testes E2E seguem usando carteiras locais do viem por código, sem navegador.

### 3.6 Decisões desta parte
| ID | Decisão | Motivo |
|---|---|---|
| D-13-05 | Papel = custodiante no ENS (administrador) ou dono de subnome ativo (jornalista) | Usa só o que já está no ENS |
| D-13-06 | Jornalista informa o próprio nome ao entrar | O ENS não enumera subnomes |
| D-13-07 | Só carteira injetada; sem WalletConnect | Evita servidores de terceiros |
| D-13-08 | Opção A para as chaves de cifragem | Mantém backup com senha; derivar da carteira fica como possível Fase futura |
| D-13-09 | Sessão só em memória | Mesma regra de segredos do painel atual |
| D-13-10 | Carteiras de teste mantêm os papéis; importadas na MetaMask pelo usuário | Nenhuma chave passa pelo chat nem muda o `.env` |

### 3.7 Tarefas (teste primeiro)
**B0 — Investigação curta (antes de tudo)** — ✅ **concluída** (`validation/B0-RESULTADO.md`, script `validation/b0-arkiv-wallet-spike.ts`)
> **Resultado:** o SDK do Arkiv escreve com `createWalletClient({ account: <endereço>, chain, transport: custom(provedor) })`, e as quatro operações (criar, ler, estender, mudar propriedade) funcionaram com um provedor EIP-1193 falso, sem adaptador. Cada escrita vira um único `eth_sendTransaction`. Rabdi: chainId 7794095 (`0x76edaf`), moeda tGLM (18 casas), explorador `https://rabdi.explorer.arkiv.network`; a chave de acesso vai no caminho do RPC, então fica na configuração da carteira do usuário (decidir se é aceitável). **Não verificado:** a MetaMask real (prompts, estimativa de gas, troca de cadeia), que fica para a M-02. O app precisa chamar `eth_requestAccounts` e `wallet_switchEthereumChain` antes de usar o endereço.
Verificar, em testnet, se o SDK do Arkiv assina por um provedor de navegador (conta do tipo endereço, transporte customizado) e se a MetaMask aceita a rede da Rabdi (id da cadeia vem do próprio SDK). **Ponto de decisão:** se não funcionar, escolher entre um adaptador mínimo para o Arkiv ou manter, só para o Arkiv, uma assinatura local de sessão; a decisão fica registrada aqui antes de seguir. Os testes de controlador usam provedor falso e não dependem disso.

**B1 — `login.ts` e `access.ts`**
- Testes: `mensagem_tem_dominio_redacao_numero_e_validade`, `assinatura_valida_confere_o_endereco`, `assinatura_de_outro_endereco_e_recusada`, `mensagem_expirada_ou_reutilizada_e_recusada`, `detectRole` para os cinco casos, `canDo` para cada papel e ação (jornalista não administra).

**B2 — `wallet.ts` (adaptador EIP-1193)**
- Testes com provedor falso: `conecta_e_le_o_endereco`, `pede_troca_para_sepolia`, `recusa_do_usuario_vira_mensagem_clara`, `assina_a_mensagem`, `troca_de_conta_encerra_a_sessao`, `sem_carteira_instalada_mostra_orientacao`.

**B3 — Sessão e controladores por papel**
- Testes: administrador pode cadastrar jornalista e girar chave; jornalista recebe recusa nas ações administrativas; troca de conta reavalia o papel; `sem_acesso` traz a causa; progresso "3 de 8" no cadastro.

**B4 — Telas**
- Entrada, **Início**, **Caixa de entrada**, **Equipe**, **Chaves e política**, **Minha chave**, **Retenção**, abas com `role="tablist"`, links de transação, guia de primeiros passos, estados vazios.
- Atualizar os testes estáticos de HTML/CSP (sem hosts novos; a carteira não usa rede do app) e o teste de segredos (a tela não pede chave privada).
- Atualizar `docs/06-telas.md` com os novos wireframes.

**B5 — Documentação e roteiro**
- `docs/09-roteiro-manual.md`: como importar as chaves de teste na MetaMask, adicionar Sepolia e a rede do Arkiv, e a ordem de teste por papel.
- Nova lista manual **M-02** (carteira real), abaixo.

## 4. Lista manual M-02 (MetaMask, nas testnets)
1. Conectar com a carteira **OWNER**: entra como **administrador**; vê Início, Equipe, Chaves e política, Retenção.
2. Conectar com a carteira **JOURNALIST**, informando o nome cadastrado: entra como **jornalista**; não vê Equipe nem Chaves e política.
3. Conectar com uma **terceira carteira**: "Sem acesso" com a causa.
4. Trocar de conta na MetaMask com o painel aberto: a sessão encerra e o papel é reavaliado.
5. Cadastrar a redação: 8 aprovações, cada uma com o link da transação.
6. Anotar e responder como jornalista: as transações aparecem no explorador do Arkiv com o endereço do jornalista.
7. Tentar anotar com a terceira carteira (por script ou pelo explorador): a anotação não aparece no status; o painel mostra "1 anotação ignorada".
8. Pela tela da fonte, ler a resposta do jornalista (aparece com o nome) e confirmar que uma resposta forjada é ignorada.
9. Registrar o resultado em `validation/RESULTADOS.md`.

## 5. Ordem de execução e dependências
```
A1 ─► A2 ─► A3 ─► A4 ─► A5 ─► A6        (correções; independentes da interface)
B0 ─► B1 ─► B2 ─► B3 ─► B4 ─► B5        (painel; B3 usa A3)
```
Sugestão: fazer **A1 a A6 primeiro**, pois a interface nova depende de `authorName` e da autoridade; **B0** pode rodar em paralelo, por ser uma investigação rápida.

## 6. Riscos
| Risco | Mitigação |
|---|---|
| O SDK do Arkiv pode não assinar por provedor de navegador | B0 antes do resto; ponto de decisão registrado |
| Revogar um jornalista invalida o histórico dele (D-13-02) | Documentado; a redação pode registrar um novo status como administrador |
| Papel de jornalista depende de o usuário informar o próprio nome | Orientação na tela; erro com a causa |
| Carteira inteligente (contrato) como administrador não é suportada (assinatura de contrato) | Fora do escopo; documentado |
| Envio pela MetaMask usa o RPC dela (terceiro) | Inevitável; fora do app; documentado em `docs/08` |
| Muitas aprovações no cadastro (8) | Progresso claro e links; não há como evitar |

## 7. Pronto quando
- `npm run ci` verde, com testes novos nos pacotes afetados e metas de cobertura mantidas;
- `npm run test:integration` e `npm run test:e2e` verdes, com os cenários de autoria;
- `docs/08` com os itens 7 e 8 corrigidos; `docs/04`, `docs/06` e `docs/09` atualizados;
- **M-02** feita por você e registrada;
- o painel da redação sem campo de chave privada;
- nenhuma mudança em `GUARDRAILS.md`, `CLAUDE.md`, hook ou `guardrails/`.
