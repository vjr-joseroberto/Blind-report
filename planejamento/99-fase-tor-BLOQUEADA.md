# Fase 12 — Demonstração com rede anônima

## ⛔ STATUS: BLOQUEADA

| Campo | Valor |
|---|---|
| Status | **BLOQUEADA** |
| Desde | 2026-10-31 |
| Responsável pela decisão | Responsável pelo projeto |
| Motivo | Redes de anonimato (Tor e semelhantes) são **proibidas** no computador de trabalho onde o sistema é desenvolvido; além disso, a proteção de rede é escolha do usuário final, fora do app |
| Prazo para revisão | Nenhum. Só é revisada por decisão explícita e escrita do responsável |

## O que a fase seria
Uma demonstração em que o fluxo da fonte (consultar a redação, enviar a denúncia, receber a resposta) é acessado por uma rede anônima, para mostrar que o app funciona sobre ela **sem embutir** nenhuma. A execução seria feita **por outra pessoa, em outra máquina onde isso é permitido**, sem alterar o código do projeto. O roteiro de uma versão anterior está em `../../MODO-TOR.md` (pasta do projeto de origem) e serve só como referência histórica.

## Enquanto estiver bloqueada
- **Nenhuma tarefa** desta fase é criada, estimada ou executada.
- **Nenhum teste**, dependência, script, configuração ou comando usa Tor, Nym, Nox, I2P, Lokinet, SOCKS de anonimato ou o Anon-RPC.
- **Nenhum código** do monorepo contém suporte a rede anônima. O app funciona sobre qualquer rede ordinária e o usuário final decide, fora do app, se usa VPN ou outra ferramenta.
- O assistente de desenvolvimento **não** a desbloqueia, não a executa e não propõe executá-la.
- O MVP usa um **RPC público** comum.

## Como o bloqueio é imposto
| Camada | O que faz |
|---|---|
| `guardrails/check.mjs` | Falha se algum código ou configuração mencionar essas redes |
| `guardrails/patterns.test.mjs` | Testa o próprio guardrail |
| `.claude/hooks/block-anon.mjs` | Nega comandos e escritas do assistente que as usem |
| `CLAUDE.md` | Instrução explícita ao assistente |
| `packages/network-policy` (Fase 1) | Recusa em execução qualquer host fora da lista; sem SOCKS |
| Teste de dependências (Fase 1) | Falha se um pacote de rede de anonimato aparecer em qualquer `package.json` |
| `npm run ci` | Roda o guardrail antes de tudo |

## Condições para desbloquear
**Todas** as condições abaixo são obrigatórias, e a decisão é do responsável pelo projeto:

- [ ] Decisão **explícita e escrita** do responsável, registrada na tabela abaixo.
- [ ] Confirmação de que o ambiente de execução **permite** a rede (outra máquina, fora do computador de trabalho).
- [ ] Execução **fora deste repositório e desta máquina**, por pessoa identificada.
- [ ] **Nenhuma** alteração do código principal para suportar a rede anônima; o app permanece agnóstico de rede.
- [ ] Texto de transparência no material do projeto: quem executou, onde e quando.
- [ ] O guardrail permanece ativo e passando no repositório principal.

Mesmo desbloqueada, a fase **não** autoriza código de Tor no repositório: ela apenas autoriza uma demonstração externa.

## Registro de decisões
| Data | Decisão | Quem |
|---|---|---|
| 2026-10-31 | Fase criada já **BLOQUEADA**. O projeto não usa Tor nem redes semelhantes | Responsável pelo projeto |
