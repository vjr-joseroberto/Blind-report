# Caso de uso

## 1. Problema
Quem tem provas de corrupção, fraude ou abuso e quer entregá-las a um jornal enfrenta quatro problemas ao mesmo tempo:

1. **Risco de exposição.** E-mail, mensageiros e formulários guardam IP, horário e identificadores. Uma plataforma central é um alvo único de ataque, de intimação ou de vazamento.
2. **A fonte não sabe se fala com a redação certa.** Perfis falsos e sites clonados capturam denúncias de quem pensava estar falando com o jornal.
3. **A redação é inundada** de spam e denúncias fabricadas e não consegue filtrar sem identificar a fonte.
4. **Ninguém prova depois** que um documento existia numa data nem que não foi alterado.

## 2. Solução
O Safe Whistle é um sistema em que:

- a **redação tem um nome público verificável** (`investiga.jornal.eth`) que publica a sua chave de criptografia no ENS;
- a **fonte cifra no navegador** e só a redação abre o conteúdo;
- a **fonte prova que é uma pessoa real e única** (World ID) sem revelar quem é, o que limita spam;
- a denúncia vira uma entrada no **Arkiv** com **hash e data públicos**;
- a redação **responde** a uma fonte que nunca identificou, por uma caixa de resposta (mailbox) derivada de uma chave efêmera;
- qualquer pessoa **verifica data e integridade** de um documento divulgado.

## 3. Atores
| Ator | Descrição |
|---|---|
| **Fonte** | Quem denuncia. Não tem conta, e-mail nem carteira "própria" |
| **Administrador da redação** | Cadastra a redação, publica a chave pública, gere jornalistas e política de recebimento |
| **Jornalista** | Lê, decifra, classifica e responde denúncias. Tem um subname ENS (`maria.investiga.jornal.eth`) |
| **Relayer** | Serviço do sistema: verifica a prova World ID, paga o gás e publica no Arkiv em nome da fonte |
| **Verificador** | Qualquer pessoa que confere data e hash de um documento divulgado |

## 4. Casos de uso
| ID | Caso de uso | Ator principal |
|---|---|---|
| UC-01 | Cadastrar redação | Administrador |
| UC-02 | Gerir a chave pública da redação (publicar e rotacionar) | Administrador |
| UC-03 | Cadastrar jornalista | Administrador |
| UC-04 | Revogar jornalista | Administrador |
| UC-05 | Consultar redação (resolver o nome, ver chave e política) | Fonte |
| UC-06 | Enviar denúncia | Fonte |
| UC-07 | Ler e decifrar denúncias | Jornalista |
| UC-08 | Classificar denúncia (status) | Jornalista |
| UC-09 | Responder à fonte | Jornalista |
| UC-10 | Receber resposta | Fonte |
| UC-11 | Verificar data e integridade | Verificador |
| UC-12 | Provar autoria de uma denúncia | Fonte |
| UC-13 | Manter retenção (renovar a expiração) | Relayer / Administrador |
| UC-14 | Configurar o RPC | Qualquer usuário |

## 5. Fluxos principais

### UC-06 — Enviar denúncia
**Pré-condições:** a redação existe e publicou chave e política no ENS; a fonte tem o recibo-padrão do navegador.
1. A fonte informa o nome da redação. O sistema resolve o ENS e mostra o nome verificado, a versão da chave e a política (UC-05).
2. A fonte escolhe a categoria, escreve o texto e anexa arquivos permitidos pela política.
3. No navegador, o sistema gera uma chave de conteúdo, cifra tudo, embrulha a chave para a chave pública da redação e gera uma chave efêmera de resposta (mailbox).
4. A fonte prova que é uma pessoa única com World ID. A ação da prova é `submit:<redação>:<época>`.
5. O sistema envia o envelope ao relayer.
6. O relayer verifica a prova, confere o limite de uma denúncia por pessoa por redação por época, valida formato e tamanho e publica no Arkiv.
7. O relayer transfere a custódia da entidade à redação e a marca como imutável.
8. A fonte recebe um **recibo local** (identificador, hash, `salt`, chave privada do mailbox). **Sem o recibo, perde a caixa de respostas.**

**Fluxos alternativos**
- *Prova negada, expirada ou cancelada:* nada é publicado; a fonte vê a causa.
- *Limite atingido:* o relayer recusa com a mensagem "já houve um envio nesta época".
- *Arquivo acima do limite de uma entidade:* o sistema divide em partes (RF-19).
- *Chave da redação rotacionada durante o envio:* o relayer recusa por versão desatualizada; o cliente rebusca a chave e refaz a cifragem.

### UC-07 — Ler e decifrar
1. O jornalista conecta a carteira; o sistema confere no ENS que o subname lhe pertence e está ativo.
2. O sistema consulta o Arkiv por redação e status.
3. A chave privada **fica no navegador do jornalista**; a decifragem é local.

### UC-09 / UC-10 — Resposta
1. A redação cifra a resposta para a chave efêmera da fonte e a publica com o identificador de mailbox (hash da chave efêmera).
2. A fonte consulta periodicamente por esse identificador e decifra com o recibo.

### UC-11 / UC-12 — Verificação e autoria
- O verificador cola o arquivo divulgado; o sistema calcula o hash e compara com a entrada pública e a data de criação.
- A fonte prova autoria revelando o texto original e o `salt`: o compromisso (`commitment`) confere.

## 6. Regras de negócio
1. Uma pessoa pode enviar **uma** denúncia por redação por época; entre redações os identificadores de prova são diferentes.
2. Só o administrador grava a chave pública e a política da redação.
3. Cada redação tem **o seu próprio resolver** no ENS.
4. O envelope carrega a **versão da chave** com que foi cifrado; chaves antigas são preservadas pela redação.
5. A prova de humanidade **nunca** é gravada junto com o conteúdo.
6. A retenção no Arkiv é limitada: uma denúncia que expira **some**; a redação precisa renová-la.
7. Todo dado de demonstração é fictício.

## 7. Fora do escopo do MVP
- Anonimato de rede (a proteção de IP é escolha do usuário, com VPN ou outra ferramenta, **fora do app**).
- Vários relayers, aplicativo móvel, moderação de conteúdo, valor legal da prova.
- Armazenamento de anexos fora do Arkiv (Swarm).

## 8. Limites assumidos
| O sistema promete | O sistema não promete |
|---|---|
| Conteúdo ilegível para terceiros | Anonimato contra quem observa toda a rede |
| Autenticidade da redação (por ENS) | Proteção se o aparelho da fonte estiver comprometido |
| Limite de spam sem identificar a fonte | Anonimato perante o operador do relayer ou do RPC |
| Prova pública de data e integridade | Valor legal da prova (depende da jurisdição) |

O relayer e o RPC **veem o IP** de quem se conecta. Isso é um limite declarado do produto.
