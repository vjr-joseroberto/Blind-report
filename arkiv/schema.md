# Esquema do Arkiv no Safe Whistle

O Safe Whistle usa o Arkiv (testnet **Rabdi**, chain id 7794095) como banco de dados público. Os registros são **cifrados**: o Arkiv guarda e indexa, mas o sigilo vem da criptografia feita no navegador. Código: `packages/arkiv-store/src/sdk-backend.ts` (esquemas) e `packages/arkiv-store/src/store.ts` (regras).

## Três tipos de entidade

### `safe-whistle.denuncia`: o envelope cifrado
| Coluna | Tipo | Indexada | Conteúdo |
|---|---|---|---|
| `newsroom` | texto | sim | Nome ENS da redação (`redacao.eth`) |
| `category` | texto | sim | Categoria da política da redação |
| `status` | texto | sim | Sempre `new` na criação (o estado real vem das anotações) |
| `epoch` | u64 | sim | Mês (AAAAMM, UTC) |
| `contentHash` | texto | sim | Hash BLAKE2b-256 do texto cifrado; agrupa as partes |
| `pubkeyVersion` | u64 | não | Versão da chave da redação usada |
| `part` / `parts` | u64 | não | Índice e total (anexos grandes viram várias entidades) |
| `envelope` | bytes | não | Envelope cifrado (≤ 120 KiB por parte) |

**Quem escreve:** o relayer (carteira `RELAYER`). Logo depois, ele **transfere a propriedade** à redação. Sinalizadores: `readonly` e `permissionlessExtension`.

### `safe-whistle.resposta`: resposta cifrada à fonte
| Coluna | Tipo | Indexada | Conteúdo |
|---|---|---|---|
| `newsroom` | texto | sim | Redação que responde |
| `mailboxId` | texto | sim | Hash da chave pública da caixa da fonte (a fonte busca por ele) |
| `authorName` | texto, opcional | não | Nome ENS de quem respondeu (declaração; vale só se o `creator` for autorizado) |
| `sealed` | bytes | não | Resposta cifrada para a chave da caixa |

**Quem escreve:** o administrador ou um jornalista ativo.

### `safe-whistle.anotacao`: status de uma denúncia
| Coluna | Tipo | Indexada | Conteúdo |
|---|---|---|---|
| `newsroom` | texto | sim | Redação |
| `denunciaKey` | texto | sim | Chave da entidade de denúncia anotada |
| `status` | texto | sim | `new`, `review`, `verified` ou `discarded` |
| `byJournalist` | texto | sim | Endereço declarado de quem anotou |
| `authorName` | texto, opcional | não | Nome ENS declarado |
| `note` | bytes | não | Um byte (o dado útil está nos atributos) |

O estado de uma denúncia é a **última anotação válida**; o envelope nunca muda.

## Regras que fazem parte do modelo de dados
- **Custódia:** `$owner` da denúncia é a redação; `$creator` continua sendo o relayer. O relayer **não consegue apagar nem alterar** depois da transferência (medido na Rabdi, `validation/RESULTADOS.md`, V-01 e V-08).
- **Autenticidade:** uma anotação ou resposta **só vale** se o `$creator` (definido pela cadeia, não forjável) for o administrador (custodiante no ENS) ou o dono de um subnome de jornalista ativo. As demais são ignoradas e contadas. `authorName` é só uma declaração conferida contra o ENS.
- **Retenção:** 150 dias por padrão (`RETENTION_DAYS`). A vida máxima na cadeia é de 7.884.000 blocos (~182,5 dias): sem renovação a entidade some. Qualquer conta pode estender (`permissionlessExtension`); o relayer renova o que vence em até 60 dias.
- **Nada identifica a fonte:** nenhum atributo guarda IP, conta, prova do World ID ou carteira da fonte.

## Consultas usadas
| Consulta | Filtro | Onde |
|---|---|---|
| Caixa de entrada da redação | `newsroom` (+ `category`) em `denuncia` | `listSubmissions` |
| Status | `newsroom` em `anotacao`; ou `denunciaKey` | `listAnnotations`, `latestStatus` |
| Respostas da fonte | `mailboxId` em `resposta` | `getReplies` |
| Prazos | `newsroom` em `denuncia`, comparando `expiresAtBlock` | `listExpiring`, `renewExpiring` |

O Arkiv exige **ao menos um filtro** por consulta e limita a página a 100 itens; o código pagina.

## Como rodar uma consulta
`npm run arkiv:query -- <redacao.eth> [denuncia|anotacao|resposta]` (veja o README, seção Arkiv).
