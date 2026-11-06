# Resultados da Fase 0 — Validação

Executadas em 2026-11-01. Scripts em `validation/`. Rede usada: RPC público comum, fork local da Sepolia (Docker) e nó Arkiv local (Docker). **Nenhuma rede de anonimato.**

## Resumo
| ID | Validação | Status | Script |
|---|---|---|---|
| V-01 | Arkiv na Rabdi: custo, limite e comportamento | ✅ **Concluída** (Rabdi real) | `v01-arkiv-rabdi.ts` |
| V-02 | Prova real do World ID e nullifier por ação | ✅ **Concluída** (simulador, `staging`) | `v02-worldid-proof.ts` |
| V-03 | ENS na Sepolia real | ✅ **Concluída** (Sepolia real) | `v03-ens-sepolia.ts` |
| V-04 | Subnames: expiração, revogação, transferência, renovação | ✅ **Concluída** (fork local) | `v04-subnames.ts` |
| V-05 | Hosts que o IDKit referencia | ✅ **Concluída** (análise estática) | `v05-idkit-hosts.mjs` |
| V-06 | Limites e estabilidade de RPCs públicos | ✅ **Concluída** | `v06-rpc-burst.ts` |
| V-07 | Desempenho da cifragem | ✅ **Concluída** | `v07-crypto-perf.ts` |
| V-08 | Redação como custodiante no Arkiv | ✅ **Concluída** (nó local) | `v08-custody.ts` |

Todas as validações da Fase 0 estão concluídas. A V-02 foi feita no simulador do World (`staging`), não com o World App em `production`.

---

## V-07 — Desempenho da cifragem (meta RNF-08: 100 KiB em menos de 100 ms)
Medido em Node 22 (V8 e WebAssembly), mediana de 15 execuções, 1 destinatário.

| Tamanho | cifrar (ms) | abrir (ms) | codificar+decodificar (ms) | bytes do envelope |
|---|---|---|---|---|
| 1 KiB | 1,09 | 0,23 | 0,05 | 1.569 |
| 100 KiB | 2,08 | 0,62 | 0,15 | 102.945 |
| 1 MiB | 7,51 | 3,55 | 0,48 | 1.049.121 |

**Resultado:** meta **atendida com folga** (2,08 ms). O custo extra do formato é ~500 bytes por envelope (1 destinatário). Confirmação em navegador fica na lista manual M-01.

## V-06 — RPCs públicos comuns
`eth_blockNumber`: 20 chamadas sequenciais e uma rajada de 40 paralelas. Só chamadas leves; `getLogs` e outras não foram medidas.

| RPC | Sequencial | p50 | p95 | Rajada 40 | Observação |
|---|---|---|---|---|---|
| **publicnode (Sepolia)** | 20/20 | 183 ms | 535 ms | 40/40 | Sem erros |
| tenderly gateway (Sepolia) | 20/20 | 193 ms | 409 ms | 40/40 | Sem erros |
| 1rpc (Sepolia) | 20/20 | 362 ms | 1.746 ms | 40/40 | Mais lento |
| drpc (Sepolia) | 0/20 | — | — | 0/40 | Exige plano pago |
| rpc.sepolia.org | 0/20 | — | — | 0/40 | Tempo esgotado |
| Arkiv Rabdi (público, sem chave) | 20/20 | 269 ms | 1.042 ms | 40/40 | Sem erros nesta carga leve |

**Decisões**
- **RPC padrão da Sepolia: publicnode** (`https://ethereum-sepolia-rpc.publicnode.com`), com **tenderly gateway** como alternativa. Evitar drpc e rpc.sepolia.org.
- O RPC continua **configurável pelo usuário** (RF-20).
- O fork local falhou uma vez ao iniciar por instabilidade do RPC (bloco não encontrado): o script `nodes-up.sh` agora tenta de novo até 3 vezes.
- **Limite desta medição:** a Rabdi sem chave respondeu bem a leituras leves; escritas e cargas maiores dependem da chave (V-01).

