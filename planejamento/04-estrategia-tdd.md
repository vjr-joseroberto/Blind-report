# Estratégia de desenvolvimento baseado em testes (TDD)

## 1. Ciclo
Todo código nasce de um teste que falha.

1. **Vermelho:** escrever **um** teste pequeno que descreve o comportamento desejado e ver que ele falha pelo motivo certo.
2. **Verde:** escrever o **mínimo** de código para passar.
3. **Refatorar:** melhorar o código e os testes, com todos verdes.
4. Repetir. Um commit por ciclo curto, ou um por conjunto verde.

Regras:
- Não escrever código de produção sem teste vermelho.
- Não escrever dois testes vermelhos ao mesmo tempo.
- Um teste verifica **uma** coisa e tem nome que descreve o comportamento: `recusa_envio_quando_limite_da_epoca_foi_atingido`.
- O teste é a especificação: se o requisito muda, o teste muda primeiro.

## 2. Níveis de teste
| Nível | O que testa | Ferramenta | Rede | Onde |
|---|---|---|---|---|
| **Unitário** | Funções puras e módulos isolados | Vitest | Nenhuma | `packages/*/test`, `apps/*/test` |
| **Propriedades** | Invariantes de criptografia e de divisão em partes | Vitest + fast-check | Nenhuma | `packages/crypto/test`, `packages/core/test` |
| **Contrato** | Pacotes respeitam suas dependências e interfaces | Vitest | Nenhuma | `tests/contract` |
| **Integração** | Pacote contra o sistema real local | Vitest | fork local e nó Arkiv local | `packages/ens-client/test/integration`, `packages/arkiv-store/test/integration` |
| **Clientes sem interface** | A lógica de cada lado (`source-client`, `newsroom-client`) | Vitest | Nenhuma (rede injetada e gravada) | `packages/*-client/test` |
| **Camada fina de tela** | Só o que a tela gera: HTML sem terceiros, CSP, e (opcional) DOM simulado em Node | Vitest | Nenhuma | `apps/web-*/test` |
| **E2E por script** | Fluxos completos com relayer, ENS e Arkiv locais, **sem navegador** | Vitest | local | `tests/e2e` |
| **Validação** | Caracteriza comportamento externo (Fase 0) | Vitest (`@validation`) | RPCs públicos, World, Rabdi | `validation/` |
| **Guardrail** | Ausência de rede de anonimato | `node --test` | Nenhuma | `guardrails/` |

**Não usamos navegador automatizado** (Playwright, Selenium ou similar): todos os testes são scripts executados em Node. Para isso a lógica dos front-ends vive em clientes sem interface, e os E2E usam esses clientes. Detalhes, o que se ganha e o que fica de fora estão em `06-decisao-testes-sem-navegador.md`.

Proporção buscada: muitos unitários, alguns de integração, poucos E2E.

## 3. Regras sobre dublês
- **Fronteiras de rede são injetadas.** Cliente do ENS, cliente do Arkiv, verificador do World, relógio e aleatoriedade entram como parâmetros.
- Preferir **implementações falsas simples** (verificador falso, repositório em memória) a *mocks* com expectativas de chamadas.
- O verificador do World tem três versões com **o mesmo contrato**: simulada (testes unitários e E2E), real em ambiente de teste (só validação, se houver acesso) e real de produção.
- O **fornecedor de prova** (`ProofProvider`) do `source-client` é outro dublê: na tela é o IDKit; nos testes devolve provas simuladas ou erros (negada, expirada, cancelada).
- Todo dublê é coberto por um **teste de contrato** que o exercita junto com a implementação real, para não divergirem.
- Nunca mockar a criptografia: o libsodium roda de verdade nos testes.

## 4. Determinismo
- O **relógio** e a **aleatoriedade** são dependências (`now`, `random`), então os testes controlam a época e geram chaves previsíveis quando necessário.
- Testes não dependem da hora, da ordem de execução nem de rede externa (exceto `@validation`).
- Os nós locais são recriados a cada execução de integração; nomes e rótulos únicos por execução.

## 5. Regras de rede nos testes (guardrail)
- Testes unitários: **nenhuma** rede.
- Integração e E2E: apenas `localhost` e o RPC público usado para o fork.
- Validação: RPCs comuns, API do World, Rabdi.
- **Proibido** qualquer rede de anonimato (`../GUARDRAILS.md`). O **gravador de requisições** (um `fetch` injetado que registra destino e corpo) faz os testes **falharem** se o sistema contatar um host fora da lista da política de rede ou enviar texto original ou chave privada.

## 6. Organização dos testes
- Cada pacote tem `test/` ao lado de `src/`; arquivos terminam em `.test.ts`.
- Integração em `test/integration/` com sufixo `.int.test.ts`; E2E por script em `tests/e2e/*.e2e.test.ts`.
- Dados de teste fictícios em `tests/fixtures/`.
- Cada requisito (RF-xx) aparece no nome ou na descrição de pelo menos um teste: `describe('RF-07 cifrar denúncia', ...)`.

## 7. Qualidade
| Item | Meta |
|---|---|
| Cobertura de linhas | ≥ 90% em `core` e `crypto`; ≥ 80% nos demais |
| Testes frágeis | Zero tolerância: um teste instável é corrigido ou removido |
| Velocidade | Unitários completos em menos de 30 s |
| Mutação (opcional, depois do MVP) | Aplicar a `crypto` e `worldid-gate` |

## 8. Exemplo de ciclos (pacote `crypto`)
```ts
// 1) VERMELHO — o teste descreve o comportamento
it("a redação abre o envelope que a fonte cifrou", () => {
  const redacao = newKeypair();
  const { envelope } = seal({ newsroom: "investiga.jornal.eth", pubkeyVersion: 1, category: "corrupcao",
    recipients: [{ id: "redacao", publicKey: redacao.publicKey }], plaintext: utf8("texto fictício") });
  expect(text(open(envelope, "redacao", redacao))).toBe("texto fictício");
});
// 2) VERDE — implementar seal/open com o mínimo
// 3) REFATORAR — extrair a montagem dos dados autenticados
// Próximo vermelho: "alterar a categoria invalida a abertura"
// Depois: propriedade — para qualquer texto, abrir(cifrar(x)) == x
```

## 9. Fluxo de trabalho por tarefa
1. Escolher um requisito (RF-xx) e um critério de aceite.
2. Listar os testes necessários (lista curta, ordenada do mais simples ao mais complexo).
3. Rodar os ciclos vermelho, verde e refatorar para cada item da lista.
4. Rodar `npm run ci` localmente.
5. Atualizar `docs/` se o comportamento ou o desenho mudou.

## 10. Definição de pronto (por tarefa)
- Todos os testes novos e antigos passam.
- `npm run guardrails` passa.
- Cobertura no mínimo da meta do pacote.
- Sem código sem teste, sem `TODO` sem requisito associado.
- Documentação atualizada, quando relevante.
- Revisão de outra pessoa ou revisão própria com a lista de verificação (segurança, privacidade, rede).

## 11. Lista de verificação de segurança e privacidade (a cada tarefa)
- Algum **texto original** ou **chave privada** vai à rede ou ao log?
- Algum atributo gravado **identifica a fonte**?
- O código contata um **host fora** da política de rede?
- Há **dependência nova**? É de rede de anonimato? (proibido)
- O erro mostrado ao usuário revela detalhes internos?
