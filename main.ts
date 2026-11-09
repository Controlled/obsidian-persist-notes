// Plugin "Persist Notes" para o Obsidian: mostra as ações (to-dos dos "Próximos passos") e as sínteses dos projetos
// das notas de reunião do Persist Notes que estão dentro do cofre. Os .md são a fonte da verdade: marcar uma ação
// grava [x] na linha de origem, com a mesma conferência do app (a linha precisa continuar igual).
import {
  App, ItemView, MarkdownRenderer, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf,
  debounce, getLanguage, moment, normalizePath, setIcon,
} from 'obsidian';
import { classify, detectRoot, isProjectDir, parseCommitments, toggleTask, SYNTHESIS_FILE, Task } from './src/parser';

const VIEW_TYPE = 'persist-notes-view';

// ---------- Textos (inglês e português, pelo idioma do Obsidian) ----------

const STRINGS = {
  en: {
    open: 'Open actions and projects', actions: 'Actions', projects: 'Projects', noProject: 'No project', refresh: 'Refresh',
    noFolder: 'No Persist Notes folder found in this vault. Set the folder in Settings → Persist Notes.',
    noActions: 'No pending actions.', noProjects: 'No projects yet. Projects are the subfolders of the Persist Notes folder.',
    noSynthesis: 'This project has no synthesis yet. Open the project in Persist Notes to generate it.',
    meetings: (n: number) => `${n} meeting${n === 1 ? '' : 's'}`, showDone: 'Show completed actions',
    showDoneDesc: 'Also list the actions already marked as done.',
    folder: 'Persist Notes folder', folderDesc: 'Path relative to the vault. Leave empty to detect it automatically; use "/" for the vault root.',
    detect: 'Detect', detected: (p: string) => `Detected: ${p || '/'}`, notDetected: 'No Persist Notes meetings found in this vault.',
    changed: 'This action changed in the file since the list was loaded. The list was refreshed; try again.',
    writeError: (m: string) => `Could not update the note: ${m}`,
  },
  pt: {
    open: 'Abrir ações e projetos', actions: 'Ações', projects: 'Projetos', noProject: 'Sem projeto', refresh: 'Atualizar',
    noFolder: 'Nenhuma pasta do Persist Notes encontrada neste cofre. Indique a pasta em Configurações → Persist Notes.',
    noActions: 'Nenhuma ação pendente.', noProjects: 'Nenhum projeto ainda. Os projetos são as subpastas da pasta do Persist Notes.',
    noSynthesis: 'Este projeto ainda não tem síntese. Abra o projeto no Persist Notes para gerá-la.',
    meetings: (n: number) => `${n} ${n === 1 ? 'reunião' : 'reuniões'}`, showDone: 'Mostrar ações concluídas',
    showDoneDesc: 'Lista também as ações já marcadas como feitas.',
    folder: 'Pasta do Persist Notes', folderDesc: 'Caminho relativo ao cofre. Deixe vazio para detectar sozinho; use "/" para a raiz do cofre.',
    detect: 'Detectar', detected: (p: string) => `Detectada: ${p || '/'}`, notDetected: 'Nenhuma reunião do Persist Notes encontrada neste cofre.',
    changed: 'Esta ação mudou no arquivo desde que a lista foi carregada. A lista foi atualizada; tente de novo.',
    writeError: (m: string) => `Não foi possível atualizar a nota: ${m}`,
  },
};
type Strings = typeof STRINGS.en;

function uiLang(): string {
  try { if (typeof getLanguage === 'function') return getLanguage(); } catch (_) { /* Obsidian < 1.8.7 */ }
  return moment.locale();
}
const T: Strings = String(uiLang()).toLowerCase().startsWith('pt') ? STRINGS.pt : STRINGS.en;

// ---------- Configurações ----------

interface Settings { folder: string; showDone: boolean; tab: 'actions' | 'projects'; }
const DEFAULTS: Settings = { folder: '', showDone: false, tab: 'actions' };

export default class PersistNotesPlugin extends Plugin {
  settings: Settings = { ...DEFAULTS };
  private detected: string | null | undefined; // cache da detecção automática

  async onload() {
    this.settings = { ...DEFAULTS, ...(await this.loadData()) };
    this.registerView(VIEW_TYPE, leaf => new PersistNotesView(leaf, this));
    this.addRibbonIcon('list-checks', 'Persist Notes', () => this.activateView());
    this.addCommand({ id: 'open', name: T.open, callback: () => this.activateView() });
    this.addSettingTab(new PersistNotesSettingTab(this.app, this));
    // Qualquer mudança nas notas atualiza a tela (com intervalo, para não reler a cada tecla).
    const refresh = debounce(() => this.refreshViews(), 800, true);
    const onChange = () => { this.detected = undefined; refresh(); };
    this.registerEvent(this.app.vault.on('modify', onChange));
    this.registerEvent(this.app.vault.on('create', onChange));
    this.registerEvent(this.app.vault.on('delete', onChange));
    this.registerEvent(this.app.vault.on('rename', onChange));
    this.registerEvent(this.app.metadataCache.on('resolved', () => { if (this.detected === null) onChange(); }));
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.detected = undefined;
    this.refreshViews();
  }

