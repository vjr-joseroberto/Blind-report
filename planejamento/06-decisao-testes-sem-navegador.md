# Decisão D-01 — Testes apenas por script, sem navegador

**Status:** aprovada. **Data:** 2026-11-01.

## 1. Decisão
Todos os testes do Safe Whistle são **scripts executados em Node** (Vitest e `node --test`). **Não há navegador automatizado** (Playwright, Selenium, Puppeteer ou similar) em nenhum nível de teste.

## 2. Por que isso é viável
O que exigiria navegador é a lógica dos front-ends. Para tirá-la da tela, o plano passa a ter **clientes sem interface**:
- `packages/source-client`: toda a lógica da fonte (consultar, compor, cifrar, provar, enviar, recibo, respostas, verificação).
- `packages/newsroom-client`: toda a lógica da redação (cadastro, chaves, jornalistas, lista, decifragem, status, resposta, retenção).

As telas (`apps/web-source`, `apps/web-newsroom`) ficam **finas**: ligam campos aos clientes e mostram o resultado. Como a cifragem acontece em JavaScript com o libsodium, ela roda igual em Node e no navegador, então os testes em Node exercem o mesmo código.

## 3. O que mudou nos documentos
| Documento | Mudança |
|---|---|
| `01-requisitos.md` | Nova restrição RC-08; verificação de RNF-01, RNF-04, RNF-08 e RNF-09 passa a usar scripts, análise estática e a lista manual M-01 |
| `02-fase-0-validacao.md` | V-05 vira análise estática do pacote do IDKit; V-07 vira medição em Node |
| `03-estrutura-monorepo.md` | Novos pacotes `source-client` e `newsroom-client`; telas finas; E2E por script |
| `04-estrategia-tdd.md` | Tabela de níveis sem Playwright; gravador de requisições; fornecedor de prova como dublê |
| `05-plano-de-desenvolvimento.md` | Fases 8, 9 e 10 reescritas; Fase 11 usa a lista M-01 |
| `../docs/02-tecnologias.md` e `../docs/03-componentes.md` | Sem Playwright; novos componentes |

## 4. Nova análise: o que cada requisito de risco passa a usar
| Requisito | Como é verificado agora (por script) | Cobertura |
|---|---|---|
| RNF-01 Sigilo (nada de texto original nem chave privada na rede) | Gravador de requisições injetado nos clientes e no relayer; asserção sobre todo corpo enviado | **Total** para o código dos clientes |
| RNF-03 Integridade do envelope | Testes unitários e de propriedades da `crypto` | **Total** |
| RNF-04 Sem terceiros | Gravador de requisições (hosts); análise estática do HTML e do pacote gerados; teste da CSP gerada | **Parcial**: não prova que o navegador aplica a CSP nem o que o IDKit faz em execução |
| RNF-05 Sem rede de anonimato | `guardrails`, teste de dependências, `guardedFetch` | **Total** |
| RNF-08 Desempenho | Script em Node (V-07); meta de envio ponta a ponta medida nos E2E | **Boa**; conferência manual em navegador opcional |
| RNF-09 Usabilidade | Testes das causas de erro e do recibo; revisão manual | **Parcial**: aparência e fluxo de tela não são automatizados |
| UC-06 a UC-10 (fluxos) | E2E por script usando os clientes | **Total** para a lógica; **não** exercita cliques e campos |
| World ID na tela | Verificador e fornecedor de prova simulados; prova real só na Fase 0 | O widget do IDKit **não** é testado por automação |

## 5. O que se perde e como mitigar
| O que se perde | Mitigação |
|---|---|
| Confirmar que o **navegador aplica a CSP** e que a página não carrega nada de terceiros em execução | Análise estática do HTML e do pacote gerados + teste da CSP gerada + **lista manual M-01** |
| Testar **cliques, campos e mensagens** reais da tela | Telas finas sem lógica; testes dos clientes cobrem as decisões; opcionalmente, DOM simulado em Node (jsdom) para renderização básica; revisão manual na lista M-01 |
| Comportamento específico do navegador (armazenamento local, ArrayBuffer, WebAssembly) | Libsodium usa o mesmo motor de JavaScript e WebAssembly; conferência manual na lista M-01 |
| O **widget do IDKit** | Já não é automatizável (depende do celular); isola-se atrás do `ProofProvider` e é verificado manualmente |
| Regressões visuais | Aceitas no MVP |

**Riscos residuais aceitos:** um erro que só aparece no navegador (por exemplo, uma biblioteca incompatível) pode escapar dos testes automáticos. O risco é pequeno porque a lógica é a mesma em Node e as telas são finas, e é reduzido pela lista M-01.

## 6. Lista de verificação manual M-01 (antes de considerar o MVP pronto)
Feita **uma vez**, por uma pessoa, em um navegador comum (**sem rede de anonimato**), com o app construído apontando para os nós locais ou para as redes de teste.

1. Abrir a tela da fonte com o painel de rede do navegador aberto: confirmar que só aparecem os hosts da política de rede (RPC, World, relayer) e **nenhum** de terceiros (fontes, scripts, analytics).
2. Conferir que a página tem o cabeçalho de CSP esperado (ver na aba de rede ou no código-fonte) e que uma requisição a um host não permitido é bloqueada pelo navegador.
3. Percorrer o fluxo de envio: texto, anexo pequeno, prova (simulada), recibo; confirmar que o recibo pode ser baixado e restaurado.
4. Abrir o painel da redação: listar, decifrar, mudar status e responder.
5. Voltar à tela da fonte e ler a resposta com o recibo.
6. Cifrar um arquivo de ~100 KiB e anotar o tempo percebido.
7. Ler as mensagens de erro principais (prova negada, limite atingido, nome inexistente) e conferir se dizem a causa e o que fazer.
8. Registrar o resultado em `validation/RESULTADOS.md`.

## 7. Impacto em esforço
- **Menos:** sem automação de navegador, sem fixtures de interface, ambiente de E2E mais simples.
- **Mais:** dois pacotes novos (`source-client`, `newsroom-client`) e a disciplina de manter as telas finas. É a mesma lógica que já existiria, só organizada fora da tela.

Efeito líquido: **esforço total menor ou igual**, com testes mais rápidos e estáveis.

## 8. Fora do escopo
Esta decisão trata de **testes**. Não muda o produto: os front-ends continuam existindo e rodando no navegador do usuário. Também não muda o guardrail: continua proibido qualquer rede de anonimato.
