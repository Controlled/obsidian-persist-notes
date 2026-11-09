# Persist Notes para o Obsidian

[English](README.md)

Se a sua pasta de notas do [Persist Notes](https://persistnotes.com) está dentro de um cofre do Obsidian, este plugin mostra o que importa das suas reuniões sem sair do Obsidian:

- **Ações**: os to-dos pendentes dos "Próximos passos" de cada resumo, agrupados por projeto e reunião, com responsável e prazo. Ao marcar uma ação, o plugin grava `[x]` na linha exata da nota de origem.
- **Projetos**: cada pasta de projeto com a síntese viva (`_synthesis.md`), renderizada como Markdown. Os links abrem as notas das reuniões.

Os títulos das seções são reconhecidos em português, inglês e espanhol. A interface do plugin segue o idioma do Obsidian (português ou inglês).

## Como funciona

- Os `.md` são a fonte da verdade. O plugin não tem banco de dados e só altera a caixa que você marcar.
- Antes de gravar, confere se a linha continua igual (você ou o app podem ter editado a nota). Se não estiver, mostra um aviso e atualiza a lista em vez de gravar no lugar errado.
- Só as caixas do resumo viram ações; as das suas anotações e da transcrição são ignoradas (mesma regra do app).
- Nada sai do seu computador: o plugin não faz nenhuma requisição de rede.

## Configuração

1. Instale o plugin (Plugins da comunidade → Procurar → "Persist Notes") ou copie `main.js`, `manifest.json` e `styles.css` para `<cofre>/.obsidian/plugins/persist-notes/`.
2. Ative. O plugin acha a pasta do Persist Notes sozinho (as reuniões têm `title`, `date` e `status`/`source` no frontmatter; os projetos têm `_synthesis.md`).
3. Se escolher a pasta errada, indique-a em Configurações → Persist Notes (caminho relativo ao cofre; `/` para a raiz do cofre).
4. Clique no ícone da barra lateral (lista de tarefas) ou use o comando "Persist Notes: Abrir ações e projetos".

Dica: para ter as notas dentro de um cofre, escolha no app Persist Notes uma pasta do cofre como pasta de notas, ou abra a própria pasta de notas como cofre.

## Desenvolvimento

```bash
npm install
npm run build   # checagem de tipos + main.js
npm run dev     # recompila ao salvar
```

`src/parser.js` tem a lógica pura (port do parser do app) e é testado no repositório do app.

## Licença

MIT