  // Pasta do Persist Notes ('' = raiz do cofre) ou null se não houver.
  root(): string | null {
    const f = this.settings.folder.trim();
    if (f === '/') return '';
    if (f) return normalizePath(f);
    if (this.detected === undefined) this.detected = this.detect();
    return this.detected;
  }

  detect(): string | null {
    const files = this.app.vault.getMarkdownFiles().map(file => ({
      path: file.path, frontmatter: this.app.metadataCache.getFileCache(file)?.frontmatter || null,
    }));
    return detectRoot(files);
  }

  async activateView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (!leaf) {
      leaf = workspace.getRightLeaf(false) ?? workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof PersistNotesView) leaf.view.render();
    }
  }
}

// ---------- Tela ----------

interface Meeting { file: TFile; title: string; date: string; project: string; }

class PersistNotesView extends ItemView {
  private renderSeq = 0;

  constructor(leaf: WorkspaceLeaf, private plugin: PersistNotesPlugin) { super(leaf); }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Persist Notes'; }
  getIcon() { return 'list-checks'; }
  async onOpen() { await this.render(); }

  // Reuniões dentro da pasta do Persist Notes (raiz = sem projeto; subpastas = projetos).
  private meetings(root: string): Meeting[] {
    const out: Meeting[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      const c = classify(file.path, root);
      if (!c || c.kind !== 'meeting') continue;
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
      if (fm.type === 'period_summary') continue;
      out.push({ file, title: String(fm.title || file.basename), date: String(fm.date || ''), project: c.project });
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }

  async render() {
    const seq = ++this.renderSeq;
    const el = this.contentEl;
    const root = this.plugin.root();
    const body = createDiv({ cls: 'pn-body' });

    if (root === null) body.createEl('p', { cls: 'pn-empty', text: T.noFolder });
    else if (this.plugin.settings.tab === 'actions') await this.renderActions(body, root);
    else await this.renderProjects(body, root);
    if (seq !== this.renderSeq) return; // outra atualização começou enquanto esta lia os arquivos

    el.empty();
    el.addClass('pn-view');
    const bar = el.createDiv({ cls: 'pn-tabs' });
    for (const tab of ['actions', 'projects'] as const) {
      const b = bar.createEl('button', { text: tab === 'actions' ? T.actions : T.projects, cls: 'pn-tab' });
      if (this.plugin.settings.tab === tab) b.addClass('is-active');
      b.onclick = async () => { this.plugin.settings.tab = tab; await this.plugin.saveData(this.plugin.settings); this.render(); };
    }
    const r = bar.createEl('button', { cls: 'pn-refresh clickable-icon', attr: { 'aria-label': T.refresh } });
    setIcon(r, 'refresh-cw');
    r.onclick = () => this.render();
    el.appendChild(body);
  }

  private async renderActions(body: HTMLElement, root: string) {
    const showDone = this.plugin.settings.showDone;
    const groups = new Map<string, { meeting: Meeting; tasks: Task[] }[]>();
    for (const m of this.meetings(root)) {
      const tasks = parseCommitments(await this.app.vault.cachedRead(m.file), m.file.path).filter(t => showDone || !t.done);
      if (!tasks.length) continue;
      if (!groups.has(m.project)) groups.set(m.project, []);
      groups.get(m.project)!.push({ meeting: m, tasks });
    }
    if (!groups.size) { body.createEl('p', { cls: 'pn-empty', text: T.noActions }); return; }
    // Projetos em ordem alfabética; "Sem projeto" por último.
    const names = [...groups.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
    for (const name of names) {
      const sec = body.createDiv({ cls: 'pn-group' });
      sec.createEl('h4', { cls: 'pn-project', text: name || T.noProject });
      for (const { meeting, tasks } of groups.get(name)!) {
        const head = sec.createDiv({ cls: 'pn-meeting' });
        const link = head.createEl('a', { text: meeting.title, cls: 'pn-link' });
        link.onclick = () => this.app.workspace.getLeaf(false).openFile(meeting.file);
        if (meeting.date) head.createSpan({ cls: 'pn-date', text: meeting.date.slice(0, 10) });
        const ul = sec.createEl('ul', { cls: 'pn-tasks contains-task-list' });
        for (const task of tasks) this.renderTask(ul, meeting.file, task);
      }
    }
  }

  private renderTask(ul: HTMLElement, file: TFile, task: Task) {
    const li = ul.createEl('li', { cls: 'pn-task task-list-item' });
    const box = li.createEl('input', { type: 'checkbox', cls: 'task-list-item-checkbox' });
    box.checked = task.done;
    const text = li.createDiv({ cls: 'pn-task-text' });
    text.createSpan({ cls: 'pn-action', text: task.action });
    const meta = [task.owner, task.due].filter(Boolean).join(' · ');
    if (meta) text.createSpan({ cls: 'pn-meta', text: meta });
    box.onchange = async () => {
      box.disabled = true;
      try {
        // vault.process lê o conteúdo atual e grava de forma atômica; toggleTask confere a linha antes.
        await this.app.vault.process(file, data => toggleTask(data, task.line, task.raw, box.checked).md);
      } catch (e) {
        const err = e as Error & { code?: string };
        new Notice(err.code === 'TODO_CHANGED' ? T.changed : T.writeError(err.message));
      }
      this.render();
    };
  }

  private async renderProjects(body: HTMLElement, root: string) {
    const folder = root ? this.app.vault.getAbstractFileByPath(root) : this.app.vault.getRoot();
    // Dois níveis (app 0.16.0): uma pasta com _group.md ou com subpastas de projeto é um projeto-pai (só agrupa);
    // as subpastas dele são os projetos, com o nome 'Pai/Projeto'.
    const subdirs = (f: TFolder) => f.children.filter((c): c is TFolder => c instanceof TFolder && isProjectDir(c.name));
    const leaves: { folder: TFolder; name: string }[] = [];
    if (folder instanceof TFolder) {
      for (const top of subdirs(folder).sort((a, b) => a.name.localeCompare(b.name))) {
        const kids = subdirs(top).sort((a, b) => a.name.localeCompare(b.name));
        const isGroup = kids.length > 0 || top.children.some(c => c instanceof TFile && c.name === '_group.md');
        if (isGroup) for (const k of kids) leaves.push({ folder: k, name: `${top.name}/${k.name}` });
        else leaves.push({ folder: top, name: top.name });
      }
    }
    if (!leaves.length) { body.createEl('p', { cls: 'pn-empty', text: T.noProjects }); return; }
    const all = this.meetings(root);
    for (const p of leaves) {
      const det = body.createEl('details', { cls: 'pn-project-card' });
      const sum = det.createEl('summary');
      sum.createSpan({ cls: 'pn-project', text: p.name.replace('/', ' / ') });
      sum.createSpan({ cls: 'pn-date', text: T.meetings(all.filter(m => m.project === p.name).length) });
      const content = det.createDiv({ cls: 'pn-synthesis markdown-rendered' });
      let loaded = false;
      det.addEventListener('toggle', async () => {
        if (!det.open || loaded) return;
        loaded = true;
        await this.renderSynthesis(content, p.folder, all.filter(m => m.project === p.name));
      });
    }
  }

  private async renderSynthesis(el: HTMLElement, project: TFolder, meetings: Meeting[]) {
    const path = normalizePath(`${project.path}/${SYNTHESIS_FILE}`);
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      // Sem o frontmatter; os links das reuniões (relativos à pasta do projeto) abrem a nota.
      const md = (await this.app.vault.cachedRead(file)).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
      await MarkdownRenderer.render(this.app, md, el, path, this);
      el.addEventListener('click', ev => {
        const a = (ev.target as HTMLElement).closest('a.internal-link') as HTMLAnchorElement | null;
        if (!a) return;
        ev.preventDefault();
        const href = a.getAttribute('data-href') || a.getAttribute('href') || '';
        this.app.workspace.openLinkText(decodeURIComponent(href), path, ev.metaKey || ev.ctrlKey);
      });
      return;
    }
    el.createEl('p', { cls: 'pn-empty', text: T.noSynthesis });
    const ul = el.createEl('ul');
    for (const m of meetings) {
      const a = ul.createEl('li').createEl('a', { text: m.title, cls: 'pn-link' });
      a.onclick = () => this.app.workspace.getLeaf(false).openFile(m.file);
    }
  }
}

// ---------- Aba de configurações ----------

class PersistNotesSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: PersistNotesPlugin) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const info = createDiv({ cls: 'setting-item-description' });
    new Setting(containerEl)
      .setName(T.folder)
      .setDesc(T.folderDesc)
      .addText(text => text.setPlaceholder('Persist Notes').setValue(this.plugin.settings.folder)
        .onChange(async v => { this.plugin.settings.folder = v.trim(); await this.plugin.saveSettings(); }))
      .addButton(b => b.setButtonText(T.detect).onClick(() => {
        const found = this.plugin.detect();
        info.setText(found === null ? T.notDetected : T.detected(found));
      }));
    containerEl.appendChild(info);
    new Setting(containerEl)
      .setName(T.showDone)
      .setDesc(T.showDoneDesc)
      .addToggle(tg => tg.setValue(this.plugin.settings.showDone)
        .onChange(async v => { this.plugin.settings.showDone = v; await this.plugin.saveSettings(); }));
  }
}
