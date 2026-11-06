# World ID (IDKit): relatório curto

Trilha **Best Use of IDKit**. Este texto responde ao que a trilha pede: credencial verificada no servidor, justificativa da credencial mínima, caminho de sucesso e caminhos alternativos, e o que aprendemos.

## 1. Para que o World ID é usado
Um canal de denúncia anônimo precisa barrar o **spam sem identificar a fonte**. O World ID prova que quem envia é **uma pessoa real e única**, sem revelar quem é. A regra do produto é: **uma denúncia por pessoa, por redação, por mês**.

## 2. Credencial usada e por quê
- **`proofOfHuman`** (humano único), pedida com `IDKit.request({...}).preset(proofOfHuman())` e `allow_legacy_proofs: false`.
- **Credencial mínima:** só precisamos saber que a pessoa é única. Não pedimos idade, nacionalidade nem qualquer outro dado, porque nada disso ajudaria a barrar spam e cada dado a mais aproximaria a prova da identificação.

## 3. Como a prova é usada
1. A tela da fonte pede ao relayer o **contexto da prova** (`GET /rp-context`). O relayer o **assina no servidor** (a chave de assinatura nunca vai ao navegador).
2. A **ação** da prova é `submit:<redação>:<mês>`. O identificador devolvido (*nullifier*) depende da pessoa **e** da ação: a mesma pessoa em outra redação, ou em outro mês, gera outro identificador, e os envios não se ligam.
3. O IDKit entrega a prova; a tela a envia ao relayer junto do envelope cifrado.
4. O relayer **verifica no servidor** (`POST developer.world.org/api/v4/verify/{rp_id}`), conferindo **ambiente**, **ação** e o **identificador**.
5. Guarda só um **hash** do identificador com a ação (para barrar o segundo envio) e **nunca** o grava junto da denúncia.

Código: `packages/worldid-gate` (contexto, verificador, armazém e portão), `packages/source-client/src/idkit.ts` (pedido no navegador) e `apps/relayer` (uso no envio).

## 4. Caminho de sucesso e caminhos alternativos
| Situação | Resultado |
|---|---|
| Prova válida, primeira vez no mês | **Aceita**; a denúncia é publicada |
| Pessoa **nega**, o pedido **expira** ou ela **cancela** | **Nada é enviado**; a tela explica a causa e mantém o texto |
| Segunda denúncia da mesma pessoa à mesma redação no mês | **Recusada** (`limit_reached`), com mensagem clara |
| Prova para **outra ação** ou **outro ambiente** | **Recusada** (`wrong_action`, `wrong_environment`) |
| Prova rejeitada pela API do World | **Recusada** (`proof_rejected`); a reserva é devolvida se a publicação falhar depois |
| Prova de uma redação usada em outra | **Não vale** (a ação é diferente) |

## 5. O que foi validado
- **Prova real no simulador do World (ambiente de teste, identidades falsas):** a primeira prova foi aceita; a de outra redação, também; o segundo envio da mesma pessoa à mesma redação foi **recusado**. O identificador da primeira e da terceira prova é **igual**, e **diferente** do da prova de outra redação (`validation/RESULTADOS.md`, V-02, `validation/out/v02.json`).
- **Testes automáticos:** `packages/worldid-gate` (portão, verificador, armazém, assinatura) e o E2E, que percorre o limite por pessoa com um verificador simulado.

## 6. O que aprendemos
- O **widget padrão** do IDKit carrega fontes de um domínio de terceiros do World, o que atrapalha uma exigência de "sem rastreadores de terceiros" (CROPS). Usamos o pacote **sem interface** (`@worldcoin/idkit-core`) e montamos a tela nós mesmos.
- A **ação** é a peça-chave do desenho: embutir `redação + mês` nela dá o limite certo e impede ligar envios entre redações.
- O pedido precisa ser **assinado no servidor**; assinar no navegador exporia a chave.
- Guardar só o **hash** do identificador basta para barrar repetição e evita acumular um dado ligável.

## 7. Limites
- Tudo foi feito no **ambiente de teste** e no **simulador**; a prova com o aplicativo do World em **produção** não foi validada.
- Abrir o link da prova no aplicativo do World conecta o celular da pessoa aos servidores do World. O World vê que alguém provou ser humano para aquela redação naquele mês, mas não vê o texto.
