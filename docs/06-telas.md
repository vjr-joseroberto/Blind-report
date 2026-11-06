# Telas e fluxos (wireframes)

Princípios: poucas telas, texto simples, nenhuma fonte, imagem ou script de terceiros, funciona sem login. Toda tela só liga campos ao cliente correspondente (`source-client`, `newsroom-client`); regra de negócio fica nos clientes. Mensagens de erro dizem a **causa** e o **que fazer**.

Convenções: `[ ]` campo, `( )` opção, `[Botão]`, `⚠` aviso.

## A. App da fonte (`apps/web-source`)

Navegação: três abas fixas no topo: **Enviar** · **Respostas** · **Verificar**. Rodapé sempre visível: `RPC: publicnode… [alterar]`.

### A1. Enviar — passo 1: escolher a redação
```
┌──────────────────────────────────────────────┐
│ Safe Whistle        Enviar | Respostas | Verificar │
├──────────────────────────────────────────────┤
│ Para qual redação?                           │
│ [ investiga.eth                    ] [Buscar]│
│                                              │
│ ⚠ Confira o nome com a redação por outro     │
│   canal. Qualquer um pode criar um nome.     │
└──────────────────────────────────────────────┘
```
Estados: buscando · nome inválido ("use o formato nome.eth em minúsculas") · não encontrada · registros inválidos ("a redação publicou uma configuração incorreta").

### A2. Enviar — passo 2: confirmar a redação e escrever
```
┌──────────────────────────────────────────────┐
│ ✔ investiga.eth        chave v2              │
│   Aceita: saúde, corrupção · até 100 KB      │
│   Anexos: não · Limite: 1 envio por mês      │
├──────────────────────────────────────────────┤
│ Categoria   ( ) saúde  ( ) corrupção         │
│ Texto       [                              ] │
│             [                              ] │
│ Anexo       [Escolher arquivo]  (se aceito)  │
│ Tamanho: 1,2 KB de 100 KB                    │
│                                              │
│ Seu texto é cifrado neste aparelho antes de  │
│ sair. Só a redação consegue abri-lo.         │
│                              [Continuar]     │
└──────────────────────────────────────────────┘
```
Validação em tempo real com `validateSubmission` (categoria, tamanho, anexo).

### A3. Enviar — passo 3: provar que é uma pessoa
```
┌──────────────────────────────────────────────┐
│ Prove que você é uma pessoa real e única.    │
│ Isso não revela quem você é.                 │
│                                              │
│   ┌───────────┐                              │
│   │ link/QR   │  Abra no World App e confirme│
│   └───────────┘  [Copiar link]               │
│ Aguardando confirmação… (expira em 9:40)     │
│                              [Cancelar]      │
└──────────────────────────────────────────────┘
```
O MVP mostra o link da prova; o QR local fica para a Fase 11 (sem serviço externo). Estados: aguardando · negada · expirada · cancelada (todas voltam ao passo 2 com o texto preservado).

### A4. Enviar — passo 4: recibo
```
┌──────────────────────────────────────────────┐
│ ✔ Denúncia enviada                           │
│                                              │
│ ⚠ GUARDE O RECIBO AGORA. Ele é a única forma │
│   de ler respostas e de provar autoria. Não  │
│   guardamos cópia: se perder, perde o acesso.│
│                                              │
│ [Baixar recibo (.json)]  [Copiar]            │
│ ( ) Já guardei o recibo       [Concluir]     │
└──────────────────────────────────────────────┘
```
"Concluir" só habilita após marcar a caixa. O recibo nunca é enviado a servidor.

### A5. Erros do envio (mensagens)
| Código do relayer | Texto |
|---|---|
| `limit_reached` | "Você já enviou para esta redação neste mês. Tente no próximo mês." |
| `stale_key_version` | (automático) "A redação trocou a chave; ciframos de novo." Sem ação do usuário. |
| `proof_rejected` e similares | "A prova não foi aceita. Tente de novo." |
| `epoch_mismatch` | "Virou o mês durante o envio. Tente de novo." |
| `publish_failed` / rede | "Não foi possível enviar agora. Seu texto continua aqui; tente de novo." |

### A6. Respostas
```
┌──────────────────────────────────────────────┐
│ Abra seu recibo para ver as respostas.       │
│ [Escolher recibo (.json)]  ou  [Colar]       │
│                                              │
│ Respostas de investiga.eth                   │
│  • 12/11 14:02  "Recebemos. Podemos falar…"  │
│  • (nenhuma outra)                  [Atualizar]│
└──────────────────────────────────────────────┘
```
Sem recibo, a aba não mostra nada.

### A7. Verificar
```
┌──────────────────────────────────────────────┐
│ Verificar um arquivo divulgado               │
│ Redação [ investiga.eth ]                    │
│ Arquivo [Escolher arquivo (.sw)]             │
│ ✔ Existe no Arkiv desde o bloco 1234 (≈ data)│
│ ✔ O hash confere                             │
│ ─ Provar autoria (opcional)                  │
│ Texto original [          ]  Sal [        ]  │
│ ✔ Você é quem enviou  /  ✖ Não confere       │
└──────────────────────────────────────────────┘
```

### A8. Configuração de rede
Diálogo no rodapé: campo para RPC (https ou localhost), lista dos hosts contatados (RPC, relayer, World). Proxies são recusados. A rede de anonimato (VPN/Tor Browser) é escolha do usuário **fora do app**; o app só avisa isso em uma linha.

## B. Painel da redação (`apps/web-newsroom`) — Fase 13

Entrada pela **carteira** (MetaMask ou outra carteira de navegador). Nenhuma chave privada é digitada. O painel descobre o papel no ENS e mostra abas e ações diferentes.

