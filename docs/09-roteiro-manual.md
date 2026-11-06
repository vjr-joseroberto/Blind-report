# Roteiro manual nas testnets (lista M-01)

Objetivo: rodar cada serviço à mão, conectado às **testnets reais**, e conferir cada efeito na blockchain. Sem Docker e sem nós locais. **Sem rede de anonimato**: use a sua rede normal (ou VPN, se quiser, por conta própria).

## 0. Antes de começar
- Pasta: `safe-whistle/`. Rode `npm install` uma vez.
- O `.env` já está validado (carteiras de teste, chave do Arkiv, `app_id`, `rp_id`, chave de assinatura do World). **Nunca cole chaves em chats ou prints.**
- Descubra seus endereços e links: `npm run links` (só imprime endereços públicos).
- Cada terminal abaixo fica aberto enquanto você testa.

## 1. Serviços
| # | Serviço | Para que serve | Como rodar | Onde abrir |
|---|---|---|---|---|
| 1 | **Relayer** | Recebe a denúncia cifrada, confere a prova do World, publica no Arkiv (paga o gás) e entrega a custódia à redação. Renova a retenção | `ALLOWED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173 npm run relayer` (depois de cadastrar a redação, reinicie com `NEWSROOMS=seunome.eth` na frente, para o job de renovação) | `http://127.0.0.1:8787/health` deve responder `{"ok":true}` |
| 2 | **Painel da redação** | Cadastra a redação no ENS, gera a chave, lista e decifra denúncias, muda status, responde, cadastra jornalistas, renova retenção | `npm run web:newsroom` | `http://127.0.0.1:5174` |
| 3 | **Tela da fonte** | Consulta a redação, cifra, prova que é humano (World ID), envia, guarda o recibo, lê respostas e verifica arquivos | `npm run web:source` | `http://127.0.0.1:5173` |
| 4 | **Simulador do World** | Faz o papel do World App no ambiente `staging` | Navegador, sem instalar nada | https://simulator.worldcoin.org/ |

Ordem: 1 → 2 → 3. Os três usam as testnets: **Sepolia** (ENS), **Arkiv Rabdi** (denúncias) e **World `staging`** (prova).

## 2. Onde ver cada coisa na blockchain
| Tecnologia | O que mostra | Link |
|---|---|---|
| **Sepolia (ENS)** | Transações do cadastro, da chave, dos jornalistas e das rotações | https://sepolia.etherscan.io — busque o endereço do administrador (`npm run links`) ou `/tx/<hash>` |
| **Arkiv Rabdi** | Entidades de denúncia, resposta e anotação; custódia transferida | https://rabdi.explorer.arkiv.network — busque o endereço do relayer (cria) e do administrador (anota, responde). *O caminho `/address/<endereço>` é o padrão desse tipo de explorador; não foi conferido* |
| **Chave de acesso e saldo do Arkiv** | Hub do Arkiv | https://hub.arkiv.network |
| **World ID** | Aplicativo, `app_id` e `rp_id` | https://developer.world.org (docs: https://docs.world.org). **A prova do World é verificada pela API, não na blockchain**: não há transação para ver |
| **Nome ENS** | Resolução do nome | https://sepolia.app.ens.domains/seunome.eth *(pode não exibir nomes do ENSv2)*; a prova segura é ler os registros pelo painel/Etherscan |

