# Fase 0 — Validação

**Objetivo:** transformar cada dúvida técnica em um **teste de caracterização** que descobre o comportamento real e decide o desenho antes de construir. Cada validação gera um teste marcado `@validation`, que **não roda no CI padrão** (exige acesso externo), mas fica no repositório como documentação executável.

**Esforço:** M. **Pré-requisitos de acesso:** chave de acesso e tGLM da Arkiv, app no World Developer Portal (World ID 4.0), carteira com ETH de Sepolia. Sem esses acessos, as validações V-01 a V-03 ficam pendentes e o desenvolvimento segue com **verificadores simulados**.

**Rede:** só RPCs públicos comuns, o RPC da Rabdi, a API do World e o ENS na Sepolia. **Nada de rede de anonimato.**

## Método
1. Escrever o **teste de caracterização** (o que esperamos observar).
2. Rodar contra o ambiente real e registrar o resultado.
3. Se o resultado contradisser o desenho, **atualizar** `../docs/` e os requisitos **antes** da Fase 1.
4. Guardar o resultado em `validation/RESULTADOS.md`.

## Validações
| ID | Dúvida | Teste de caracterização | Decide |
|---|---|---|---|
| **V-01** | Custo, limite de bytes e comportamento reais na **Rabdi** | Criar entidades de 1 KiB, 64 KiB e ~126 KiB; medir gás; criar e ler por filtro; expirar e estender | Limite de anexo por entidade; custo por denúncia; valor padrão de expiração |
| **V-02** | **Prova real do World ID** e nullifier por ação | Gerar prova no simulador (`environment: staging`); verificar pela API v4; repetir na mesma ação e em outra | Se o portão com `(nullifier, ação)` funciona como suposto; credencial mínima |
| **V-03** | Fluxo **ENS na Sepolia real** | Executar: resolver próprio → registrar nome → texto → delegar → resolver pelo nome; anotar gás e tempo por passo | Tempo de cadastro (commit-reveal de 60 s), custo, ajustes de UX |
| **V-04** | **Subnames:** expiração, revogação e transferência | Registrar subname com expiração curta; revogar; transferir; verificar leitura e escrita depois | Como cadastrar e revogar jornalistas (RF-04 e RF-05) |
| **V-05** | **Rede do cliente:** quais hosts o IDKit contata | **Análise estática por script** do pacote do IDKit instalado: extrair os domínios e esquemas (`https://`, `wss://`) que o código referencia, e classificar quais são necessários | Lista inicial de hosts permitidos da política de rede (RF-20, RNF-04). A confirmação em tempo de execução fica na lista manual M-01 |
| **V-06** | **RPC público:** limites de taxa e estabilidade | Rajada de leituras; medir erros e latência; trocar de RPC | Quantas consultas por tela; estratégia de repetição; RPC padrão e alternativos |
| **V-07** | **Desempenho de cifragem** | Script em Node que cifra e decifra 1 KiB, 100 KiB e 1 MiB e mede o tempo (o libsodium roda sobre o mesmo motor V8 e WebAssembly dos navegadores baseados em Chromium) | Meta de RNF-08. Uma conferência manual em navegador entra na lista M-01 |
| **V-08** | **Redação como custodiante:** a carteira da redação consegue estender e apagar depois do `changeOwnership` | Transferir e executar as operações com a nova dona | Desenho do job de renovação (RF-18) |

Fora do escopo desta fase: Swarm, leitura do ENS dentro de contrato, qualquer rede de anonimato.

**Roteiro do que fazer à mão** (carteiras, torneiras, chave do Arkiv, app do World, decisões): `07-roteiro-manual-fase-0.md`. As validações V-04, V-05, V-06, V-07 e V-08 não dependem de você; V-01, V-02 e V-03 dependem.

## Saídas
- `validation/RESULTADOS.md` com a tabela de resultados.
- Decisões registradas em `../docs/` (se algo mudou).
- Lista final de **dublês** que o desenvolvimento ainda precisará: por exemplo, o verificador do World simulado se V-02 não puder ser feita.

## Critério de pronto
- Todas as validações têm resultado registrado, ou estão marcadas **bloqueadas por acesso** com o dublê correspondente definido.
- Nenhuma decisão de desenho ficou dependendo de suposição não testada.

## Riscos
| Risco | Resposta |
|---|---|
| Faltam acessos (Arkiv, World, ETH de teste) | Prosseguir com dublês; reexecutar as validações quando os acessos chegarem |
| O ENSv2 foi redeployado | Reconferir endereços e ABIs no início; os testes de integração usam fork local |
| O RPC público limita ou cai | Suporte a RPC configurável e repetição com recuo (decidido em V-06) |