## V-05 — Hosts que o IDKit referencia (análise estática, `@worldcoin/idkit` 4.6.0)
| Host | Papel provável | Entra na política de rede? |
|---|---|---|
| `bridge.worldcoin.org` | Ponte que liga o app do World ao navegador (conexão e *polling*) | **Sim** (connect-src) |
| `developer.world.org` | API de verificação v4 (servidor) e página de privacidade | **Sim**, mas só no **relayer** |
| `world.org`, `staging.world.org`, `sandbox.world.org` | Links para abrir o app do World (`/verify`) | Não é `fetch`; apenas navegação do usuário |
| `simulator.worldcoin.org` | Simulador (testes) | Só em desenvolvimento |
| **`world-id-assets.com`** | **Fontes do widget** (`.woff2`) | **Não** (terceiro) |
| `github.com`, `docs.world.org`, `eprint.iacr.org`, `mathiasbynens.be`, `www.w3.org` | Comentários, documentação e namespaces | Não (não são requisições) |

**Achado importante:** o **widget** do IDKit carrega fontes de um domínio de terceiros (`world-id-assets.com`), o que **viola** `font-src 'self'` e o princípio de "sem terceiros".

**Decisão:** o `ProofProvider` do `source-client` usa o pacote **headless `@worldcoin/idkit-core`** (gera o `connectorURI` e faz o *polling*), e a **nossa tela** desenha o QR e o botão. Assim a CSP continua só com `'self'` + `bridge.worldcoin.org`, sem fontes de terceiros. A confirmação em tempo de execução fica na lista manual M-01.

## V-08 — Redação como custodiante (nó Arkiv local)
| Verificação | Resultado |
|---|---|
| Criador estende antes de transferir | Permitido |
| Criador apaga depois de transferir | **Recusado** |
| Criador estende depois de transferir | **Recusado** |
| Terceiro estende (sem flag) | **Recusado** |
| Redação (nova dona) estende | Permitido |
| Redação altera o conteúdo (entidade `readonly`) | **Recusado** |
| Redação transfere a propriedade a outra conta | Permitido |
| Com `permissionlessExtension`: o relayer (não dono) estende | **Permitido** |
| Com `permissionlessExtension`: o relayer apaga | **Recusado** |
| Com `permissionlessExtension`: um terceiro estende | Permitido (só aumenta a retenção; custo é de quem estende) |
| Redação apaga | Permitido |
| `$owner` após a transferência | A redação |
| `$creator` após a transferência | **Continua sendo o relayer** |

**Decisões**
1. O relayer cria a entidade com `readonly` **e** `permissionlessExtension`, e transfere a propriedade à redação.
2. Assim o **job de renovação** roda no relayer **sem ser dono** e **não consegue apagar** (RF-11, RF-18).
3. A redação continua podendo apagar e transferir: o controle é dela.
4. `$creator` fica público como o relayer; isso é esperado (não identifica a fonte).

## V-04 — Subnames de jornalistas (fork local da Sepolia)
| Verificação | Resultado |
|---|---|
| O subname resolve a chave de leitura pelo nome | Sim |
| `findOwner` devolve o jornalista | Sim |
| O jornalista altera o resolver sem role | **Recusado** |
| `unsafeTransfer` sem `CAN_TRANSFER_ADMIN` | **Recusado** |
| `safeTransferFrom` (mesmo com `CAN_TRANSFER_ADMIN`) | **Recusado** (o registry não é "emancipado") |
| `unsafeTransfer` com `CAN_TRANSFER_ADMIN` | Permitido |
| Terceiro tenta revogar | **Recusado** |
| Administrador revoga (`unregister`) | Permitido, inclusive após o jornalista transferir |
| Depois de revogar, `findOwner` | Endereço zero (sem dono) |
| Administrador limpa a chave de leitura do revogado no resolver | Permitido |
| Administrador cadastra o mesmo rótulo de novo (revogado ou expirado) | Permitido |
| Administrador renova (`renew`) | Permitido |
| Terceiro renova | **Recusado** |
| Depois de expirar: status e `findOwner` | Livre / endereço zero |
| **Depois de expirar: a chave de leitura continua resolvendo pelo nome** | **Sim** (o registro do resolver permanece) |

