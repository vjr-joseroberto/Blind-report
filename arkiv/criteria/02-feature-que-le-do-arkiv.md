# Uma funcionalidade lê do Arkiv

**Sim, três, e nenhuma funciona sem a leitura:**

1. **Caixa de entrada da redação:** lista as denúncias por redação, categoria e status (`listSubmissions`), remonta anexos em partes e decifra no navegador.
2. **Respostas à fonte:** a fonte busca as respostas pelo `mailboxId` (`getReplies`) e só mostra as escritas por quem a redação reconhece.
3. **Verificação de data e integridade:** qualquer pessoa, com o arquivo cifrado em mãos, procura no Arkiv a entidade com o mesmo hash e vê o **bloco** em que foi gravada (`verifyDocument`).

- **Código:** `packages/arkiv-store/src/store.ts` (leitura), `packages/newsroom-client` e `packages/source-client` (uso).
- **Teste:** o E2E (`tests/e2e`) percorre denúncia, leitura, resposta e verificação contra um nó Arkiv real em ambiente local.