## 3. Passo a passo e o que conferir
| Passo | Ação | O que acontece | Conferir na blockchain |
|---|---|---|---|
| 1 | Suba o relayer (serviço 1) | Lê o `.env`, valida a configuração e escuta em `:8787` | `curl http://127.0.0.1:8787/health` → `{"ok":true}`; nenhuma transação ainda |
| 2 | Painel (serviço 2): **Entrar** com a chave da carteira OWNER (copie do `.env` localmente) e a chave do Arkiv | Fica só em memória | — |
| 3 | **Configuração → Cadastrar redação** (nome único, ex.: `sw-<suas iniciais>-<número>`; categorias; tamanho) | 8 transações em ~4 min (Deploy Proxy do resolver, Commit, Mint, Approve, Register, Multicall dos registros, Deploy Proxy do registry, Set Subregistry) | Etherscan, endereço OWNER: as transações aparecem uma a uma. Ao final, `seunome.eth` registrado e os registros `denuncia.pubkey`, `.pubkey.version`, `.policy` |
| 4 | **Gerar backup** (senha ≥ 8) e baixe | Chaves privadas protegidas por senha | — (guarde o arquivo) |
| 5 | Reinicie o relayer com `NEWSROOMS=seunome.eth` na frente do comando | O job de renovação passa a cobrir a redação | — |
| 6 | Fonte (serviço 3): **Buscar** `seunome.eth` | Lê chave, versão e política no ENS | Compare a versão e a política com os registros no Etherscan |
| 7 | Escreva, escolha a categoria, **Continuar** | Cifra no navegador; abre o pedido de prova | — |
| 8 | Copie o link da prova e cole em https://simulator.worldcoin.org/ (serviço 4); aprove | O relayer confere a prova na API do World | Nada on-chain. Veja `{"route":"POST /submissions","status":201}` no log do relayer |
| 9 | **Guarde o recibo** (baixar) e marque a caixa | O recibo só existe no seu aparelho | Explorador do Arkiv, endereço do **relayer**: apareceu a transação de criação da entidade e a de **transferência de propriedade** para o OWNER. O conteúdo é **ilegível** (cifrado) |
| 10 | Envie de novo com a mesma identidade do simulador | Recusado: "Você já enviou para esta redação neste mês" | Nenhuma transação nova no Arkiv |
| 11 | Painel → **Caixa de entrada → Atualizar → Abrir** | Decifra no navegador | O texto bate com o que você escreveu; no Arkiv só há bytes cifrados |
| 12 | **Marcar: em análise** | Cria uma entidade de anotação | Arkiv, endereço OWNER: nova transação; a entidade da denúncia **não mudou** |
| 13 | **Enviar resposta** | Cria uma entidade de resposta cifrada para a caixa da fonte | Arkiv, endereço OWNER: nova transação |
| 14 | Fonte → **Respostas**: carregue o recibo | Lê e decifra a resposta | A resposta só abre com o seu recibo |
| 15 | Painel → **Baixar envelope (.sw)**; Fonte → **Verificar**: informe a redação e o arquivo | "O hash confere" e "Existe no Arkiv desde o bloco N" | Procure o bloco N no explorador do Arkiv. Para provar autoria: cole o recibo e o texto original |
| 16 | Painel → **Equipe**: gere a chave de leitura, cadastre `maria` com o endereço JOURNALIST, gere o chaveiro | Subname `maria.seunome.eth` no ENS | Etherscan, OWNER: transações de `register` e `setText` |
| 17 | Painel → **Girar a chave** | Publica versão 2 no ENS | Etherscan, OWNER: transação com `denuncia.pubkey.version = 2`. Denúncias antigas continuam abrindo |
| 18 | Painel → **Retenção → Ver o que vence em 30 dias** | Lista (vazia agora) | Aviso: a vida máxima é ~182 dias |

## 4. Se algo falhar
| Sintoma | Causa provável |
|---|---|
| A tela da fonte mostra "Não foi possível iniciar" | O `config.json` do `dist` está inválido, ou você abriu o arquivo sem servidor. Use `npm run web:source` |
| Console do navegador mostra "violates Content Security Policy" | O app tentou um host fora da lista. **Anote o host**: é exatamente o que a M-01 procura |
| Erro "Sem conexão com o servidor de envio" | Relayer parado, ou a origem não está em `ALLOWED_ORIGINS` (use `127.0.0.1` ou `localhost` conforme a URL aberta) |
| Cadastro da redação falha com "nome não disponível" | Escolha outro nome (os nomes `.eth` da Sepolia são globais) |
| Erro de saldo no cadastro | Faltou ETH de teste na carteira OWNER (a Sepolia precisa de ~0,01 ETH para as 8 transações) |
| Leitura do Arkiv lenta ou recusada nas abas Respostas/Verificar | Sem chave de acesso o endpoint público da Rabdi tem limite de taxa; tente de novo em instantes |
| Limite atingido ao testar de novo | Apague `data/claims.jsonl` (armazém local de provas) e reinicie o relayer, ou use outra identidade no simulador |

## 5. Registro do resultado
Anote em `validation/RESULTADOS.md` (seção M-01): data, navegador, cada passo (✓/✗), hosts vistos na aba de rede, tempo percebido para cifrar ~100 KiB e as mensagens de erro lidas (prova negada, limite atingido, nome inexistente). Se algum host de terceiros aparecer, **pare e me avise**.


