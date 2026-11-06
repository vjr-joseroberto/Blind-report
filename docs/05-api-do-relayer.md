# API do relayer

Serviço HTTP em `apps/relayer`. É o único componente que escreve no Arkiv em nome da fonte. **Não registra IP, cabeçalhos, corpo, prova nem identificadores**: o log tem só a rota, o status e um código.

## Como rodar
```bash
# da raiz do repositório, com o .env preenchido (variáveis abaixo)
node --env-file=.env --import tsx apps/relayer/src/main.ts
```
Ao subir, o relayer valida a configuração (erros listam só **nomes** de variáveis), abre o servidor e executa o job de renovação, repetindo-o a cada 6 horas.

## Configuração (variáveis de ambiente)
| Variável | Obrigatória | Padrão | Observação |
|---|---|---|---|
| `RELAYER_PRIVATE_KEY` | sim | — | Carteira que paga o gás no Arkiv (**segredo**) |
| `RP_SIGNING_KEY` | sim | — | Chave de assinatura do World (**segredo**) |
| `WORLD_APP_ID`, `WORLD_RP_ID` | sim | — | `app_…` e `rp_…` |
| `WORLD_ENVIRONMENT` | não | `staging` | `staging` ou `production` |
| `SEPOLIA_RPC_URL`, `ARKIV_RPC_URL` | sim | — | https, ou http só em localhost |
| `ARKIV_ACCESS_KEY` | não | — | Chave do Hub do Arkiv (**segredo**) |
| `NEWSROOMS` | não | vazio | Redações cuja retenção o job renova (`a.eth,b.eth`) |
| `ALLOWED_ORIGINS` | não | vazio | Origens exatas do front-end (CORS). **Nunca curinga** |
| `RETENTION_DAYS` | não | 150 | Máximo ~182 (vida máxima na cadeia) |
| `RENEW_WITHIN_DAYS` | não | 60 | O job renova o que vence em até este prazo |
| `PORT`, `HOST` | não | 8787, 127.0.0.1 | |
| `MAX_BODY_BYTES` | não | 1 MiB | Corpo maior recebe 413 |
| `RATE_LIMIT_PER_MINUTE` | não | 120 | Limite **global** (sem IP). Excedente recebe 429 com `retry-after` |
| `SIMULATE_WORLD` | não | 0 | `1` aprova qualquer prova. **Só testes locais**: a configuração é recusada se algum RPC não for localhost |
| `NULLIFIER_FILE` | não | `data/claims.jsonl` | Armazém dos hashes de provas usadas |

A política de rede é montada a partir desta configuração: só os hosts dos dois RPCs e `developer.world.org` são contatados.

## Endpoints

### `GET /health`
`200 {"ok":true}`

### `GET /rp-context?newsroom=<nome>.eth`
Devolve o necessário para abrir o IDKit na ação da época corrente. A assinatura é feita no servidor.
```json
{ "app_id": "app_…", "environment": "staging", "epoch": 202611, "action": "submit:investiga.eth:202611",
  "rp_context": { "rp_id": "rp_…", "nonce": "0x…", "created_at": 1, "expires_at": 301, "signature": "0x…" } }
```
Erros: `400 invalid_newsroom`, `404 newsroom_not_found`, `422 newsroom_misconfigured`.

### `POST /submissions`
Corpo JSON:
```json
{ "newsroom": "investiga.eth", "epoch": 202611, "category": "saude", "hasAttachment": false,
  "proof": { "…": "resultado do IDKit" }, "envelope": "<envelope binário em base64url>" }
```
Resposta `201 {"key":"0x…","parts":1}`.

**Ordem das verificações** (as baratas primeiro; a API do World só é chamada depois de todas): tamanho do corpo → campos → época corrente → política no ENS → envelope (formato, hash do conteúdo, redação e categoria, versão da chave) → política da redação (categoria, tamanho, anexos) → **prova do World** → publicação no Arkiv.

Se a publicação falha, a reserva da prova é devolvida e a pessoa pode tentar de novo.

### Erros
Formato: `{"error":{"code":"…","message":"…"}}`.
| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_json`, `invalid_request`, `invalid_newsroom`, `invalid_nullifier` | Entrada malformada |
| 403 | `proof_rejected`, `wrong_action`, `wrong_environment`, `nullifier_mismatch` | Prova inválida ou de outra ação/ambiente |
| 404 | `newsroom_not_found`, `not_found` | Redação ou rota inexistente |
| 405 | `method_not_allowed` | Método errado |
| 409 | `limit_reached` | A pessoa já enviou para esta redação nesta época |
| 409 | `epoch_mismatch` | A época informada não é a corrente |
| 409 | `stale_key_version` | A chave da redação mudou. Traz `currentVersion`: cifre de novo com a chave atual |
| 429 | `rate_limited` | Limite global de requisições por minuto |
| 413 | `body_too_large` | Corpo acima do máximo |
| 422 | `invalid_envelope`, `envelope_mismatch` | Envelope inválido ou de outra redação/categoria |
| 422 | `category_not_allowed`, `too_large`, `attachments_not_allowed`, `invalid_size` | Fora da política da redação |
| 422 | `newsroom_misconfigured` | A redação publicou registros inválidos no ENS |
| 502 | `publish_failed` | Falha ao publicar; sem detalhes internos |
| 500 | `internal` | Erro inesperado; sem detalhes |

## Segurança e privacidade
- **CORS:** só origens listadas em `ALLOWED_ORIGINS`, comparadas por igualdade exata. Curinga nunca é aceito.
- **Cabeçalhos:** todas as respostas levam `cache-control: no-store` e `x-content-type-options: nosniff`.
- **Sem log de IP nem de corpo:** testado (o teste procura o IP, o corpo e o nullifier em todos os registros).
- **Respostas de sucesso** não trazem prova nem identificadores.
- **Segredos:** nunca aparecem em mensagens de erro de configuração; `redact` os esconde.

## Job de renovação
A cada 6 horas, para cada redação em `NEWSROOMS`, renova as denúncias que vencem em até `RENEW_WITHIN_DAYS`, pedindo `RETENTION_DAYS`. Em falha de rede, repete até 4 vezes com recuo exponencial (1 s, 2 s, 4 s); se esgotar, registra o erro (sem detalhes) e segue para a próxima redação. Funciona porque o relayer cria as entidades com extensão livre e **não consegue apagá-las** depois de transferi-las.
