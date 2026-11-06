# Arquitetura e modelo de dados

## 1. Arquitetura
```
 FONTE (navegador)                                         REDAÇÃO (navegador)
 ┌─────────────────────────────┐                           ┌───────────────────────────┐
 │ web-source                  │                           │ web-newsroom              │
 │ 1. resolve ENS (RPC)        │                           │ chave privada local       │
 │ 2. cifra (crypto)           │                           │ lista (Arkiv) + decifra   │
 │ 3. prova World ID           │                           │ anota status, responde    │
 │ 4. envia ao relayer         │                           └─────────────▲─────────────┘
 └──────────────┬──────────────┘                                         │ lê / escreve
                ▼                                                        │
        ┌───────────────┐   publica + transfere custódia   ┌─────────────┴────────────┐
        │ relayer       │ ───────────────────────────────► │ Arkiv (testnet)          │
        │ (World ID,    │                                  │ denuncia / resposta /    │
        │  política)    │                                  │ anotacao                 │
        └───────┬───────┘                                  └──────────────────────────┘
                │ lê política
                ▼
        ┌───────────────┐
        │ ENSv2 (Sepolia)│  chave pública, versão, política, jornalistas
        └───────────────┘
```
Todos os acessos de rede passam por `network-policy`, que só permite os hosts declarados (RPC, World, relayer). Não há contrato próprio.

As telas `web-source` e `web-newsroom` são **camadas finas** sobre os clientes sem interface `source-client` e `newsroom-client`, que concentram a lógica (cifragem, ENS, Arkiv, chamadas ao relayer). Isso permite testar todo o fluxo por script, sem navegador (`../planejamento/06-decisao-testes-sem-navegador.md`).

## 2. Modelo de dados no ENS
| Nome | Quem escreve | Registros |
|---|---|---|
| `jornal.eth` | administrador | `url`, `description` |
| `investiga.jornal.eth` | administrador | `denuncia.pubkey`, `denuncia.pubkey.version`, `denuncia.policy`, `denuncia.relayer`; endereço da redação (custodiante) |
| `maria.investiga.jornal.eth` | administrador cria; o jornalista é dono do token | endereço do jornalista; `denuncia.readerkey` |

`denuncia.policy` (JSON): categorias aceitas, tamanho máximo, período do limite (época), aceita anexos.

O **custodiante** das entidades do Arkiv é o endereço da redação lido do ENS (registro de endereço, coinType 60).

## 3. Modelo de dados no Arkiv
**`denuncia`** — publicada pelo relayer, custódia transferida à redação, `readonly`.
| Campo | Tipo | Indexado |
|---|---|---|
| `newsroom` | texto | sim |
| `category` | texto | sim |
| `status` | texto (`new`) | sim |
| `epoch` | u64 | sim |
| `contentHash` | texto (hash do *ciphertext*) | sim |
| `pubkeyVersion` | u64 | não |
| `part` / `parts` | u64 | não (índice e total de partes; anexos grandes são divididos) |
| `envelope` | bytes (envelope cifrado) | não |

**`resposta`** — publicada pela redação: `newsroom` (indexado), `mailboxId` (indexado), `authorName` (opcional: nome ENS de quem respondeu) e `sealed` (bytes). O conteúdo cifrado é `{v:1, newsroom, text}`. **Só vale se o `creator` da entidade (definido pela cadeia) for o administrador ou um jornalista ativo**; `authorName` é uma declaração conferida contra o ENS.
**`anotacao`** — publicada pelo jornalista: `newsroom`, `denunciaKey`, `status` e `byJournalist` (todos indexados) `authorName` (opcional) e um byte de dados. **Só conta se o `creator` da entidade for o administrador ou o dono do subnome `authorName`, ativo no ENS** (as demais são ignoradas e contadas). O estado de uma denúncia é a **última anotação** (o envelope é imutável).

Nada identifica a fonte: o escritor é o relayer e depois o custodiante.

## 4. Envelope
Contém: versão do formato, redação, versão da chave, categoria, chaves de conteúdo embrulhadas (uma por destinatário), `nonce`, *ciphertext* (binário), `contentHash`, `commitment`, chave pública do mailbox, carimbo de tempo do cliente.

Dados autenticados na cifragem: `redação | versão da chave | categoria` (trocar qualquer um invalida a abertura).

## 5. Recibo (só no dispositivo da fonte)
Identificador da entidade, `contentHash`, `salt`, chave pública e privada do mailbox. **Quem tem o recibo tem a caixa de respostas e pode provar autoria.** O sistema não guarda uma cópia.

## 6. Fluxo de custódia e retenção
1. O relayer cria a entidade com os sinalizadores `readonly` **e** `permissionlessExtension` (é o dono temporário e paga o gás).
2. Em seguida transfere a propriedade para o endereço da redação. O relayer passa a **não poder apagar nem alterar**.
3. O **job de renovação** do relayer **estende a expiração** antes do vencimento **sem ser dono** (permitido por `permissionlessExtension`); a redação também pode estender, apagar ou transferir. Sem renovar, a denúncia **some**. Como a vida máxima de uma entidade é de **~182 dias**, a renovação não é opcional: o job deve rodar com folga (por exemplo, renovar tudo o que vence em até 60 dias, pedindo ~150 dias).

Verificado em `validation/RESULTADOS.md` (V-08). O `$creator` continua sendo o relayer; o `$owner` passa a ser a redação.

## 7. Modelo de ameaça (resumo)
| Adversário | Mitigação | Risco residual |
|---|---|---|
| Quem lê o Arkiv | Conteúdo cifrado | Vê **que** houve denúncia, categoria e hora |
| Provedor de RPC | Hosts declarados; RPC configurável | Vê IP e consultas se o usuário não se proteger |
| Operador do relayer | Sem logs de IP; limites de dados | Vê IP e horário no envio |
| Falsa redação / site clonado | Verificação por nome ENS e versão da chave | O usuário precisa conferir o nome |
| Servidor que hospeda o app | App estático, open source, CSP estrita | Cadeia de suprimentos |
| Relayer malicioso apagando denúncias | Transferência de custódia + `readonly` | Janela curta entre criação e transferência |
| Spam | World ID: 1 envio por pessoa×redação×época | Depende da prova real do World |
| Dispositivo comprometido, observador global da rede | — | Fora de escopo |

## 8. Princípios de projeto
- MVP simples: funções pequenas, pouco estado, sem frameworks pesados.
- Fronteiras de rede explícitas e injetáveis (para TDD).
- Aleatoriedade e relógio **injetáveis** (testes determinísticos).
- Falhas explícitas com erros tipados; nada engolido.
- **Sem rede de anonimato** em lugar nenhum (`../GUARDRAILS.md`).
