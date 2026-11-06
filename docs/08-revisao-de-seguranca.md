# Revisão de segurança e privacidade (Fase 11, parte automática)

Feita com a lista de `planejamento/04-estrategia-tdd.md` §11, sobre o código das Fases 1 a 10. Cada item aponta o teste que o protege.

## 1. Lista de verificação
| Pergunta | Resultado | Evidência |
|---|---|---|
| Algum **texto original** ou **chave privada** vai à rede ou ao log? | Não | `source-client`: `cifra_antes_de_enviar…`, `nao_envia_a_chave_privada_nem_o_sal`; E2E "RNF-01" procura texto, sal, chave do recibo e chave privada da redação (texto, base64url e hex) em todas as requisições; log do relayer só tem rota, status e código |
| Algum atributo gravado **identifica a fonte**? | Não | O escritor é o relayer. Atributos: redação, categoria, época, hash do conteúdo cifrado, versão da chave. A prova do World nunca é gravada (RN-05); o armazém guarda só um hash do nullifier com a ação |
| O código contata um **host fora** da política? | Não | `guardedFetch` em todos os clientes e no relayer; CSP gerada da política; E2E "RNF-04/05"; `static.test.ts` das duas telas |
| **Dependência nova** de rede de anonimato? | Não | `npm run guardrails` (roda no `ci`) e o hook do assistente; nesta fase o verificador barrou duas vezes o texto que escrevi e eu reescrevi, sem contornar |
| O **erro mostrado** revela detalhes internos? | Não | Relayer: 500/502 sem detalhes; configuração: só nomes de variáveis; clientes: erros inesperados viram "Algo deu errado" (`erro_inesperado_vira_mensagem_generica…`) |

## 2. Ameaças consideradas e o que foi feito
| Ameaça | Situação |
|---|---|
| Abuso/DoS no relayer (cada requisição pode custar uma consulta ao RPC) | **Corrigido nesta fase:** limite global por minuto (`RATE_LIMIT_PER_MINUTE`, padrão 120) em balde de fichas, **sem IP** nem estado por pessoa. Excedente recebe 429 com `retry-after`. As verificações baratas já vinham antes da chamada ao World |
| RPC público instável | **Tratado:** `RPC_TRANSPORT` (3 repetições com recuo de 400 ms, tempo máximo de 15 s) em relayer e telas |
| Verificador simulado em produção | O relayer **recusa iniciar** com `SIMULATE_WORLD=1` se algum RPC não for localhost, e avisa no log quando ativo |
| CORS aberto | Só origens exatas; curinga nunca aceito |
| Cabeçalhos | `no-store`, `nosniff` no relayer; `scripts/serve.mjs` envia a CSP como cabeçalho (inclui `frame-ancestors`) |
| Segredos em armazenamento do navegador | O painel não guarda chaves, senhas, recibos nem backups. **Única exceção (decidida na Fase 13):** `names.ts` grava em `localStorage` apenas os **nomes** das redações abertas por carteira; um teste confere que só esse arquivo toca o armazenamento e que ele não cita chaves nem senhas. A entrada é pela carteira: nenhuma chave privada é digitada |
| Backup de chaves fraco | PBKDF2-SHA256 com 600 mil iterações, sal e nonce novos, bloco autenticado; senha mínima de 8 caracteres; iterações absurdas no arquivo são recusadas |
| Dependências com vulnerabilidade | `npm audit --omit=dev`: **0 vulnerabilidades** nas dependências de execução. O `npm audit` completo aponta avisos moderados só em ferramentas de desenvolvimento (testes e build), que não vão ao navegador nem ao relayer |
| Pacote do navegador com URLs de bibliotecas | Lista revisada em cada `static.test.ts`; nenhuma está na CSP; um host novo derruba o teste |

## 3. Riscos que permanecem (aceitos no MVP ou fora de escopo)
1. **O operador do relayer vê IP e horário** no envio (o relayer não os registra, mas a rede os entrega). A mitigação é o usuário escolher uma proteção de rede por conta própria, fora do app.
2. **Chave privada de carteira colada no painel.** Só testnet. Integrar carteira de navegador é trabalho futuro.
3. **Chaves já entregues a um jornalista revogado** continuam abrindo denúncias antigas; o cliente recomenda girar a chave.
4. **A lista M-01 (navegador real) ainda não foi feita:** não há prova de que o navegador aplica a CSP nem de que o IDKit só contata `bridge.worldcoin.org`. É o próximo passo, manual (`docs/09-roteiro-manual.md`).
5. **Vida máxima de 182 dias no Arkiv:** sem o job de renovação rodando, as denúncias somem. Não verificado na Rabdi (só no nó local).
6. **Verificação do World em `production`** não foi testada (só `staging` pelo simulador).
7. ~~Anotações de status não eram autenticadas.~~ **Corrigido na Fase 13 (A1 a A3, A6).** A anotação só conta se o `creator` da entidade (definido pela cadeia) for o administrador (custodiante no ENS) ou o dono de um subnome de jornalista ativo, que o `authorName` declarado precisa corresponder. As demais são ignoradas e contadas (`ignoredAnnotations`). Efeito aceito: ao revogar um jornalista, o que ele anotou deixa de valer, porque a checagem usa o estado atual do ENS.
8. ~~Respostas não eram autenticadas.~~ **Corrigido na Fase 13 (A4, A5, A6).** A tela da fonte só mostra resposta cujo `creator` seja o administrador ou um jornalista ativo, cujo conteúdo cifrado carregue o nome da mesma redação; as demais são ignoradas e contadas. Respostas no formato antigo (texto puro) também são ignoradas. Falha ao consultar o ENS não vira autorização: a leitura falha.
9. **Não há destinatário individual.** A fonte cifra só para a chave da redação; não dá para enviar a um jornalista específico (ver `docs/09-roteiro-manual.md` e a explicação de papéis).
