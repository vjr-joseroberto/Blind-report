# CROPS: como o Safe Whistle atende a trilha

CROPS significa **C**ensorship-resistant, **O**pen source, **P**rivate e **S**ecure. A propriedade central do projeto é a **privacidade** de quem denuncia, sem sacrificar as outras três.

## 1. As quatro propriedades

| Propriedade | Como o projeto atende | Evidência |
|---|---|---|
| **Resistente à censura** | O conteúdo e a identidade das redações vivem em redes públicas (ENS e Arkiv). Não há banco de dados central. A fonte lê a redação e as respostas direto da cadeia. O relayer é o único serviço do projeto; ele não pode apagar nem alterar o que publicou, e é possível ter vários | `docs/04-arquitetura-e-dados.md`, `validation/RESULTADOS.md` (V-08) |
| **Código aberto** | Licença MIT; todo o código, testes e documentos estão no repositório | `LICENSE` |
| **Privado** | Cifragem no navegador (libsodium); prova de pessoa única sem identidade; relayer sem log de IP, cabeçalhos, corpo ou prova; caixa de respostas efêmera; nada na cadeia aponta para a fonte | `docs/08-revisao-de-seguranca.md`, teste E2E "RNF-01" |
| **Seguro** | Só libsodium (sem criptografia própria); formatos autenticados; só a redação decifra; autenticidade de anotações e respostas pelo criador na cadeia; política de rede que recusa qualquer endereço não declarado; entrada de administradores e jornalistas por carteira, sem chave digitada | `docs/08-revisao-de-seguranca.md`, `packages/network-policy` |

**O que o projeto não promete:** esconder o endereço de rede (IP) da fonte. Ele fica visível ao relayer, ao RPC e ao World. A proteção de rede é escolha da fonte, fora do aplicativo (VPN ou outra ferramenta). O app não embute nenhuma rede de anonimato. Os limites estão descritos sem rodeios na seção 7 do documento de panorama.

## 2. Endereços de rede contatados (lista declarada)

Tudo que o aplicativo contata está na lista abaixo, e a política de segurança do navegador (CSP) e o `guardedFetch` recusam o resto.

### Tela da fonte (navegador)
| Endereço | Para que | Configurável |
|---|---|---|
| A própria origem do app | Arquivos estáticos (HTML, JS, CSS, `config.json`) | n/a |
| RPC do ENS (padrão `ethereum-sepolia-rpc.publicnode.com`) | Ler a chave pública, a versão e a política da redação | **Sim** (`config.json`) |
| RPC do Arkiv (`rpc.rabdi.db-chain.testnet.arkiv.network`) | Ler respostas e verificar data e integridade | **Sim** |
| Relayer (endereço do serviço) | Pedir o contexto da prova e enviar o envelope cifrado | **Sim** |
| `bridge.worldcoin.org` | Ponte do IDKit, que liga a prova do aplicativo do World à página | Não |

### Painel da redação (navegador)
RPC do ENS e RPC do Arkiv (acima). A **carteira** (MetaMask) usa o RPC dela, que o aplicativo não controla. Os links para exploradores (Etherscan, explorador da Rabdi) só são abertos quando a pessoa clica.

### Relayer (servidor)
RPC do ENS, RPC do Arkiv e `developer.world.org` (verificação da prova).

## 3. Rastreadores de terceiros

- **Nenhum** analytics, fonte externa, script ou imagem de terceiros. O HTML não referencia nenhum endereço externo.
- A **CSP** é gerada da lista de endereços (`cspFor`) e escrita no HTML pelo build; o servidor das telas a envia também como cabeçalho. Sem curingas e sem `unsafe-inline`.
- O IDKit foi usado **sem a interface padrão** (`@worldcoin/idkit-core`), justamente porque o widget carrega fontes de um domínio de terceiros do World.
- **Teste automático:** `apps/*/test/static.test.ts` analisa o HTML e o pacote gerados. O pacote contém endereços padrão de bibliotecas (viem, SDK do Arkiv, IDKit) que **nunca são contatados**: a lista está revisada nos testes, e um endereço novo derruba o teste.
- **Ainda não feito:** a **auditoria em tempo de execução** com um navegador real (aba de rede) para confirmar que o IDKit só contata o que está na lista. É o passo 1 do roteiro manual (`docs/09-roteiro-manual.md`).

## 4. Pontos a esclarecer com a organização
1. Um **RPC público** configurável conta como "serviço de terceiros"? Mitigamos com RPC configurável, endereços declarados e CSP estrita.
2. O fluxo de prova de humanidade **contata servidores do World** (ponte do IDKit e API de verificação). Declaramos isso aqui e no README.

## 5. Demonstração de 3 minutos
1. **(0:00)** O problema, em uma frase: denunciar sem se expor.
2. **(0:20)** O administrador cadastra a redação e mostra as transações no Etherscan.
3. **(0:50)** A fonte busca o nome, escreve e prova que é uma pessoa real. Mostrar a aba de rede: só os endereços declarados.
4. **(1:30)** O envio aparece no Arkiv: hash e data, conteúdo ilegível.
5. **(1:50)** O administrador decifra no painel e responde.
6. **(2:20)** A fonte lê a resposta com o recibo.
7. **(2:40)** Verificação de data e integridade; fechar com o que o sistema **não** promete.
