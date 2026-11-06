# Roteiro manual — Fase 0

O que **você** precisa fazer à mão para destravar a validação, e o que eu faço sozinho. Complementa `02-fase-0-validacao.md`.

## 1. Minha avaliação do seu plano
**Validar a Fase 0 antes de fechar o desenho: concordo.** Mas **não espere a Fase 0 inteira para começar a programar.** Separei assim:

| Parte | Pode começar já? | Por quê |
|---|---|---|
| Fases 1 a 3 (esqueleto, política de rede, `core`, `crypto`) | **Sim, em paralelo** | Não dependem de nenhuma validação nem de acesso externo |
| Fases 4 a 7 (ENS, Arkiv, World ID, relayer) | **Depois das validações** que as afetam | São as bordas onde a realidade pode mudar o desenho |

As validações com mais chance de mudar o desenho são, em ordem:
1. **V-02 (prova real do World ID):** o anti-spam inteiro assume que o `nullifier` é diferente por ação. Se não for, a regra RN-01 e o `worldid-gate` mudam.
2. **V-01 (Arkiv na Rabdi):** custo por denúncia e limite de bytes reais podem diferir do nó local.
3. **V-03 (ENS na Sepolia real):** o fluxo foi validado em fork; a rede real pode ter tempo e custo diferentes.

## 2. O que eu faço sem você
Não precisam de conta, carteira nem ETH. Posso rodar assim que você disser:

| Validação | Como | Onde |
|---|---|---|
| **V-04** Subnames: expiração, revogação, transferência | Contra o fork local da Sepolia | Docker |
| **V-08** Redação como custodiante (`changeOwnership`) | Contra o nó Arkiv local | Docker |
| **V-05** Hosts que o IDKit contata | Análise estática do pacote instalado | Local |
| **V-06** Limites do RPC público | Rajada de leituras em RPC público comum | Rede comum |
| **V-07** Desempenho de cifragem | Script em Node | Local |

## 3. O que depende de você
Cada item tem tempo estimado, passos, "como saber que deu certo" e o que me trazer.

### M-1. Carteiras de teste (≈ 10 min)
Preciso de **três carteiras novas, só para teste, nunca usadas com dinheiro real**:
- `owner` — administrador da redação (registra o nome `.eth` e publica a chave);
- `relayer` — publica as denúncias no Arkiv;
- `journalist` — jornalista de teste.

**Passos**
1. Gere as chaves **localmente**, sem colar em nenhum site: na pasta `POC-ENS`, rode  
   `node --input-type=module -e "import {generatePrivateKey as g, privateKeyToAccount as a} from 'viem/accounts'; for (const n of ['owner','relayer','journalist']) { const k=g(); console.log(n, a(k).address, k) }"`
2. Guarde as chaves **só em um arquivo `.env` local** (seção 4) e anote os **endereços** (os endereços são públicos).

**Como saber que deu certo:** você tem 3 endereços e 3 chaves em um `.env` fora do git.
**O que me trazer:** apenas os **3 endereços**. **Nunca** cole chaves privadas nem frases-semente no chat.

### M-2. ETH de Sepolia (≈ 10 a 60 min, depende do limite das torneiras)
Para o `owner` (cadastro do nome, resolver, textos) e um pouco para o `journalist`.

**Quanto:** ~0,05 ETH no `owner`; ~0,01 ETH no `journalist`.
**Torneiras sugeridas** (a disponibilidade e os limites variam): Google Cloud Web3 Faucet (Sepolia), `faucets.chain.link/sepolia`, torneira por mineração no navegador `sepolia-faucet.pk910.de`. Cuidado com sites falsos: não conecte carteira pessoal nem informe frase-semente.

**Como saber que deu certo:** os saldos aparecem em um explorador da Sepolia ou ao consultar o RPC.
**O que me trazer:** a confirmação de que os saldos chegaram.
**Destrava:** V-03.

### M-3. Arkiv: chave de acesso e tGLM (≈ 15 a 30 min)
**Passos**
1. Em `hub.arkiv.network/access-keys`, conecte a carteira **`relayer`** e **assine a mensagem de login** (a assinatura prova a posse da carteira e **não** envia transação).
2. Complete o cadastro se o Hub pedir: escolha a rede **Rabdi**, dê um nome ao projeto e resolva o captcha; clique em gerar.
3. Em `hub.arkiv.network/faucet`, peça **tGLM** para o `relayer` e também para o `owner` (a redação precisa de gás para estender ou apagar as entidades que receber).

