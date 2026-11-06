# Tecnologias utilizadas

Os limites abaixo foram **medidos nas POCs** (`../POC-Cofre`, `../POC-ENS`) ou lidos na documentação oficial. O que ainda não foi verificado está marcado como **a validar** (Fase 0).

## 1. Visão geral
| Camada | Tecnologia | Papel |
|---|---|---|
| Identidade da redação | **ENSv2** (Sepolia) | Nome público, chave pública, política e jornalistas como subnames |
| Armazenamento e consulta | **Arkiv** (testnet Rabdi) | Envelopes cifrados, respostas e anotações, com índice por atributos |
| Anti-spam | **World ID** (IDKit, API v4) | Prova de humano único por redação e época |
| Criptografia | **libsodium** | XChaCha20-Poly1305, *sealed box*, BLAKE2b |
| Cliente de blockchain | **viem** | Leitura do ENS, escrita no ENS e no Arkiv |
| Linguagem | **TypeScript** (Node 22) | Todo o sistema |
| Testes | **Vitest**, **fast-check** | Tudo por script em Node, **sem navegador**. Ver `planejamento/04-estrategia-tdd.md` |
| Rede | **RPC público** comum | Ethereum (Sepolia) e Arkiv; configurável pelo usuário. Padrão da Sepolia: **publicnode**; alternativa: tenderly gateway (V-06) |

## 2. ENSv2
**Por que:** o nome é a âncora de confiança. A fonte digita `investiga.jornal.eth` e obtém a chave pela Universal Resolver, sem confiar no site.

**Como usamos**
- Um **resolver por redação** (`PermissionedResolver`, criado por proxy via `VerifiableFactory`).
- Registros de texto: `denuncia.pubkey`, `denuncia.pubkey.version`, `denuncia.policy`, `denuncia.relayer`.
- Subname por jornalista com `denuncia.readerkey`.
- Leitura **somente pelo nome**, pela Universal Resolver (proxy estável `0xeEeE…EeEe`).

**Fatos medidos**
- Os setters recebem o nome em **formato DNS** (bytes), e não o `namehash`.
- O registro de um `.eth` é *commit-reveal*: espera mínima de **60 s**, duração mínima de 28 dias, pagamento em **MockUSDC** (token de teste com mint livre).
- As roles do resolver valem **por chave de texto em todos os nomes do mesmo resolver**: por isso um resolver por redação.
- Um subname sem registro já resolve pelo resolver do nome-pai.
- Aceita text records de 4.000 caracteres.

**Riscos:** o ENSv2 foi redeployado várias vezes na Sepolia e as assinaturas mudaram entre versões. Reconferir os endereços antes de começar (`docs.ens.domains/learn/deployments`).

## 3. Arkiv
**Por que:** armazena dados com índice por atributos e data de criação públicos.

**Como usamos:** três esquemas (`denuncia`, `resposta`, `anotacao`) com atributos indexados e o envelope em `bytes`.

**Fatos medidos (nó local oficial) e documentados**
| Tema | Valor |
|---|---|
| Tamanho de `bytes` | Limite do SDK 128 KiB; o maior valor aceito no nó local foi **128.960 B (~126 KiB)** |
| Atributos por entidade | até 32; `str` até 128 B |
| Consulta | exige **pelo menos um filtro**; página máxima de 100 linhas; `$createdAt` **não** serve para ordenar (ordenar no cliente) |
| Expiração | em **blocos** (~2 s); expirada, a entidade **some** das consultas e **nenhum evento** avisa. **Vida máxima: 7.884.000 blocos (~182,5 dias)**: pedir mais é recusado pela cadeia (achado nos testes de integração; a Rabdi não foi testada para este limite) |
| Permissões | só o dono altera, apaga ou estende; terceiros são recusados |
| Flag `readonly` | impede alterar, **não** impede apagar nem transferir |
| `changeOwnership` | transfere a entidade; o antigo dono perde o poder de apagar |

**A validar:** custo e limites reais na Rabdi (o teste foi em nó local) e o comportamento do RPC público (limites de taxa).

## 4. World ID
**Por que:** limita spam sem identificar ninguém.

**Como usamos:** a ação da prova é `submit:<redação>:<época>`; o relayer verifica em `POST developer.world.org/api/v4/verify/{rp_id}`, confere ambiente (`staging` com o simulador) e guarda só o hash de `(nullifier, ação)`.

**Fatos:** a assinatura `rp_context` é gerada no servidor com a chave do portal; `proofOfHuman` é a credencial descrita como "humano único".

**A validar:** prova real e comportamento real do nullifier por ação. Pré-requisito: app no Developer Portal migrado para World ID 4.0.

**Nota sobre terceiros (V-05):** o fluxo do World contata `bridge.worldcoin.org`, e o relayer contata `developer.world.org`. O **widget** do IDKit carrega fontes de `world-id-assets.com` (terceiro), então usamos o pacote **headless `@worldcoin/idkit-core`** (gera o `connectorURI` e faz o *polling*) e desenhamos o QR e o botão na nossa tela. Todos esses hosts devem constar na política de rede.

## 5. Criptografia (libsodium)
- Conteúdo: **XChaCha20-Poly1305** com dados autenticados (redação, versão da chave, categoria).
- Chave de conteúdo embrulhada com **sealed box** para cada destinatário.
- Hashes: **BLAKE2b-256** (o build padrão do libsodium não inclui SHA-256).
- Compromisso de autoria: `hash(plaintext ‖ salt)`.
- **Nenhuma criptografia própria.**
- O base64 infla o envelope em ~33%: guardar o *ciphertext* em **binário** no Arkiv.

## 6. Ferramentas de desenvolvimento
| Ferramenta | Uso |
|---|---|
| npm workspaces | Monorepo simples |
| Vitest | Testes unitários e de integração |
| fast-check | Testes baseados em propriedades (criptografia) |
| Docker | Fork local da Sepolia (anvil) e nó Arkiv local para testes de integração |
| esbuild / Vite | Empacotar os front-ends |

## 7. O que NÃO usamos
- **Tor, Nym, Nox, I2P, Lokinet, SOCKS de anonimato e o Anon-RPC** (guardrail: `../GUARDRAILS.md`).
- Contratos próprios (o MVP usa só os contratos do ENS).
- Servidores de terceiros além dos declarados na política de rede: RPC, World e relayer.
- Analytics, relatório de erros ou fontes e scripts de CDN.
- **Navegador automatizado nos testes** (Playwright, Selenium e similares): os testes são scripts em Node (`planejamento/06-decisao-testes-sem-navegador.md`).