**Decisões**
1. **Quem é jornalista ativo é decidido pelo registry, não pelo texto:** `ens-client` deve oferecer `isActiveJournalist(name)`, que confere `findOwner` diferente de zero, e **nunca** confiar só em `denuncia.readerkey` (ela continua legível após expirar ou revogar).
2. **Revogar = `unregister` + limpar `denuncia.readerkey` no resolver**, nesta ordem, e rotacionar a chave de leitura.
3. **Jornalistas não recebem `CAN_TRANSFER_ADMIN`:** os subnames não são transferíveis (`safeTransferFrom` não funciona neste registry e `unsafeTransfer` exigiria o papel).
4. Só o administrador renova; definir um prazo de subname (por exemplo, 1 ano) com lembrete de renovação.
5. As permissões do resolver continuam **por chave de texto, em todos os nomes**: um resolver por redação (já decidido).

## V-01 — Arkiv na Rabdi (real, 2026-11-01)
Rede: Rabdi (chain 7794095), preço do gás 1 gwei, bloco de ~2 s. Carteira `RELAYER` (10 tGLM).

| Tamanho do envelope | Resultado | Custo (tGLM) |
|---|---|---|
| 1 KiB | aceito | 0,000168 |
| 16 KiB | aceito | 0,000695 |
| 64 KiB | aceito | 0,002662 |
| 120 KiB | aceito | 0,004958 |
| ~126 KiB (128.960 B) | aceito | 0,005201 |
| 128 KiB exatos (131.072 B) | **recusado** (sem causa na rede) | 0 |
| 131.073 B | recusado **pelo SDK** (acima de 131.072) | — |

| Outro comportamento | Resultado |
|---|---|
| Consulta por filtro (`newsroom`) | Encontra a entidade |
| Expiração de 30 s | Existe antes (1) e **some** depois (0), como no nó local |
| `changeOwnership` para a redação | Permitido (custo 0,000043 tGLM) |
| Relayer estende sem ser dono (`permissionlessExtension`) | **Permitido** (0,000043 tGLM) |
| Relayer apaga depois de transferir | **Recusado** |
| Redação estende | Permitido |
| Redação altera o conteúdo (`readonly`) | **Recusado** |
| `$owner` / `$creator` depois da transferência | redação / relayer |

**Conclusões**
- O comportamento da Rabdi é **igual ao do nó local** (limite prático de ~126 KiB, expiração, custódia). Os testes de integração com o nó local são representativos.
- **Custo desprezível:** ~0,00017 tGLM por denúncia pequena; 10 tGLM comportam dezenas de milhares.
- Confirmado: o limite útil por entidade é **128.960 bytes**; `PART_PAYLOAD_BYTES` (120 KiB) deixa folga.

## V-03 — ENS na Sepolia real (2026-11-01)
Nome de teste `swv035c8du.eth`; carteiras `OWNER` e `JOURNALIST`. 13 transações, 5.037.136 de gás no total, **224 s** (dos quais ~70 s são a espera obrigatória do commit-reveal). O preço do gás na Sepolia estava em ~18 wei, então o custo em ETH foi irrisório (~9 × 10⁻¹¹ ETH).

