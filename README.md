# Founders OS

O frontend do cérebro: o mapa do wiki em `../founders-os-brain`, com o design "Cérebro v3" do Claude Design. Uso local.

## Como rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:5178. Para ler outra pasta de cérebro, use `BRAIN_DIR=/caminho/do/cerebro npm run dev`.

Para o Rodar e o Processar funcionarem, o `claude` precisa estar no PATH e logado (`claude auth login`, uma vez). `CLAUDE_BIN=/caminho/do/claude` troca o executável.

O app escreve no cérebro só as notas, em `fontes/notas/`. O resultado das sessões do Claude fica fora do cérebro, em `sessoes/`, aqui no app. As sessões escrevem no cérebro conforme a permissão de cada uma (abaixo). Os ajustes do Personalizar e os itens tirados do mapa ficam no `localStorage` do navegador.

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
  - **Rodar:** tem todas as ferramentas (web, Bash e os conectores). Edita o cérebro, menos `wiki/`, que só muda com aceite (pelo Processar). Os conectores (Notion, ClickUp, etc.) vêm da config do app Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json`), que o `claude -p` não lê sozinho; o `--mcp-config` em `server/runs.ts` aponta para ela. Testado em 2026-10-19 com `/historia-porco-lobo` (cria uma página no Notion e devolve o link).
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
