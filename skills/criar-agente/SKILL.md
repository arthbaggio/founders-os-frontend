---
name: criar-agente
description: Método para criar um agente que trabalha de verdade no seu dia a dia, a partir de um processo da empresa. Mapeia as etapas, marca o que precisa de aprovação humana, define a skill e o conector de cada etapa e escreve as instruções do agente. Use quando a pessoa quiser um agente novo ("cria um agente de prospecção", "quero um bot que faça X") ou pedir para melhorar um agente que não está bom.
---

# Criar um agente

Um agente bom faz **um trabalho** do começo ao fim. O que trava quase todo mundo não é a ferramenta: é olhar para o próprio dia, escolher o que um agente faria e quebrar isso em passos que ele consegue seguir. Este método resolve essa parte. No OpenBot, quem executa é o Dr. Eggbot: ele cria o agente com as boas práticas. Este método diz o que levar para ele.

Os modelos prontos ficam em `modelos/` (prospecção, conteúdo, atendimento, cobrança e Chief of Staff). Comece por um deles quando o pedido se parecer com algum.

## 1. Escolha o trabalho

Pergunte, um de cada vez, e espere a resposta:

1. Que tarefa se repete toda semana e toma seu tempo? (Ex.: "prospectar 10 clientes por dia".)
2. Qual é o resultado que conta como pronto? (Ex.: "10 mensagens enviadas e os follow-ups agendados".)
3. Com que frequência ela acontece, e quem pede hoje?
4. O que nunca pode dar errado nela? (Ex.: "mandar mensagem para cliente ativo".)

Se a resposta for "faz tudo de vendas", reduza: um agente por trabalho. Um chefe pode coordenar vários depois (organograma do Founders OS).

## 2. Quebre em etapas pequenas

Escreva o processo como uma lista de etapas curtas, cada uma com um verbo e uma saída. Exemplo, "prospectar 10 clientes":

| # | Etapa | Saída | Quem decide | Skill | Conector |
|---|---|---|---|---|---|
| 1 | Montar a lista de empresas do perfil | lista com 30 nomes | agente | `montar-lista` | busca na web, LinkedIn |
| 2 | Escolher os 10 melhores | 10 nomes com o porquê | **pessoa aprova** | — | — |
| 3 | Escrever a mensagem de cada um | 10 rascunhos | agente | `mensagem-prospeccao` | — |
| 4 | Enviar | mensagens enviadas | **pessoa aprova o envio** | — | WhatsApp, e-mail |
| 5 | Agendar o follow-up | tarefas no CRM | agente | `follow-up` | CRM |

Regras para a tabela:

- **Uma etapa, uma saída que dá para conferir.** "Pesquisar" não é etapa; "lista com 30 nomes e o site de cada um" é.
- **Marque a aprovação humana** em toda etapa que fala com alguém de fora, gasta dinheiro, apaga algo ou muda um sistema (CRM, financeiro, agenda). O agente prepara e espera o ok.
- **Skill** é o passo a passo de uma etapa que se repete. Antes de criar, procure uma parecida no cérebro (`procurar_skill_parecida`) e edite a que existe em vez de duplicar. Salve na área do agente (`salvar_skill`).
- **Conector** é a ferramenta que a etapa precisa. Liste só as que o agente usa: menos acesso, menos erro. Etapa sem ferramenta fica em branco.

## 3. Escreva as instruções

Leve para o Dr. Eggbot (ou escreva você) com estas partes:

- **Nome e missão:** uma frase com o resultado. Ex.: "Prospecção: todo dia útil, deixa 10 empresas do perfil prontas para contato, com a mensagem escrita."
- **O processo:** a tabela acima.
- **Quando agir:** os gatilhos ("todo dia às 9h", "quando eu pedir a lista de hoje").
- **O que nunca fazer:** os limites. Sempre entram: não enviar nada para fora sem aprovação; não editar o wiki sem aprovação; em dúvida, perguntar.
- **Onde estão as respostas:** as páginas do cérebro da área (perfil de cliente, oferta, tom de voz). O agente lê o cérebro antes de afirmar algo.
- **Como entregar:** o formato da resposta (lista, tabela, rascunho) e onde salvar (nota no cérebro, tarefa, CRM).

## 4. Teste e ajuste

1. Rode o agente uma vez com um pedido real e confira cada saída da tabela.
2. Anote o que veio errado e corrija **a instrução ou a skill daquela etapa**, não o resultado na mão.
3. Repita até três rodadas boas seguidas. Só então ligue a rotina (o horário automático).
4. Quando ele aprender um jeito novo de fazer, peça: "guarda isso como skill". Ele procura uma parecida antes e salva na área dele.

## Para o Dr. Eggbot

Ao receber um pedido de agente vindo do Founders OS, use este método: faça as perguntas do passo 1 que faltarem, monte a tabela do passo 2 e mostre para a pessoa aprovar antes de criar. Crie o agente com a tabela, os gatilhos, os limites e as páginas do cérebro nas instruções. Skills novas vão para o cérebro, na área do agente, pelo conector Segundo Cérebro.