### B0. Entrada em dois passos
**Passo 1: conectar a carteira.** Só isso: nada de nome de redação.
```
┌──────────────────────────────────────────────┐
│ Entrar com a carteira                        │
│ Chave de acesso do Arkiv  [ ******* ] opcional│
│                         [Conectar carteira]  │
└──────────────────────────────────────────────┘
```
A carteira troca para a Sepolia e assina uma mensagem (sem gás, validade de 5 min, número único). Se não estiver instalada, a tela diz como instalar.

**Passo 2: escolher a redação.**
```
┌──────────────────────────────────────────────┐
│ Qual redação?       carteira 0xdC35…037e     │
│ ┌ Minhas redações ─────────────────────────┐ │
│ │ jornalista1.eth · administrador   [Abrir]│ │
│ │ outra.eth · jornalista (maria)    [Abrir]│ │
│ │ [Atualizar a lista]                      │ │
│ └──────────────────────────────────────────┘ │
│ ┌ Criar uma redação nova ──────────────────┐ │
│ │ [ minharedacao.eth ]        [Continuar]  │ │
│ └──────────────────────────────────────────┘ │
│ ┌ Entrar em outra redação ─────────────────┐ │
│ │ Redação [        ]  Meu nome [maria]     │ │
│ │                            [Entrar]      │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```
- **Minhas redações** junta duas fontes: (1) as que a carteira **administra**, achadas nos eventos do registry do ENS e confirmadas no ENS (têm os registros do Safe Whistle e o custodiante é a carteira); (2) os **nomes lembrados** neste navegador. A busca olha só blocos recentes e pode ficar incompleta; a tela avisa e o campo "Entrar em outra redação" cobre o resto.
- **Criar nova**: se o nome estiver livre, o painel oferece o cadastro (8 transações) e a carteira vira administradora. Uma carteira pode ter várias redações.
- **Jornalista** não aparece na lista automática (o ENS não diz em quais redações uma carteira tem subnome): digita-se o nome da redação e o seu nome; depois ele fica lembrado.
- **Trocar de redação** (botão no topo) volta a este passo sem assinar de novo. Dentro da mesma sessão, as chaves de cada redação aberta continuam **em memória**: ao voltar a ela, nada se perde. **Sair** apaga tudo.
- **Backup obrigatório de fato:** enquanto o administrador tem chaves carregadas e não gerou o backup, todas as abas mostram o aviso "Gere o backup agora", o botão **Sair** pede confirmação e o navegador avisa ao fechar a aba.
- **Exceção de armazenamento:** o navegador guarda, por carteira, apenas os **nomes** das redações abertas (nunca chaves, senhas, recibos nem backups).

### B1. Papéis
| Resultado | Quando | O que aparece |
|---|---|---|
| **Administrador** | A carteira é o custodiante da redação no ENS | Início · Caixa de entrada · Equipe · Chaves e política · Retenção |
| **Jornalista** | A carteira é dona de um subnome ativo (`maria.redacao.eth`) | Caixa de entrada · Minha chave · Retenção |
| **Sem acesso** | Qualquer outro caso | A causa e o que fazer (nome de jornalista, carteira errada, revogado, redação inexistente) |

Se a redação **não existe** no ENS, a tela de "sem acesso" oferece **cadastrar a redação**: quem a cadastra vira o administrador. Trocar de conta na carteira encerra a sessão.

### B2. Início (administrador)
```
 Redação jornalista1.eth                 [Administrador]  [Sair]
 ┌ Primeiros passos ──────────────────────────┐
 │ ✔ Carteira conectada                       │
 │ ○ Carregar as chaves (backup)   ← próximo  │
 │ ○ Gerar e guardar o backup                 │
 │ ○ Cadastrar os jornalistas                 │
 └────────────────────────────────────────────┘
 ⚠ 2 anotações de status ignoradas (autor não é da redação)
 Resumo: chave v2 · 14 denúncias · novas 3 · em análise 5 …
```

### B3. Caixa de entrada (administrador e jornalista)
Lista com filtros, abrir (decifra no navegador), baixar anexo e envelope `.sw`, marcar status, responder à fonte. Vazia, a tela explica como carregar.

### B4. Equipe (administrador)
1. Cadastrar jornalista (nome, endereço, chave de leitura pública): 2 transações.
2. Entregar o chaveiro (texto cifrado para a chave pública dela).
3. Revogar: botão de **duas etapas** que avisa que chaves já entregues continuam abrindo as denúncias antigas.

### B5. Chaves e política (administrador)
Girar a chave (duas etapas), política (categorias, tamanho, anexos, 1 transação), backup com senha (gerar/baixar) e importar backup.

### B6. Minha chave (jornalista)
1. Gerar a chave de leitura (a privada fica só com ela; a pública vai ao administrador).
2. Importar o chaveiro recebido.

### B7. Retenção (administrador e jornalista)
O que vence em 30 dias e renovar tudo (150 dias).

### B8. Transações
Cada ação que usa a carteira mostra, em "Transações enviadas nesta sessão", o link de cada transação no explorador da rede (Etherscan na Sepolia; explorador da Rabdi no Arkiv). Durante o cadastro da redação, a tela mostra "confirme na carteira (n de 8)".

## C. Regras comuns de interface
- Idioma: português; textos curtos; sem jargão ("recibo", não "mailbox").
- Acessibilidade: rótulos em todos os campos, foco visível, contraste alto, funciona só com teclado.
- Sem rastreadores, sem fontes externas, CSP vinda de `cspFor` (política de rede).
- Segredos (chave privada, recibo, sal) nunca vão para `localStorage` sem o usuário pedir; o padrão é memória da aba.
- Verificação visual: lista manual M-01 (Fase 11).
