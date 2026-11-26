# Founders OS

O frontend do cérebro: o mapa do wiki em `../founders-os-brain`, com o design "Cérebro v3" do Claude Design. Uso local.

## Instalar com o Claude (o jeito mais fácil)

Abra o [Claude Code](https://claude.com/claude-code) numa pasta vazia (ou na pasta do app, se você já baixou) e cole o pedido abaixo. Ele confere o que você já tem, mostra o que falta e só instala depois do seu ok. Serve para Mac e Windows.

```text
Quero instalar (ou atualizar) o Founders OS neste computador:
https://github.com/arthbaggio/founders-os-frontend
Siga o "Instalação passo a passo" do README. Em cada passo, me mostre o resultado.

1. Antes de instalar qualquer coisa, confira o que já tenho e me diga a versão de cada um:
   git, Node.js (precisa ser 22.5 ou mais novo), npm, o Claude Code logado
   (`claude auth status`) e o app OpenBot (https://openbot.run).
2. Para o que faltar, me mostre o que vai instalar, de onde (só sites oficiais) e o comando.
   Espere eu aprovar antes de instalar.
3. Se a pasta do app já existe, rode `git checkout main` e `git pull origin main`. Se não
   existe, clone o repositório. Depois rode `npm install`.
4. Me pergunte onde está o meu cérebro. Se ele estiver em `founders-os-brain`, ao lado do
   app, rode `npm run dev`; se estiver em outro lugar, `BRAIN_DIR=<pasta> npm run dev`.
   Sem cérebro, o app abre a criação guiada.
5. Abra http://localhost:5178/api/openbot/logo. Se aparecer o logo do OpenBot, o app achou
   o OpenBot. Se der erro, siga "Se algo não aparecer" no README.
6. No fim, me guie no app: robô da barra de baixo › Configurar › Ligar (Local scripts)
   › Configurar tudo.

Não mude nada fora da pasta do app e do cérebro, não faça commit e não peça senha
nem chave de API no chat.
```

## Instalação passo a passo

Faça na ordem. Cada passo diz como conferir que deu certo antes de seguir.

**1. Node.js 22.5 ou mais novo.** Baixe a versão LTS em https://nodejs.org. No terminal, `node -v` tem que mostrar `v22.5` ou maior. Com o Node 20 o app abre, mas não lê a conversa do OpenBot.

**2. Claude Code logado.** Instale em https://claude.com/claude-code e rode `claude auth login` uma vez. `claude auth status` tem que mostrar a sua conta.

**3. OpenBot instalado, aberto e com um agente.** Baixe em https://openbot.run e instale no lugar padrão:

- Mac: arraste para a pasta **Aplicativos** (`/Applications`). O app só procura o OpenBot ali e em `~/Applications`.
- Windows: rode o instalador sem trocar a pasta (fica em `%LOCALAPPDATA%\Programs\OpenBot`).

Abra o OpenBot e crie um agente qualquer, que ele pede na primeira vez. É esse agente que depois monta o time. Deixe o OpenBot aberto.

**4. O app.**

```bash
git clone https://github.com/arthbaggio/founders-os-frontend.git
cd founders-os-frontend
npm install
```

Se você já tinha baixado, entre na pasta e atualize em vez de clonar de novo: `git checkout main`, `git pull origin main` e `npm install`.

**5. O cérebro.** O app lê uma pasta de cérebro: por padrão, `founders-os-brain` ao lado do app. Ele precisa ter:

- `wiki/<área>/`: uma pasta por área (`wiki/vendas/`, `wiki/marketing/`…). **Cada pasta vira um agente.** A área `empresa` sempre existe.
- `.claude/skills/<skill>/SKILL.md`: as skills. Para a skill ir para o agente certo, o `SKILL.md` precisa de `area: <pasta da área>` no topo (frontmatter). Sem isso, ela vai para a Empresa.

Não tem cérebro? Rode o app sem ele e use a criação guiada, que monta essa estrutura.

**6. Rodar.**

```bash
npm run dev                                  # cérebro em ../founders-os-brain
BRAIN_DIR=/caminho/do/cerebro npm run dev    # cérebro em outra pasta (Mac)
```

No Windows (PowerShell), para outra pasta: `$env:BRAIN_DIR="C:\caminho\do\cerebro"; npm run dev`.

Abra http://localhost:5178. Na barra de baixo, depois da linha vertical, tem que aparecer o **robô** (Agentes) ao lado do lápis.

**7. Conferir o OpenBot.** Abra http://localhost:5178/api/openbot/logo. Tem que aparecer o logo do OpenBot. No painel do robô, o topo mostra "N no OpenBot" em vez de "OpenBot desconectado".

**8. Montar o time.** Robô › **Configurar**:

1. **Ligar** o Local scripts. O app pede para fechar e reabrir o OpenBot; aceite.
2. **Configurar tudo.** O agente que você criou no passo 3 monta o time: um agente por área, com as skills e rotinas dela e o conector do cérebro. Leva alguns minutos. Aprove o que o OpenBot pedir.

Pronto quando cada agente aparece na lista com o selo do OpenBot no canto.

## Se algo não aparecer

| O que você vê | O que fazer |
|---|---|
| Não tem o robô na barra de baixo (só o lápis depois da linha) | Você está numa versão antiga. Na pasta do app: `git checkout main`, `git pull origin main`, `npm install`. Pare o `npm run dev` (Ctrl+C), rode de novo e recarregue a página (Cmd+Shift+R ou Ctrl+Shift+R). |
| `/api/openbot/logo` dá erro | O app não achou o OpenBot. No Mac, mova o OpenBot para `/Applications`. No Windows, reinstale na pasta padrão. |
| "OpenBot desconectado" no painel | Abra o OpenBot. Se nunca abriu, abra e crie um agente; só assim ele grava o endereço que o app lê (`~/Library/Application Support/OpenBot/automation` no Mac, `%APPDATA%\OpenBot\automation` no Windows). |
| Abriu a criação guiada em vez do mapa | O app não achou o cérebro. Rode com `BRAIN_DIR` apontando para a pasta dele. |
| Só apareceu o agente Empresa, ou poucos agentes | O cérebro não tem pastas de área em `wiki/`. Crie uma pasta por área e rode o Configurar tudo de novo. |
| Agente sem skills, ou todas as skills na Empresa | Falta `area:` no topo dos `SKILL.md`, ou o valor não bate com o nome da pasta da área. |
| A conversa não mostra o histórico do OpenBot | O Node é mais antigo que 22.5. Atualize (passo 1). |
| O Configurar tudo parou no meio | Rode de novo. O app tenta até 3 vezes; confira se o OpenBot está aberto e se há aprovações esperando. |

## Como rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:5178. Para ler outra pasta de cérebro, use `BRAIN_DIR=/caminho/do/cerebro npm run dev`.

Para o Rodar, o Processar, a criação do cérebro e o desenho do time funcionarem, o `claude` precisa estar no PATH e logado (`claude auth login`, uma vez). `CLAUDE_BIN=/caminho/do/claude` troca o executável.

O app escreve no cérebro só as notas, em `fontes/notas/`, as tarefas do Mission Control, em `memory/to-dos.md`, e o diário do Meu dia, em `memory/diario/`. O resultado das sessões do Claude fica fora do cérebro, em `sessoes/`, aqui no app. As sessões escrevem no cérebro conforme a permissão de cada uma (abaixo). Os ajustes do Personalizar e os itens tirados do mapa ficam no `localStorage` do navegador.

## O que lê

- **Departamentos:** cada pasta de `wiki/` vira um departamento, e `empresa` é o centro.
- **Pastas e páginas:** subpastas viram pastas e cada `.md` vira uma página, com o título do H1. O `index.md` de cada pasta não vira nó; ele define a ordem e o nome da pasta. `wiki/log.md` fica preso à empresa.
- **Skills:** vêm de `.claude/skills/<slug>/SKILL.md`. No frontmatter, `area:` liga a skill a um departamento (sem ele, a skill fica na empresa). Uma skill com `schedule:` aparece como rotina; a próxima vez sai de textos como "Segundas, 8h", "Todo dia, 9h" ou "Dia 1º, 8h".
- **Atualização ao vivo:** quando algo muda em `wiki/` ou `.claude/skills/`, o mapa se refaz sozinho.

## Em volta do mapa

- **Personalizar** (botão no topo, ou `,`): o que aparece na tela, os ajustes do mapa, as skills favoritas, o modelo e o esforço das sessões do Claude, a barra de ferramentas, o relógio e as notas. Muda na hora e fica guardado. O modelo **Padrão** é o do Claude Code (o `settings.json` dele).
- **Skills e rotinas:** as favoritas e as próximas rotinas, à esquerda; o painel Gerenciar lista todas. **Rodar** abre uma sessão do Claude (`claude -p "/slug instruções"`) na pasta do cérebro. A lista **Agora** mostra a sessão ao vivo (a etapa e o tempo); o X para a sessão ou, terminada, tira da lista. No fim, a resposta vira um `.md` em `sessoes/`, com a origem no topo, e **Ver resultado** abre no leitor.
- **Rotinas rodam sozinhas:** o servidor olha o relógio a cada 30 s e, na hora do `schedule:` de uma rotina, abre a sessão dela como se você tivesse clicado em Rodar (`server/routines.ts`). A hora é inteira ("8h"). Só dispara com o servidor de pé: se o app estava fechado ou o Mac dormindo na hora, a vez se perde (passou de 2 min, espera a próxima) e nada corre atrás do atraso. Não repete se a rotina já rodou depois da hora, à mão ou antes de um reinício. Sem o Personalizar (que vive no navegador), usa o modelo e o esforço padrão do Claude Code. A sessão aparece na lista **Agora** sozinha, e o resultado vai para `sessoes/` como qualquer outro. Uma rotina com `pausada: sim` no frontmatter aparece no mapa e em **Próximas rotinas** como qualquer outra, mas o servidor não a dispara; o Rodar continua funcionando. Tire a linha para ligar.
- **Notas** (`N` em qualquer lugar): cada nota é um `.md` em `fontes/notas/`, com a data no nome e a origem no topo. Na caixa, é rascunho e muda à vontade. **Processar na wiki** segue o fluxo do CLAUDE.md. Uma sessão do Claude lê a nota e propõe as mudanças, sem gravar nada. **Pedir ajuste** refaz a proposta e **Descartar** devolve a nota para a caixa. **Aprovar e gravar** continua a mesma sessão, que grava no wiki; gravada, a nota vira fonte e não muda mais. Enquanto o Claude está com a nota, ela não muda.
- **O que cada sessão pode fazer:** ninguém responde pedido de permissão numa sessão daqui, então o que pediria permissão é negado na hora. Só o Rodar é aberto; as outras sessões seguem fechadas (sem MCP, web nem terminal).
  - **Rodar:** tem todas as ferramentas (web, Bash e os conectores). Edita o cérebro, menos `wiki/`, que só muda com aceite (pelo Processar). Os conectores (Notion, ClickUp, etc.) vêm da config do app Claude Desktop (`claude_desktop_config.json`, em `~/Library/Application Support/Claude/` no Mac e `%APPDATA%\Claude\` no Windows), que o `claude -p` não lê sozinho; o `--mcp-config` em `server/runs.ts` aponta para ela quando ela existe. Testado em 2026-10-19 com `/historia-porco-lobo` (cria uma página no Notion e devolve o link).
  - **Proposta e ajuste do Processar:** só leem.
  - **Aprovar e gravar:** escreve só dentro de `wiki/`.
- A lista de sessões vive no servidor: reiniciar o `npm run dev` a esvazia (e uma proposta esperando revisão se perde), mas os resultados em `sessoes/` ficam.
- **Aplicações** (o anel em volta da empresa): os conectores ligados ao Claude. Os da conta claude.ai vêm do `claude mcp list`, com o estado (Conectado, Precisa de login, Com falha); a lista leva meio minuto para chegar e se refaz a cada 10 minutos. Os locais vêm da config do Claude Desktop, só pelo nome, sem testar. Ver `server/apps.ts`.
- **Ferramentas:** de 4 a 8 atalhos na barra de baixo. O padrão são os sistemas de `wiki/compartilhado/sistemas-e-ferramentas.md`.

## Estrutura

- `server/scan.ts`: lê o cérebro e monta a árvore.
- `server/notes.ts`: guarda as notas em `fontes/notas/`.
- `server/apps.ts`: lista os conectores para o anel Aplicações.
- `server/runs.ts`: as sessões do Claude, do `claude -p` ao resultado em `sessoes/`, com o que cada uma pode fazer (`ACCESS`).
- `server/routines.ts`: o relógio das rotinas, que abre a sessão na hora do `schedule:`.
- `server/brainApi.ts`: rotas `/api/tree`, `/api/page`, `/api/open`, `/api/notes` (com as etapas do Processar) e `/api/runs`, e o aviso de mudança. Só acessa arquivos dentro do cérebro e os resultados em `sessoes/`.
- `src/brain/engine.js`: o motor do mapa, portado do design quase sem mudanças.
- `src/brain/physics.js`: as molas do arrasto.
- `src/Brain.tsx`: a interface por cima do mapa.
- `src/home.ts`: os padrões da tela inicial e as contas pequenas (tempo, agenda das rotinas, comandos).
- `src/components/`: o leitor, o Personalizar, os widgets de skills e notas, a barra de ferramentas e o relógio.

## Do design para o app

O design "Cérebro v3" foi seguido onde ele vale para o app. Ficaram de fora:

- As vistas Círculo e Hexágono e o tamanho delas, que o app já tinha tirado.
- Das sessões simuladas do Claude: a barra de progresso e as etapas numeradas (uma sessão de verdade não sabe quanto falta) e o botão de pausar rotina. A lista "Agora" e a revisão da nota (proposta, Pedir ajuste, Aprovar e gravar) voltaram, com sessões de verdade; a proposta aparece como o Claude a escreveu, não como uma lista de mudanças com sinais.
- Os dados de exemplo (skills, aplicações, notas e atalhos inventados).
- O ícone do próprio site na barra: Gmail, Agenda e Drive saíam com o mesmo "G" do Google. Ficaram os desenhos por tipo de ferramenta.

## Créditos

As molas do arrasto, nas vistas Anéis e Força, usam os parâmetros do [playbook-lab-os-second-brain](https://github.com/felipenunes07/playbook-lab-os-second-brain) (Jay E / RoboNuggets, licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Isso inclui a força das ligações por tipo, a colisão, o amortecimento e o reaquecimento no arrasto. A implementação aqui é nova, feita sobre `d3-force`.


Os mascotes dos agentes são os mesmos do OpenBot: o app desenha com o [Bloub](https://github.com/NorbertBodziony/bloub) (`@norbert_bodziony/bloub`, licença MIT), a biblioteca que o OpenBot usa, a partir do seed que cada agente tem no OpenBot (`src/components/BotFace.tsx`). O selo do OpenBot é o logo do app instalado na máquina, lido na hora; nenhuma imagem do OpenBot está neste repositório.
## Sem cérebro ainda? Criar meu segundo cérebro

Quando a pasta do cérebro (`BRAIN_DIR`, ou `founders-os-brain` ao lado do app) não tem nenhuma página nem skill, o app abre a criação guiada em vez do mapa (`src/components/Onboarding.tsx`, `server/brainBuilder.ts`). Segue o método do os-builder:

1. **Entrevista** em três telas curtas: a empresa, como o trabalho acontece, limites e as três perguntas que o cérebro precisa responder. Cada pergunta tem o próprio campo e só o nome e o que a empresa vende são obrigatórios. Dá para colar material (site, apresentação, anotações). O rascunho fica salvo (`sessoes/cerebro/criacao.json`, ligado à pasta do cérebro).
2. **Proposta.** O Claude Code monta as áreas, as páginas, as skills e rotinas com horário, as fontes da verdade e o que ficou pendente. Nada é gravado. A pessoa aprova ou pede ajuste.
3. **Criação.** O Claude Code cria o `AGENTS.md` (o mapa, sem `CLAUDE.md`), o `wiki/` por área, o `wiki/log.md`, a memória (`memory/`), `fontes/notas/` e as skills. Nunca inventa: o que faltou vira "Pendente". Só roda numa pasta vazia, então nunca sobrescreve um cérebro.
   - O Claude Code protege `.claude/`, então as skills são escritas em `skills-novas/` e o app as move para `.claude/skills/`.

Depois o mapa abre e o próximo passo é **Agentes › Desenhar**.
## Agentes (OpenBot)

O cérebro vira um time de agentes no [OpenBot](https://openbot.run/), que cada pessoa instala na própria máquina. **Um agente por área do mapa**, com o nome da área (Empresa, Vendas, Marketing…). Cada um fica com as skills e rotinas da área dele. Uma skill sem área vai para a Empresa.

### Do zero, para quem baixou o repositório

Precisa de: Node 22.5+ (para ler a conversa do OpenBot; com Node 20 funciona, mas o histórico fica só o daqui), o [Claude Code](https://claude.com/claude-code) logado (`claude auth login`) e o OpenBot instalado e aberto, com pelo menos um agente qualquer (o OpenBot pede um na primeira vez).

1. `npm install` e `npm run dev`, e abra http://localhost:5178.
2. Sem cérebro, o app abre a criação guiada (abaixo). Com um cérebro, abre o mapa.
3. Robô da barra de baixo › **Configurar** › **Desenhar**: o Claude lê o cérebro e escreve a missão, os gatilhos e os limites de cada agente. Os nomes e a divisão vêm das pastas, então o resultado é o mesmo em qualquer máquina.
4. **Configurar o OpenBot** (no mesmo painel): **Ligar** o Local scripts e **Configurar tudo**. Um agente que já existe no OpenBot cria o time inteiro: os agentes, as skills, as rotinas e o conector do cérebro. O app acompanha e mostra as aprovações que o OpenBot pedir.
5. Converse: o robô da barra abre os agentes à esquerda e a conversa à direita. No mapa, clique numa área e em **Conversar** para cair direto no agente dela.
6. **Dr. Eggbot** (no mesmo painel, **Instalar**): o agente oficial do marketplace do OpenBot que cria agentes. Para um agente novo, converse com ele, explique o processo, e ele pergunta o que falta e cria o agente. Ele trabalha com acesso total (cria arquivos e roda comandos sem pedir a cada passo).

O app acha o OpenBot sozinho: lê `url` e `token` na pasta de dados dele (`%APPDATA%\OpenBot` no Windows, `~/Library/Application Support/OpenBot` no Mac), em `automation/`, e fala só com 127.0.0.1 (`server/openbot.ts`). No modo **Automático** (o padrão), segue o servidor que estiver aberto; se mais de um estiver aberto, usa o Principal. Escolher outro servidor no painel fixa a escolha. `OPENBOT_AUTOMATION_DIR` troca a pasta inteira.

### O que fica de cada pessoa (e nunca vai para o git)

- O cérebro: uma pasta separada (`BRAIN_DIR`, ou `founders-os-brain` ao lado do app). Não faz parte deste repositório.
- `sessoes/`: as conversas com os agentes (`sessoes/agentes/conversas/`), o plano do time, a escolha de servidor, a criação do cérebro e os resultados das sessões. Está no `.gitignore`.
- `.openbot/` dentro do cérebro: o pedido de montagem e o registro do conector. Tem um `.gitignore` próprio.
- Os caminhos do conector e do cérebro são montados na hora, a partir de onde o app e o cérebro estão em cada máquina.

### Mission Control

O botão de painel na barra de baixo abre o Mission Control (`src/components/MissionControl.tsx`). Ele tem três páginas, no mesmo visual calmo do mapa:

- **Meu dia** (a sua página): anotar uma tarefa, o **Foco** do dia (até 3 tarefas, com estrela ou arrastando), **Hoje**, **Depois** e **Feitas hoje**; ao lado, as prioridades de `memory/prioridades.md`, a semana e o **Diário**, que salva sozinho em `memory/diario/AAAA-MM-DD.md` (seção "Anotações do dia", `server/journal.ts`).
- **Espaço**: uma barra onde você pede o que precisa ("um to-do de conteúdo da semana", "um calendário das lives") e o Claude monta um mini app. Cada app vira um cartão flutuante: arraste pela barra, redimensione pelo canto, peça ajustes no lápis (com **Marcar** você clica na parte do app que quer mudar e o pedido vale só para ela) e dê dois cliques no título para renomear. O fundo é a mesma colmeia do mapa; os cartões são discretos, com o dourado do painel como destaque (o app recebe a cor como `--fos-accent`). É um canvas infinito: arraste o fundo (ou role com a roda e os dois dedos do trackpad) para andar para qualquer lado. O zoom fica no canto de baixo (−, %, +, **Ajustar** para mostrar todos os cartões) e também funciona com Ctrl + roda do mouse ou pinça no trackpad. A posição e o zoom ficam salvos no navegador. O Claude roda como `claude -p` na pasta do cérebro, só com leitura, e devolve um HTML (`server/widgets.ts`). O app roda num iframe isolado, sem rede, e fala com o painel pela ponte `window.fos` (guardar os próprios dados, ler e criar tarefas do cérebro, ler as prioridades). Tudo fica em `sessoes/espaco/`, fora do git.
- **Time**: os agentes e as tarefas em **Quadro**, **Lista** ou **Calendário**. O **Organograma** mostra quem coordena quem: no começo todo agente responde à Empresa. Arraste um agente para cima de outro para ele responder a esse, ou até a faixa **Você** para responder direto a você. **+ Novo chefe** cria um cargo que não é uma área (um Chief of Staff, um Head de Operações). O OpenBot não tem hierarquia própria: um chefe é um agente comum cujas instruções dizem quem ele coordena. **Avisar os chefes** manda essa mensagem a cada agente que tem alguém abaixo dele; um chefe que ainda não existe no OpenBot é pedido ao Dr. Eggbot. O organograma fica em `sessoes/agentes/organograma.json` (`server/org.ts`).
  - As tarefas moram em `memory/to-dos.md`, no formato da skill `/todo` (`## Abertos`, `## Concluídos`, `- [ ] Título` com `ID`, `Área`, `Prazo`), mais `Status`, `Agente`, `Projeto`, `Foco` e as notas (linhas recuadas). Assim o `/todo`, o Mission Control e os agentes veem a mesma lista (`server/tasks.ts`).
  - Clicar numa tarefa abre os detalhes: título, área, prazo, projeto e notas, salvos direto no cérebro. As notas vão junto quando a tarefa é mandada a um agente.
  - **Mandar para agente** (ou arrastar até o mascote ou até "Com agente"): a tarefa vai para o agente escolhido, ou para o da área dela ("Automático"; sem área, a Empresa). Quando o agente termina, o cartão vai para **Revisão**. **Aprovar** fecha a tarefa; **Devolver** manda o comentário de volta ao mesmo agente. A entrega no OpenBot fica fora do cérebro, em `sessoes/agentes/tarefas.json`.
  - No calendário, clicar num dia abre o dia à direita, com as tarefas e um campo para criar; arrastar uma tarefa muda o prazo.
  - Ao lado: o que espera você (aprovações e perguntas dos agentes), as pendências do wiki, a agenda das rotinas e a atividade.

Tudo se atualiza sozinho. A atividade e as rotinas vêm do banco do OpenBot (Node 22.5+).

### A conversa

- É a conversa do próprio OpenBot: o servidor lê o banco dele (`openbot.db`, na pasta do servidor) só para leitura, com o `node:sqlite` do Node 22.5+ (`server/openbotHistory.ts`). Aparece o que foi escrito aqui ou lá, os passos que o agente narra enquanto trabalha, a resposta e os eventos (instruções, skills, rotinas). Sem o `node:sqlite`, o app guarda ele mesmo o que foi dito por aqui.
- Aprovações e perguntas do agente aparecem na conversa, com botões.
- Só aqui: as páginas do cérebro que o agente cita viram links (abrem no leitor e o mapa vai até elas), uma resposta vira nota do cérebro com um clique, e uma resposta pode ser passada para outro agente.

### Configurar o OpenBot pelo front

- **Local scripts em todos os agentes.** O OpenBot tem um padrão do servidor para isso (Server settings › Agent defaults), guardado em `<dados do servidor>/openbot-agent-defaults-v1.json` (`allowAutomation`). **Ligar** grava esse padrão, mantendo os outros e guardando uma cópia `.bak`. O OpenBot só lê o arquivo ao abrir, então, se ele estiver aberto, o app pergunta antes de fechar e reabrir (`server/openbotSetup.ts`).
- **Configurar tudo** (`server/openbotTeam.ts`). O pedido completo vai num arquivo dentro do cérebro (`.openbot/montar-time.md`), porque uma mensagem da API tem no máximo 4.000 caracteres. Se o OpenBot cortar o turno no meio, o app manda de novo, até 3 vezes. Uma resposta sem o relatório final conta como falha.
- **Conector Segundo Cérebro** (`mcp/segundo-cerebro.mjs`, Node 18+, sem dependências): um servidor MCP local que dá aos agentes o cérebro ao vivo. As ferramentas são `visao_geral`, `buscar`, `ler_pagina`, `listar_skills`, `ler_skill`, `procurar_skill_parecida`, `salvar_skill` e `salvar_nota`. Ele lê o cérebro e só escreve notas em `fontes/notas/` e skills em `.claude/skills/`. **Regra de skill nova:** antes de salvar, o agente procura uma parecida; se houver, `salvar_skill` recusa e mostra qual, para ele editar a que existe (`editar: true`) em vez de duplicar. A skill vai para a área do agente (`area:` no frontmatter), e editar guarda a versão anterior em `.openbot/skills-anteriores/`. A regra também está nas instruções de todo agente. O Configurar tudo instala o conector; para instalar à mão, use Marketplace › Apps:

```
node <app>/mcp/segundo-cerebro.mjs --cerebro <pasta do cérebro>
```

- **Dr. Eggbot.** **Instalar** abre o link `openbot://marketplace/agents/openbot-curated-agent-dr-eggbot`, que leva para a página dele no OpenBot; lá é só adicionar. O app reconhece o agente pelo nome (qualquer um com "eggbot") e, quando ele existe, o Configurar tudo pede a montagem do time a ele (`pickBuilder` em `server/openbotTeam.ts`).
- **Plano B, sem Local scripts:** **Levar** gera o arquivo de importação oficial do OpenBot (`openbot-agent-import`, versão 1) em Downloads. Para importar, use Server settings › Import.

### A ficha de cada agente

No Organograma, o ícone no canto de cada agente abre a **ficha**: as skills que ele usa (as da área vêm marcadas; dá para tirar e somar skills de outras áreas), os conectores que pode usar (sem escolha, usa os que o OpenBot tiver) e regras próprias, uma por linha. **Salvar** muda o plano: o organograma, o **Configurar tudo** e o arquivo de importação já saem com a ficha. **Salvar e aplicar no OpenBot** manda a ficha ao agente que já existe, num arquivo em `.openbot/` dentro do cérebro: ele instala as skills novas e troca as próprias instruções. As fichas ficam em `sessoes/agentes/fichas.json` (`server/fichas.ts`).

### Criar um agente novo

No painel Configurar, **Criar um agente novo**: escolha um modelo (Prospecção, Conteúdo, Atendimento, Cobrança, Chief of Staff) ou comece do zero e descreva o processo. **Pedir ao Dr. Eggbot** manda o pedido com o método da skill `skills/criar-agente/`: quebrar o processo em etapas pequenas, marcar o que precisa de aprovação humana e definir a skill e o conector de cada etapa. O Eggbot pergunta o que faltar, mostra as etapas para você aprovar e cria o agente. Os modelos ficam em `skills/criar-agente/modelos/`; a mesma skill funciona no Claude Code (copie a pasta para `~/.claude/skills/`).

### A mesma coisa sem o front: a skill `/levar-para-openbot`

`skills/levar-para-openbot/` é uma skill do Claude Code que faz o desenho e o arquivo do OpenBot direto no terminal, para quem tem o segundo cérebro e não usa este app. Para instalar, copie a pasta para `~/.claude/skills/` e, dentro do cérebro, peça `/levar-para-openbot`.

As duas portas usam o mesmo núcleo, `skills/levar-para-openbot/scripts/openbot-import.mjs` (Node 18+, sem dependências): as instruções de desenho, a conferência do plano, os prompts e o zip. Mude a lógica só nele.

```
node skills/levar-para-openbot/scripts/openbot-import.mjs instrucoes
node skills/levar-para-openbot/scripts/openbot-import.mjs montar --cerebro <pasta> --plano <plano.json> [--saida <pasta>] [--sem-abrir]
```

**O que cada pessoa precisa:** Node, o Claude Code logado (o desenho roda na conta dela) e o OpenBot instalado. Funciona melhor com a estrutura do Founders OS: `wiki/<departamento>/` e skills em `.claude/skills/<slug>/SKILL.md` com `area:` e, nas rotinas, `schedule:` ("Todo dia, 8h", "Sextas, 16h", "Dia 1º, 8h"). Uma rotina com horário em outro formato fica de fora, com aviso.