| Passo | Gás |
|---|---|
| Criar resolver (proxy) | 791.010 |
| Commit do registro | 127.458 |
| Mint e approve do MockUSDC | 140.589 e 128.274 |
| Registrar o nome `.eth` | 655.997 |
| Texto `denuncia.pubkey` / versão / política | 593.359 / 151.482 / 483.598 |
| Endereço da redação (custodiante) | 149.621 |
| Criar registry dos jornalistas e ligá-lo ao nome | 903.034 e 139.552 |
| Cadastrar o subname do jornalista | 497.981 |
| Chave de leitura do jornalista | 275.181 |

**Leitura pelo nome (Universal Resolver): tudo conferiu** — chave pública, versão, política, custodiante, chave de leitura e dono do subname.

**Conclusões**
- O fluxo funciona na rede real, igual ao fork.
- **Cada transação leva ~10 s** na Sepolia. Cadastrar uma redação leva **cerca de 4 minutos** com 13 transações; a UX do painel deve mostrar o progresso e a espera do commit.
- **Otimização adotada:** o resolver tem `multicall(bytes[])`; o `ens-client` publica os registros (chave, versão, política, endereço e relayer) em **uma transação**, em vez de cinco.

## V-02 — concluída (simulador, `staging`)
**Resultado (época 202611, ações `submit:v02-a.eth:202611` e `submit:v02-b.eth:202611`):**
| Prova | Resultado |
|---|---|
| A1 (pessoa A, redação A) | ACEITO |
| B1 (pessoa B, redação B) | ACEITO |
| A2 (pessoa A de novo, redação A) | RECUSADO (`limit_reached`) |

O nullifier de A1 é igual ao de A2 e diferente do de B. **O modelo anti-spam por pessoa×redação×época está confirmado** com a API v4 real (`developer.world.org`). Bruto em `validation/out/v02.json`.

**Limite:** foi o simulador em `staging`; a prova com o World App real em `production` não foi testada.

### Como foi feita (histórico)
O `worldid-gate` (Fase 6) está pronto e o script de prova real também: `validation/v02-worldid-proof.ts`. O teste a seco (`--dry`) já criou um pedido real no IDKit e gerou o link de conexão, ou seja, o `app_id`, o `rp_id` e a chave de assinatura estão aceitos pela ponte do World.

**O que você faz (cerca de 5 minutos):**
1. Rode `npx tsx validation/v02-worldid-proof.ts` na pasta `safe-whistle`.
2. O script imprime um link (3 vezes, uma por prova: A1, B1 e A2). Para cada um, abra https://simulator.worldcoin.org/ e cole o link; confirme a verificação.
3. Ao final ele mostra o resumo e grava `validation/out/v02.json`.

**Resultado esperado:** A1 aceito; B1 aceito; A2 recusado (`limit_reached`); o identificador (nullifier) de A1 igual ao de A2 e diferente do de B1. Se for assim, o modelo anti-spam por ação está **confirmado**. Se o nullifier não variar por ação, a regra RN-01 precisa ser revista antes do relayer.

| Validação | Status | Dublê em uso |
|---|---|---|
| V-02 | ✅ concluída no simulador | Verificador simulado só nos testes automatizados |

## Adendo (Fase 5) — vida máxima de uma entidade no Arkiv
Descoberto nos testes de integração do `arkiv-store` (nó local): pedir uma expiração de 365 dias foi **recusado pela cadeia** com *"the expiry resolves to block …, more than the chain's maximum lifetime of 7884000 blocks"*. Ou seja, **a vida máxima é de 7.884.000 blocos (~182,5 dias)**.

**Decisões**
- A loja recusa retenções acima de `STORE_MAX_RETENTION_SECONDS` (teto da cadeia menos 1 hora de folga, por causa da diferença de bloco entre a criação e a inclusão).
- A retenção padrão das anotações é de **150 dias**.
- A **renovação periódica passa a ser obrigatória** (RN-06). O job do relayer (Fase 7) deve renovar o que vence em até ~60 dias.
- Não verificado na Rabdi: o limite foi medido no nó local; confirmar na Rabdi quando houver oportunidade (provavelmente o mesmo parâmetro).
