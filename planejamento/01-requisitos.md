# Requisitos da aplicação

Referências: casos de uso em `../docs/01-caso-de-uso.md`; componentes em `../docs/03-componentes.md`.

## 1. Restrições do projeto
| ID | Restrição |
|---|---|
| RC-01 | **Sem Tor nem redes de anonimato** (nem código, testes, dependências, configuração ou comandos). Ver `../GUARDRAILS.md` |
| RC-02 | O MVP usa um **RPC público** comum, configurável pelo usuário |
| RC-03 | Somente dados de teste fictícios |
| RC-04 | Sem contrato próprio; usa apenas os contratos do ENSv2 |
| RC-05 | Redes de teste: Sepolia (ENS) e Rabdi (Arkiv) |
| RC-06 | Código simples de MVP, desenvolvido com **TDD** |
| RC-07 | Monorepo em TypeScript |
| RC-08 | **Todos os testes são scripts executados em Node, sem navegador** (nada de Playwright, Selenium ou similar). Por isso a lógica dos front-ends fica em clientes sem interface (`source-client`, `newsroom-client`) |

## 2. Requisitos funcionais
Prioridade: **M** = obrigatório no MVP, **S** = desejável, **C** = pode ficar para depois.

| ID | Requisito | UC | Prior. | Componente |
|---|---|---|---|---|
| RF-01 | Registrar uma redação: criar o resolver próprio e registrar o nome `.eth` apontando para ele | UC-01 | M | ens-client, web-newsroom |
| RF-02 | Publicar e ler no ENS a chave pública, a versão da chave, a política e o relayer da redação | UC-02, 05 | M | ens-client |
| RF-03 | Rotacionar a chave pública incrementando a versão | UC-02 | S | ens-client |
| RF-04 | Cadastrar jornalista como subname com chave de leitura | UC-03 | M | ens-client |
| RF-05 | Revogar jornalista e impedir que receba novas denúncias | UC-04 | S | ens-client |
| RF-06 | Resolver o nome da redação e mostrar nome verificado, versão da chave e política | UC-05 | M | ens-client, web-source |
| RF-07 | Cifrar a denúncia no cliente (envelope com chave de conteúdo embrulhada) | UC-06 | M | crypto |
| RF-08 | Gerar o mailbox e o recibo local da fonte | UC-06 | M | crypto, web-source |
| RF-09 | Exigir prova de humano único e limitar a uma denúncia por pessoa por redação por época | UC-06 | M | worldid-gate, relayer |
| RF-10 | Publicar a denúncia no Arkiv por meio do relayer | UC-06 | M | relayer, arkiv-store |
| RF-11 | Transferir a custódia da entidade à redação e marcá-la `readonly` | UC-06, 13 | M | arkiv-store, relayer |
| RF-12 | Listar denúncias por redação, status e categoria | UC-07 | M | arkiv-store, web-newsroom |
| RF-13 | Decifrar a denúncia no navegador do jornalista | UC-07 | M | crypto, web-newsroom |
| RF-14 | Registrar o status de uma denúncia em entidade de anotação | UC-08 | S | arkiv-store |
| RF-15 | Responder a uma fonte pelo mailbox e permitir que ela leia a resposta | UC-09, 10 | M | crypto, arkiv-store |
| RF-16 | Verificar data e integridade de um arquivo divulgado | UC-11 | S | crypto, arkiv-store, web-source |
| RF-17 | Provar autoria revelando texto e `salt` | UC-12 | C | crypto, web-source |
| RF-18 | Renovar a expiração das denúncias retidas | UC-13 | S | arkiv-store, relayer |
| RF-19 | Dividir anexos acima do limite de uma entidade em partes e remontá-los | UC-06, 07 | S | core, arkiv-store |
| RF-20 | Configurar o RPC e aplicar a política de hosts permitidos | UC-14 | M | network-policy |
| RF-21 | Aplicar a política da redação (categorias, tamanho, época) no envio | UC-06 | M | core, relayer |

