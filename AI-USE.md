# Declaração de uso de IA

Este projeto foi desenvolvido **com assistência de inteligência artificial**.

## Ferramenta
**Claude Code** (Anthropic), um assistente de programação que roda no terminal, com modelos da família Claude. Os commits feitos com o assistente trazem a linha `Co-Authored-By: Claude …` no histórico.

## Para que a IA foi usada
- Escrever **código** e **testes** (desenvolvimento orientado a testes), em TypeScript.
- Escrever e atualizar a **documentação** (`docs/`, `planejamento/`, `arkiv/`) e os documentos de apresentação.
- **Investigar** comportamentos das tecnologias (limites do Arkiv, ENSv2, World ID) por scripts de validação, com os resultados registrados em `validation/RESULTADOS.md`.
- **Revisar** o próprio código em busca de falhas de segurança e privacidade (`docs/08-revisao-de-seguranca.md`).

## O que é da pessoa responsável pelo projeto
- A **ideia**, as **decisões** de produto e de segurança (por exemplo, a regra de não usar rede de anonimato) e a escolha das trilhas.
- As **credenciais e carteiras de teste**: ficam só no `.env` local, nunca foram colocadas em conversas com a IA nem em arquivos versionados.
- Os **testes manuais** que dependem de pessoas e de aparelhos reais (prova do World ID no simulador, painel com a carteira no navegador).
- A decisão do que é publicado e submetido.

## O que a IA não fez
- Não usou nem instalou rede de anonimato (regra imposta por `GUARDRAILS.md`, pelo verificador `guardrails/check.mjs` e por um hook do assistente).
- Não teve acesso às chaves privadas.

## Limites desta declaração
- A **revisão linha a linha** de todo o código por uma pessoa **não está registrada** neste repositório. Parte da verificação vem dos testes automáticos (unitários, de integração e de ponta a ponta) e dos testes manuais citados acima.
- Esta declaração foi escrita com o próprio assistente a partir do histórico do projeto; a pessoa responsável deve revisá-la antes de submeter.
