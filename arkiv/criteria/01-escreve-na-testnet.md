# O app escreve na testnet do Arkiv

**Sim.** Na testnet **Rabdi** (chain id 7794095), por meio do SDK.

- **Quem escreve e o quê** (carteiras no README):
  - O **relayer** cria cada entidade `denuncia` e transfere a propriedade à redação (`createEntity` e `changeOwnership`).
  - O **administrador** (e jornalistas) cria `anotacao` e `resposta`, e estende prazos (`extendEntity`).
- **Código:** `packages/arkiv-store/src/sdk-backend.ts` (`create`, `changeOwnership`, `extend`) e `apps/relayer/src/compose.ts` (relayer sobre a Rabdi).
- **Evidência na Rabdi (2026-11-01):** `npm run arkiv:query -- jornalista1.eth` lista 1 denúncia (criada pelo relayer, de propriedade da carteira da redação), 1 anotação e 1 resposta. As transações podem ser vistas em https://rabdi.explorer.arkiv.network pelo endereço das carteiras.
- **Medições feitas na Rabdi:** `validation/RESULTADOS.md`, V-01 (limites de tamanho, expiração, custódia e custo).
