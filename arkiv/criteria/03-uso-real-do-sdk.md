# O SDK é usado de verdade

**Sim.** O Arkiv é o banco de dados do produto, e todo acesso passa pelo `@arkiv-network/sdk` 1.0.0.

- **Esquemas próprios** com colunas indexadas e opcionais (`defineSchema`, `str`, `u64`, `bytes`): [`../schema.md`](../schema.md).
- **Operações usadas:** `createEntity` (com `readonly` e `permissionlessExtension`), `changeOwnership`, `extendEntity`, `select` com filtros, paginação e tempo de bloco.
- **Modelo de dados feito para o Arkiv:** custódia transferível, prazo de vida, atributos indexados e prova de data pelo bloco; o `$creator` definido pela cadeia autentica anotações e respostas.
- **Carteira de navegador:** o SDK assina por um provedor EIP-1193 (`validation/B0-RESULTADO.md`).
- **Atritos encontrados** ao usar o SDK e a rede: [`../friction.md`](../friction.md).
