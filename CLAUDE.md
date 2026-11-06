# Instruções do projeto Safe Whistle

## Guardrail: sem Tor nem redes de anonimato
Este é um computador de trabalho onde Tor e redes semelhantes são **proibidos**.

- **Nunca** execute, instale, configure, escreva código para, nem proponha usar Tor, Nym, Nox, I2P, Lokinet, proxies SOCKS de anonimato, serviços ocultos ou o Anon-RPC. Vale para o app, testes, dependências e comandos.
- O MVP usa um **RPC público** comum. O usuário final escolhe VPN ou Tor Browser por conta própria, fora do app.
- A fase de demonstração com Tor está **BLOQUEADA** (`planejamento/99-fase-tor-BLOQUEADA.md`). Não a execute nem a desbloqueie por iniciativa própria.
- Antes de qualquer tráfego de rede incomum, pergunte.

O guardrail é imposto por `.claude/hooks/block-anon.mjs`, `guardrails/check.mjs` e, depois da Fase 1, pela política de rede em execução. Detalhes em `GUARDRAILS.md`. Não contorne o hook nem o verificador.

## Como desenvolver
- **TDD sempre:** escreva o teste que falha primeiro, depois o código mínimo, depois refatore. Veja `planejamento/04-estrategia-tdd.md`.
- Código simples de MVP: funções pequenas, sem frameworks pesados, sem abstrações antes de precisar.
- Dados de teste fictícios; nenhuma fonte real.
- Documentação em `docs/`; requisitos e plano em `planejamento/`.
