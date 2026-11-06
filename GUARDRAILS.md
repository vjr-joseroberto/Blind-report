# Guardrails — o sistema não usa Tor nem redes de anonimato

## Regra
O Safe Whistle **não usa**, em nenhuma circunstância:

- Tor, Nym, Nox, I2P, Lokinet ou qualquer rede de anonimato ou mixnet;
- proxies SOCKS de anonimato e endereços de serviços ocultos;
- o Anon-RPC e qualquer um de seus workers (inclusive o Passthrough, que nem é necessário aqui);
- nenhuma dessas coisas em **código, testes, dependências, configuração, scripts ou comandos**.

Vale para o app, para os testes, para as ferramentas de desenvolvimento e para o assistente (Claude).

**Por quê**
- O desenvolvimento ocorre num computador de trabalho onde essas redes são proibidas.
- A proteção de rede é decisão do **usuário final**: quem quiser usa VPN ou Tor Browser por conta própria, fora do app. O app funciona sobre qualquer rede e **não depende** de nenhuma delas.
- O MVP usa um **RPC público** comum.

A fase de demonstração com Tor está **BLOQUEADA**: veja `planejamento/99-fase-tor-BLOQUEADA.md`.

## Camadas

### Criadas (já funcionam)
| Camada | Arquivo | O que faz |
|---|---|---|
| Padrões | `guardrails/patterns.mjs` | Lista única do que é proibido em código e em comandos |
| Verificador do repositório | `guardrails/check.mjs` | Varre código e configuração; sai com `exit 1` se achar algo. Ignora `.md` e os arquivos do próprio guardrail |
| Testes do guardrail | `guardrails/patterns.test.mjs` | 6 testes (`npm run test:guardrails`): bloqueios, não bloquear palavras comuns, caminhos isentos |
| Hook do Claude Code | `.claude/hooks/block-anon.mjs` + `.claude/settings.json` | Antes de cada `Bash`, `Write` ou `Edit`, **nega** comandos que executam ou instalam essas redes e escritas de código que as usem |
| Instrução ao assistente | `CLAUDE.md` | Regra explícita para o assistente |

### Planejadas (Fase 1 do plano, escritas com TDD)
| Camada | O que fará |
|---|---|
| **Política de rede em execução** (`packages/network-policy`) | Lista de hosts permitidos (RPC configurável, endpoints do World, relayer). Todo `fetch` do sistema passa por um invólucro que **recusa** qualquer host fora da lista |
| **Política de segurança de conteúdo (CSP)** | Gerada a partir da mesma lista: `connect-src` só com os hosts declarados |
| **Teste de dependências** | Falha se algum `package.json` ou lockfile contiver pacote de rede de anonimato |
| **Teste de requisições** | Os testes por script (integração e E2E) usam um **gravador de requisições** e **falham** se o sistema tentar contatar um host não declarado |
| **Etapa de CI** | `npm run guardrails` roda antes de tudo |

## Como usar
```bash
npm run guardrails         # varre o repositório
npm run test:guardrails    # testes do próprio guardrail
```

Se o hook não estiver ativo numa sessão do Claude Code já aberta, abra `/hooks` uma vez ou reinicie a sessão.

## Limites
- É detecção por padrões: um nome novo de rede de anonimato pode passar. Por isso a política de rede em execução (lista de hosts permitidos) é a defesa principal; os padrões são a rede de segurança.
- O hook só vale para o Claude Code. Comandos digitados no terminal passam por `npm run guardrails` e pelo CI.
- Documentação `.md` é isenta de propósito, para poder explicar a regra. Ao escrevê-la, use a ferramenta de arquivos e não um *heredoc* de shell que mencione serviços ocultos: o hook o bloquearia.
- Não há exceção em código. Qualquer mudança nessa regra exige decisão explícita do responsável pelo projeto e edição consciente de `guardrails/patterns.mjs`.