---

# Roteiro M-02: painel da redação com a MetaMask (Fase 13)

O painel da redação **não pede mais chave privada**: você entra com a carteira. As carteiras de teste mantêm os papéis: **OWNER = administrador** e **JOURNALIST = jornalista**.

## Preparação (uma vez)
1. Instale a MetaMask no navegador.
2. **Importe as chaves de teste na MetaMask** (Contas → Importar conta), copiando-as do `.env` localmente: `OWNER_PRIVATE_KEY` e `JOURNALIST_PRIVATE_KEY`. Só testnet, carteiras sem dinheiro real. Dê nomes às contas (Administrador, Jornalista) e crie uma terceira conta vazia (Estranha).
3. A rede **Sepolia** já existe na MetaMask (ative "mostrar redes de teste"). A rede **Rabdi** (Arkiv) a tela pede para adicionar na primeira ação do Arkiv: confirme. Ela usa a chave de acesso do Arkiv que você informar na entrada; sem chave, o endpoint público tem limite de taxa. Dados da rede: id 7794095, moeda tGLM, explorador https://rabdi.explorer.arkiv.network.
4. Suba `npm run web:newsroom` (e, para o fluxo completo, relayer e tela da fonte).

## Passos
| # | Ação | Resultado esperado |
|---|---|---|
| 1 | Selecione a conta **Administrador**, abra `http://127.0.0.1:5174` e clique em **Conectar carteira** | A MetaMask pede conexão, troca para Sepolia e pede para **assinar** (sem gás). A tela seguinte é "Qual redação?" |
| 1b | Em **Minhas redações**, abra a sua (ou digite `jornalista1.eth` e clique em Entrar; para uma nova, use **Criar uma redação nova**) | Entra como **Administrador** com as abas Início, Caixa de entrada, Equipe, Chaves e política, Retenção. A lista vem dos eventos da blockchain e pode estar incompleta; se faltar algo, digite o nome |
| 2 | Aba **Chaves e política** → importe o backup (ou, se a redação ainda não existe, a tela oferece cadastrá-la) | Chaves carregadas; o guia de primeiros passos avança. Se cadastrar: a MetaMask pede 8 confirmações e a tela mostra "n de 8" |
| 3 | Confira em **Transações enviadas** | Cada hash vira um link para o Etherscan: abra e confirme na blockchain |
| 4 | Aba **Equipe**: cadastre o jornalista (nome, endereço da conta Jornalista e a chave de leitura pública que ele gerou) | 2 transações (`register` e `setText`) com links; gere o chaveiro e entregue |
| 5 | Selecione a conta **Jornalista** na MetaMask. O painel avisa que a conta mudou e encerra a sessão | Conecte de novo e, em **Entrar em outra redação**, informe a redação e o **nome** de jornalista (ex.: `maria`): entra como **Jornalista** com as abas Caixa de entrada, Minha chave, Retenção. **Não** aparecem Equipe nem Chaves e política |
| 6 | **Minha chave**: gere a chave de leitura (se ainda não gerou) e importe o chaveiro | Caixa de entrada passa a abrir as denúncias |
| 7 | Marque um status e responda a uma denúncia | A MetaMask pede para adicionar/trocar para a Rabdi e confirmar; a transação aparece no explorador do Arkiv **com o endereço do jornalista** |
| 8 | Na tela da fonte, abra Respostas com o recibo | A resposta aparece com o nome do jornalista; nenhuma "ignorada" |
| 9 | Selecione a conta **Estranha**, conecte e digite a redação | Entra como **Sem acesso** com a causa ("informe o seu nome de jornalista") |
| 10 | Com a conta Estranha, informe `maria` | "pertence a outra carteira" |
| 11 | Tente anotar/responder com a conta Estranha (script ou explorador) | O painel mostra "N anotação(ões) ignorada(s)" e a tela da fonte, "N resposta(s) ignorada(s)" |
| 12 | Como administrador, revogue `maria` (botão de duas etapas) | 2 transações; o que a Maria anotou/respondeu deixa de valer; o painel recomenda girar a chave |

## O que anotar
Se a MetaMask recusar a rede do Arkiv, se o Arkiv não assinar, se o gas não for estimado ou qualquer erro: copie a mensagem exata. Esse é o ponto do B0 que só a MetaMask real responde. Registre o resultado em `validation/RESULTADOS.md` (seção M-02).