## 3. Requisitos não funcionais
| ID | Categoria | Requisito | Verificação |
|---|---|---|---|
| RNF-01 | Sigilo | Nenhuma chave privada nem texto original sai do dispositivo do usuário | Teste por script com o **gravador de requisições** (`fetch` injetado nos clientes e no relayer): confirma ausência de texto original e de chaves privadas em todo corpo enviado |
| RNF-02 | Privacidade | Nenhum atributo gravado identifica a fonte; só o hash de `(nullifier, ação)` é guardado | Teste de esquema e de armazenamento do portão |
| RNF-03 | Integridade | Trocar redação, versão da chave ou categoria invalida a abertura do envelope | Teste unitário e por propriedades |
| RNF-04 | Terceiros | O cliente não carrega rastreadores nem scripts ou fontes de terceiros; contata só hosts declarados | Gravador de requisições nos testes por script; análise estática do HTML e do pacote gerados (sem hosts de terceiros); teste da CSP gerada; **lista de verificação manual M-01** antes do lançamento (`06-decisao-testes-sem-navegador.md`) |
| RNF-05 | **Guardrail de rede** | Nenhum código, dependência, teste ou configuração usa Tor, Nym, Nox, I2P, Lokinet, SOCKS de anonimato ou Anon-RPC | `npm run guardrails`, teste de dependências, política de rede em execução |
| RNF-06 | Testabilidade | Desenvolvimento com TDD; cobertura de linhas ≥ 90% em `core` e `crypto`, ≥ 80% nos demais | Relatório de cobertura no CI |
| RNF-07 | Simplicidade | Funções pequenas, sem framework pesado, sem abstração antes da necessidade | Revisão e lint |
| RNF-08 | Desempenho | Cifrar 100 KiB em menos de 100 ms; envio ponta a ponta em até 15 s na rede de teste | Teste de desempenho por script em Node (**meta a validar na Fase 0**); conferência manual opcional em navegador na lista M-01 |
| RNF-09 | Usabilidade | Recibo exportável; mensagens de erro que dizem a causa e o que fazer | Testes dos clientes (erros com causa legível e recibo exportável e restaurável); revisão manual da tela na lista M-01 |
| RNF-10 | Portabilidade de rede | Funciona sobre qualquer rede e com RPC configurável | Teste com RPC substituível |
| RNF-11 | Observabilidade | O relayer não registra IP nem corpo de requisição | Teste que inspeciona os logs |
| RNF-12 | Código aberto | Licença open source (a definir) | Arquivo de licença no repositório |
| RNF-13 | Determinismo | Relógio e aleatoriedade injetáveis nos módulos de lógica | Testes sem dependência de hora real |

## 4. Regras de negócio
| ID | Regra |
|---|---|
| RN-01 | Uma pessoa envia no máximo uma denúncia por redação por época; a ação da prova é `submit:<redação>:<época>` |
| RN-02 | Só o administrador grava `denuncia.*` no resolver da redação |
| RN-03 | Cada redação tem seu próprio resolver |
| RN-04 | O envelope carrega a versão da chave com que foi cifrado; a redação preserva as chaves antigas |
| RN-05 | A prova de humanidade nunca é gravada junto com o conteúdo |
| RN-06 | A denúncia que expira sem renovação é perdida; a redação ou o job a renova. **A vida máxima de uma entidade na cadeia é de ~182 dias (7.884.000 blocos)**, então a renovação é obrigatória e periódica (no máximo a cada ~180 dias; a loja limita o pedido a 1 hora abaixo do teto) |
| RN-07 | O relayer transfere a custódia à redação imediatamente após criar a entidade |
| RN-08 | O recibo existe só no dispositivo da fonte; perdê-lo é perder a caixa de respostas |
| RN-09 | A prova feita para uma ação (redação, época) não vale para outra |

## 5. Critérios de aceite (exemplos)
**RF-07 / RNF-03 — cifragem**
- Dado um texto e a chave pública da redação, quando cifro, então a redação o abre e um terceiro não.
- Dado um envelope, quando altero o *ciphertext*, a categoria ou a redação, então a abertura falha.

**RF-09 / RN-01 — limite**
- Dada uma pessoa que já enviou para a redação A na época E, quando tenta de novo, então o relayer recusa com a causa "limite atingido".
- Quando ela envia para a redação B na época E, ou para A na época seguinte, então é aceito.

**RF-11 / RN-07 — custódia**
- Dada uma denúncia publicada, quando o relayer tenta apagá-la depois de transferir a custódia, então a operação é recusada.

**RF-15 — resposta**
- Dada uma denúncia com mailbox M, quando a redação responde, então só a fonte com o recibo de M decifra; outra pessoa, não.

**RF-20 / RNF-05 — rede**
- Dado qualquer módulo, quando tenta contatar um host fora da lista permitida, então a chamada é recusada antes de sair.

## 6. Rastreabilidade
| UC | RF | Fases do plano |
|---|---|---|
| UC-01 | RF-01 | 4, 9 |
| UC-02 | RF-02, RF-03 | 4, 9 |
| UC-03, UC-04 | RF-04, RF-05 | 4, 9 |
| UC-05 | RF-06 | 4, 8 |
| UC-06 | RF-07 a RF-11, RF-19, RF-21 | 2, 3, 5, 6, 7, 8 |
| UC-07 | RF-12, RF-13 | 3, 5, 9 |
| UC-08 | RF-14 | 5, 9 |
| UC-09, UC-10 | RF-15 | 3, 5, 8, 9 |
| UC-11, UC-12 | RF-16, RF-17 | 3, 8 |
| UC-13 | RF-18 | 5, 7 |
| UC-14 | RF-20 | 1 |