**Como saber que deu certo:** o Hub mostra a chave; o saldo de tGLM aparece nas duas carteiras.
**O que me trazer:** a **chave de acesso** em `ARKIV_ACCESS_KEY` no `.env` (segredo, não colar no chat) e a confirmação dos saldos. Anote também o valor de tGLM que a torneira entregou.
**Destrava:** V-01.
**Observação:** é uma chave por carteira por rede; ela tem cota mensal.

### M-4. World ID: app no Developer Portal (≈ 30 a 60 min; é o passo mais incerto)
**Passos**
1. Crie uma conta e um **app** no Developer Portal do World.
2. Garanta que o app esteja na versão **World ID 4.0** (a API respondeu "app não migrado" para um identificador de teste).
3. Crie uma **ação** para o fluxo, por exemplo `submit:teste:202611`, e uma **chave de assinatura** do app.
4. Para gerar provas sem celular, use o **simulador** (`simulator.worldcoin.org`) com o ambiente `staging`.

**Os nomes exatos das telas podem variar:** se algo não bater, me diga o que aparece e eu ajusto.

**Como saber que deu certo:** você tem `app_id`, `rp_id` e a chave de assinatura, e consegue abrir o simulador.
**O que me trazer:** `app_id` e `rp_id` (identificadores, não são segredo) e a **chave de assinatura** como `RP_SIGNING_KEY` no `.env` (segredo).
**Destrava:** V-02 (a mais importante).

### M-5. Decisões pequenas (≈ 10 min)
| Decisão | Minha sugestão | Você decide |
|---|---|---|
| **Época** do limite de uma denúncia por pessoa | Mensal | ☐ |
| **RPC público padrão** para a Sepolia | Um RPC comum e estável (V-06 vai medi-lo) | ☐ |
| **Licença** open source | MIT ou Apache-2.0 | ☐ |
| **Repositório próprio** para o `safe-whistle` | Criar um repositório novo (privado até o fim) | ☐ |

**O que me trazer:** as quatro respostas.

### M-6. Ambiente local (≈ 5 min)
Confirmar que o **Docker está rodando** (`docker ps`) e que há espaço em disco para as imagens (anvil e nó Arkiv). Não precisa mais nada.

## 4. Onde guardar segredos
- O arquivo é **`safe-whistle/.env`** (já criado, permissão 600, **fora do git**). O modelo com todas as variáveis está em `.env.example`. As três carteiras de teste já foram geradas; falta você preencher `ARKIV_ACCESS_KEY`, `WORLD_APP_ID`, `WORLD_RP_ID` e `RP_SIGNING_KEY`.
- O `safe-whistle` agora tem **repositório git próprio** (`safe-whistle/.git`), que será o do GitHub. O `.env` está no `.gitignore`: confira com `git check-ignore -v .env` antes de qualquer commit. A pasta também fica dentro do repositório maior `projetos`; não adicione `safe-whistle/` a ele.
- **Nada de segredo no chat.** Eu leio as variáveis do ambiente quando rodo os scripts.
- Só testnet, só carteiras novas. Sem Tor nem redes de anonimato (`../GUARDRAILS.md`).

## 5. Ordem sugerida
```
Você:  M-5 (decisões) ─► M-1 (carteiras) ─► M-2 (ETH) ──┐
                                      └──► M-3 (Arkiv) ─┼─► M-4 (World ID)
Eu:    V-04, V-05, V-06, V-07, V-08 (sem você) ─────────┘
       Fases 1, 2, 3 em paralelo (esqueleto, core, crypto)
```
1. **Agora:** M-5 e M-1. Em paralelo eu rodo V-04, V-05, V-06, V-07 e V-08 e começo as Fases 1 a 3.
2. **Depois:** M-2 e M-3 (as torneiras podem demorar, então peça cedo).
3. **Por último:** M-4, que é o mais incerto; comece cedo se puder, porque V-02 pesa mais.

## 6. Quando a Fase 0 está concluída
- V-01 a V-08 têm resultado registrado em `validation/RESULTADOS.md`, ou estão **marcadas como bloqueadas por acesso**, com o dublê definido.
- As decisões de M-5 estão tomadas.
- Se algum resultado contradiz o desenho (por exemplo, nullifier não é por ação), **atualizo `docs/` e `01-requisitos.md` antes** de iniciar as Fases 4 a 7.

## 7. Se um acesso não sair
| Bloqueio | Consequência | Plano |
|---|---|---|
| Sem tGLM ou chave do Arkiv | V-01 pendente | Seguir com o nó local; reservar a validação e a revisão do limite de bytes e do custo |
| Sem app no World | V-02 pendente | Seguir com o verificador simulado; reexecutar V-02 quando houver acesso e revisar o `worldid-gate` |
| Sem ETH de Sepolia | V-03 pendente | Seguir com o fork local; V-03 vira a primeira tarefa quando houver ETH |
