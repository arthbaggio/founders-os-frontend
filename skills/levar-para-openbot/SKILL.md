---
name: levar-para-openbot
description: >
  Lê o segundo cérebro da empresa, desenha o time de agentes de IA (quais agentes, a missão, as
  skills e as rotinas de cada um) e gera o arquivo de importação oficial do OpenBot, com todos os
  agentes, skills, rotinas com horário e um grupo com o time. Ative com /levar-para-openbot,
  "levar meu cérebro para o OpenBot", "criar meus agentes no OpenBot", "montar o time de agentes"
  ou equivalente.
---

# Levar o segundo cérebro para o OpenBot

Faz o mesmo que o botão **Agentes › Levar** do Founders OS, mas pelo Claude Code: serve para quem
tem o segundo cérebro e não usa o front. A lógica é a do script `scripts/openbot-import.mjs`, ao
lado deste arquivo (o mesmo que o Founders OS usa). Precisa de Node 18 ou mais novo.

## Passo a passo

1. **Ache o cérebro.** É a pasta com `wiki/` e `.claude/skills/`. Em geral, a pasta onde a sessão
   está. Se não for, pergunte o caminho. Confirme que existe antes de seguir.

2. **Leia as instruções de desenho.** Rode:
   ```
   node "<pasta desta skill>/scripts/openbot-import.mjs" instrucoes --cerebro "<cérebro>"
   ```
   e siga o que ele imprimir, lendo o cérebro. Não grave nada dentro do cérebro.

3. **Mostre o time proposto.** Antes de gerar o arquivo, mostre para a pessoa, em poucas linhas
   por agente: nome, missão, skills e rotinas. Mostre também as lacunas (`gaps`). Pergunte se quer
   mudar algo e ajuste o plano se ela pedir.

4. **Grave o plano** num arquivo temporário, FORA do cérebro (por exemplo, a pasta temporária do
   sistema), com o JSON no formato das instruções.

5. **Gere o arquivo do OpenBot.** Rode:
   ```
   node "<pasta desta skill>/scripts/openbot-import.mjs" montar --cerebro "<cérebro>" --plano "<plano.json>"
   ```
   O script confere o plano, monta o prompt de cada agente, grava
   `openbot-founders-os-<data>.zip` em Downloads, mostra o arquivo e abre o OpenBot. Ele responde
   um JSON com o caminho do arquivo, os números e os avisos (`warnings`). Use `--sem-abrir` se a
   pessoa não quiser que o OpenBot abra agora.

6. **Diga o que fazer no OpenBot**, curto:
   - abra **Server settings › Import** e escolha o arquivo (diga o nome e a pasta);
   - para conversar com um agente por scripts ou pelo Founders OS, ligue **Local scripts** nas
     permissões dele.
   Repita cada aviso do script, com o que fazer.

## Regras

- O cérebro só é lido. O plano e o zip ficam fora dele.
- Use só skills e rotinas que existem em `.claude/skills/`. O script descarta as que não existem.
- Se o script disser que o plano não tem agente válido, corrija o JSON e rode de novo.
- Não instale nem configure o OpenBot pela pessoa: a importação é um clique dela.
