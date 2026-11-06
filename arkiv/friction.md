# Atritos encontrados ao usar o Arkiv

Registro honesto do que atrapalhou ou surpreendeu ao construir o Safe Whistle sobre o SDK `@arkiv-network/sdk` 1.0.0 e a testnet Rabdi. Cada item diz **como foi descoberto**, **o impacto** e **o que fizemos**. Itens medidos têm a fonte em `validation/RESULTADOS.md`.

## 1. Vida máxima de uma entidade (descoberta por erro)
- **O que aconteceu:** pedir 365 dias de retenção foi recusado pela cadeia: *"the expiry resolves to block …, more than the chain's maximum lifetime of 7884000 blocks"*. O teto é de **7.884.000 blocos, ~182,5 dias**.
- **Como descobrimos:** teste de integração no nó local. O valor **não foi reconfirmado na Rabdi** (provavelmente é o mesmo parâmetro).
- **Impacto:** sem renovação a denúncia some. Isso virou requisito (RN-06).
- **O que fizemos:** a loja recusa retenção acima do teto menos 1 hora de folga; retenção padrão de 150 dias; um job do relayer renova o que vence em até 60 dias.
- **Sugestão:** expor o limite (em blocos) por uma chamada do SDK, em vez de só na mensagem de erro.

## 2. Tamanho máximo do conteúdo (limite sem mensagem de causa)
- **Medido na Rabdi:** até **128.960 bytes** (~126 KiB) são aceitos. **131.072 bytes (128 KiB exatos)** foram **recusados pela rede sem causa informada**, e 131.073 bytes foram recusados pelo próprio SDK.
- **Impacto:** o limite útil é menor que o "128 KiB" que se imagina, e a recusa em 131.072 não explica o motivo.
- **O que fizemos:** partes de 120 KiB (`PART_PAYLOAD_BYTES`) e remontagem; anexos grandes viram várias entidades agrupadas pelo `contentHash`.
- **Sugestão:** documentar o limite útil e devolver a causa da recusa.

## 3. Consulta exige ao menos um filtro; página máxima de 100
- **O que aconteceu:** `select` sem filtro é recusado. A página máxima é 100.
- **Impacto:** para listar "tudo" é preciso um atributo indexado como filtro e paginar.
- **O que fizemos:** todo registro carrega `newsroom` indexado; a loja pagina em blocos de 100.

## 4. Esquema fixo no cliente: coluna nova e coluna opcional
- **O que aconteceu (duas vezes, ao adicionar `authorName` a `anotacao` e `resposta`):**
  1. *"the create names a column this schema does not have"*, porque o esquema declarado no código não tinha a coluna.
  2. Depois de declarar, *"the create leaves out a required str column. Give it a value, or declare it str().optional()"*, porque toda coluna é obrigatória, a menos que seja declarada `.optional()` ou com valor padrão.
- **Como descobrimos:** só o **teste de integração contra o nó real** pegou. Os testes com o dublê em memória passavam.
- **Impacto:** uma mudança de esquema precisa ser pensada junto com os registros já gravados.
- **O que fizemos:** `authorName` declarada como `str().optional()`. Tratamos valor vazio ou nulo na leitura como "sem autor" por precaução; **não confirmamos qual dos dois o nó devolve**.
- **Não verificado:** o que acontece, na Rabdi, ao gravar com um esquema que ganhou uma coluna depois de já existirem registros do esquema antigo. Já há registros antigos da Rabdi (sem `authorName`) que são lidos normalmente.

## 5. A chave de acesso vai no caminho da URL do RPC
- **O que aconteceu:** `rabdi({ accessKey })` monta o RPC como `https://rpc.rabdi…/<chave>`. Sem chave, o SDK avisa e usa o endpoint público, com limite de taxa forte.
- **Impacto:** em um app de navegador, a chave de acesso ficaria exposta no código ou na configuração da carteira do usuário.
- **O que fizemos:** a chave nunca entra no código do navegador. No painel da redação ela é opcional, digitada pelo usuário; a leitura da tela da fonte usa o endpoint público.
- **Sugestão:** aceitar a chave em um cabeçalho, ou oferecer chaves de leitura de escopo limitado.

## 6. Nenhum aviso quando uma entidade expira
- **O que aconteceu:** a entidade simplesmente **some das consultas**, sem evento. Medido na Rabdi com 30 s de vida.
- **Impacto:** quem não renova perde o dado sem perceber.
- **O que fizemos:** o relayer renova periodicamente e a tela da redação lista o que vence em breve.

## 7. Semântica de permissões que precisou ser medida
- **Medido (nó local e Rabdi):** depois de `changeOwnership`, o criador **não** apaga nem estende, a menos que a entidade tenha `permissionlessExtension`, e **nunca** altera o conteúdo de uma entidade `readonly`. `$creator` continua sendo o criador original.
- **Impacto:** é exatamente o que o modelo de custódia precisava, mas só ficou claro depois de testar cada combinação.
- **O que fizemos:** criamos com `readonly` e `permissionlessExtension`, e transferimos a propriedade. Qualquer conta pode estender (o custo é de quem estende), e o relayer não consegue apagar.

## 8. SDK muito tipado por esquema
- **O que aconteceu:** o acesso por tipo de entidade (denúncia, resposta, anotação) é dinâmico, e o tipo gerado pelo esquema atrapalhou.
- **O que fizemos:** uma interface estreita (`SdkPublic`/`SdkWallet`) e um backend com a mesma suíte de contrato para o dublê em memória e para o SDK real.

## 9. O que funcionou sem atrito
- **Carteira de navegador:** `createWalletClient({ account: <endereço>, transport: custom(provedor EIP-1193) })` assinou criar, ler, estender e mudar propriedade **sem adaptador** (teste com provedor falso, `validation/B0-RESULTADO.md`). A MetaMask real ainda não foi testada.
- **Custo:** ~0,00017 tGLM por denúncia pequena na Rabdi.
- **Nó local de desenvolvimento** (`arkiv-reth-dev`) com blocos de 2 s se comportou como a Rabdi.
