# Persist Notes for Obsidian

[Português](README.pt-BR.md)

If your [Persist Notes](https://persistnotes.com) notes folder is inside an Obsidian vault, this plugin shows what matters from your meetings without leaving Obsidian:

- **Actions**: the pending to-dos from the "Next steps" of every meeting summary, grouped by project and meeting, with owner and due date. Check one off and the plugin writes `[x]` on the exact line of the source note.
- **Projects**: each project folder with its living synthesis (`_synthesis.md`), rendered as Markdown. Links open the meeting notes.

Section titles are recognized in English, Portuguese and Spanish. The plugin's interface follows Obsidian's language (English or Portuguese).

## How it works

- Your `.md` files are the source of truth. The plugin keeps no database and changes only the checkbox you click.
- Before writing, it checks that the line is still the same (you or the Persist Notes app may have edited the note). If it is not, it shows a notice and refreshes the list instead of writing in the wrong place.
- Only checkboxes in the summary count as actions; checkboxes in your own notes section and in the transcript are ignored (same rule as the app).
- Nothing leaves your computer: the plugin makes no network requests.

## Setup

1. Install the plugin (Community plugins → Browse → "Persist Notes"), or copy `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/persist-notes/`.
2. Enable it. The plugin finds the Persist Notes folder automatically (meeting notes have `title`, `date` and `status`/`source` in the frontmatter; projects have `_synthesis.md`).
3. If it picks the wrong folder, set it in Settings → Persist Notes (path relative to the vault; `/` for the vault root).
4. Click the ribbon icon (checklist) or run the command "Persist Notes: Open actions and projects".

Tip: to keep the notes inside a vault, choose a folder in the vault as the notes folder in the Persist Notes app, or open the notes folder itself as a vault.

## Development

```bash
npm install
npm run build   # type-check + main.js
npm run dev     # rebuild on change
```

`src/parser.js` holds the pure logic (a port of the Persist Notes app parser) and is tested in the app repository.

## License

MIT
