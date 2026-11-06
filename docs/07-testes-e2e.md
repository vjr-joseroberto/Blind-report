# Testes de ponta a ponta (sem navegador)

`npm run test:e2e` sobe o fork local da Sepolia (porta 8545) e o nó Arkiv local (8546), roda os cenários e derruba os nós ao final, mesmo se falhar. Não faz parte do `npm run ci` (é lento); o ciclo rápido de TDD continua nos testes unitários.

## O que sobe
| Peça | Como |
|---|---|
| ENS | Fork da Sepolia (anvil) com o ENSv2 real |
| Arkiv | Nó de desenvolvimento local, blocos de 2 s |
| Relayer | **Processo filho de verdade** (`apps/relayer/src/main.ts`), com `SIMULATE_WORLD=1` |
| Fonte, redação, jornalista | `source-client` e `newsroom-client`, cada um com um **gravador de requisições** |

Tudo em localhost. Nada de rede de anonimato. O relayer só aceita `SIMULATE_WORLD=1` quando os dois RPCs são locais; em qualquer outro caso ele se recusa a iniciar.

## O que o World simulado cobre (e o que não cobre)
O verificador simulado aprova qualquer prova. A regra "uma pessoa por redação por época" continua sendo testada de verdade, porque ela vem do nullifier, que o teste gera por pessoa e por ação (como o protocolo faz). A prova real do World foi validada à parte na V-02 (simulador do World, `staging`).

## Cenários (`tests/e2e/safe-whistle.e2e.test.ts`)
| Cenário | O que prova |
|---|---|
| UC-01 a UC-03 | Cadastro com as etapas do commit; chave pública, versão, política e custodiante legíveis pelo ENS; jornalista ativo no registry; chaveiro cifrado para a chave dele; terceiros não abrem |
| UC-05 e UC-06 | A fonte consulta, cifra, passa pelo relayer real e recebe o recibo; a denúncia aparece para a redação |
| UC-07 e UC-08 | O jornalista lista, decifra e classifica sem alterar o envelope |
| UC-09 e UC-10 | O jornalista responde; só a fonte dona do recibo lê |
| UC-11 e UC-12 | Hash e bloco do arquivo divulgado; prova de autoria (e recusa do texto errado) |
| Limite | O segundo envio da mesma pessoa é recusado (`limit_reached`); outra pessoa é aceita |
| Rotação | Uma fonte com a chave antiga em cache envia; o relayer recusa; ela cifra de novo; o jornalista decifra as duas versões |
| Retenção | A denúncia renovada permanece e a não renovada some (vida de 30 s no nó local) |
| RNF-01 | Nenhuma requisição das fontes, do jornalista ou do administrador contém o texto, o sal, a chave do recibo ou a chave privada da redação (em texto, base64url ou hex); o log do relayer não tem texto, IP nem prova |
| RNF-04/05 | Só `127.0.0.1` foi contatado |

## Limites
- O tempo de expiração é real (o cenário de retenção espera ~45 s).
- Não exercita cliques nem campos das telas: isso fica na lista manual M-01 (Fase 11).
- A prova do World é simulada; a real foi validada na V-02.
