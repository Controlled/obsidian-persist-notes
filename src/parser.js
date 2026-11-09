// Lógica pura do plugin (sem a API do Obsidian), para poder ser testada no Node.
// É um port de lib/commitments.js (parseTaskText, parseCommitments, setDone), das partes usadas de lib/vocab.js
// (títulos das seções em pt/en/es), de lib/dueDate.js (isDueText) e de lib/text.js (normalize) do app.
// test/packages.tests.js confere que este parser devolve as mesmas ações que o do app; ao mudar o parser do app,
// atualize este arquivo junto.
'use strict';

// ---------- Texto (lib/text.js) ----------

function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------- Seções (lib/vocab.js) ----------

const SECTIONS = {
  nextSteps: { pt: 'Próximos passos', en: 'Next steps', es: 'Próximos pasos' },
  annotations: { pt: 'Anotações', en: 'Notes', es: 'Notas' },
  transcript: { pt: 'Transcrição', en: 'Transcript', es: 'Transcripción' },
  meetings: { pt: 'Reuniões', en: 'Meetings', es: 'Reuniones' },
};
const LANGS = ['pt', 'en', 'es'];
const sectionNames = kind => LANGS.map(l => SECTIONS[kind][l]);
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headingRe = (kind, flags = 'm') => new RegExp(`^##[ \\t]+(?:${sectionNames(kind).map(escapeRe).join('|')})[ \\t]*\\r?$`, flags);

// ---------- Prazos (lib/dueDate.js) ----------

const WEEKDAYS = {
  domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5,
};
const WEEKDAY_RE = Object.keys(WEEKDAYS).join('|');
const MONTHS = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
  feb: 1, apr: 3, may: 4, aug: 7, sep: 8, oct: 9, dec: 11, ene: 0, dic: 11,
};
const MONTH_NAME = /^(jan(eiro|uary)?|fev(ereiro)?|feb(ruary|rero)?|mar(co|ch|zo)?|abr(il)?|apr(il)?|mai(o)?|may(o)?|jun(ho|e|io)?|jul(ho|y|io)?|ago(sto)?|aug(ust)?|set(embro|iembre)?|sep(t|tember|tiembre)?|out(ubro)?|oct(ober|ubre)?|nov(embro|ember|iembre)?|dez(embro)?|dec(ember)?|dic(iembre)?|ene(ro)?)$/;

const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const endOfMonth = (y, m) => new Date(y, m + 1, 0);
const fridayOf = d => d.getDay() <= 5 ? addDays(d, 5 - d.getDay()) : d;

function validDate(y, m, d) {
  const x = new Date(y, m, d);
  return x.getFullYear() === y && x.getMonth() === m && x.getDate() === d ? x : null;
}
function withYear(base, m, d, y) {
  if (y !== undefined) return validDate(y < 100 ? 2000 + y : y, m, d);
  let x = validDate(base.getFullYear(), m, d);
  if (x && x < addDays(base, -60)) x = validDate(base.getFullYear() + 1, m, d);
  return x;
}

// Data do prazo a partir da data da reunião, ou null se o texto não for um prazo reconhecido.
function resolveDue(text, meetingDate, lang) {
  const whole = resolveOne(text, meetingDate, lang);
  if (whole || !text) return whole;
  for (const part of String(text).split(/\s*[,;()]\s*|\s+[—–-]\s+/)) {
    const d = part.trim() && resolveOne(part, meetingDate, lang);
    if (d) return d;
  }
  return null;
}
const isDueText = text => !!resolveDue(text, new Date(2026, 0, 7));

function resolveOne(text, meetingDate, lang) {
  const raw = new Date(meetingDate);
  if (!text || isNaN(raw)) return null;
  const base = startOfDay(raw);
  let t = normalize(text).replace(/[.!;,]+$/, '').replace(/\s+/g, ' ').trim();
  for (let prev = ''; prev !== t;) {
    prev = t;
    t = t.replace(/^(prazo:?|due:?|deadline:?|plazo:?|ate|para|pra|no dia|dia|no|na|em|o|a|by|until|till|before|on|the|due by|hasta|antes del?|el|la|en)\s+/, '').trim();
  }
  let m;
  const isMonth = w => MONTH_NAME.test(w || '');
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) return validDate(+m[1], +m[2] - 1, +m[3]);
  if ((m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(t))) {
    let [d, mo] = [+m[1], +m[2]];
    if ((lang === 'en' && mo <= 12 && d <= 12) || (d <= 12 && mo > 12)) [d, mo] = [mo, d];
    return withYear(base, mo - 1, d, m[3] === undefined ? undefined : +m[3]);
  }
  if ((m = /^(\d{1,2})(?: de)? ([a-z]+)(?:,? (?:de )?(\d{4}))?$/.exec(t)) && isMonth(m[2]) && MONTHS[m[2].slice(0, 3)] !== undefined) {
    return withYear(base, MONTHS[m[2].slice(0, 3)], +m[1], m[3] === undefined ? undefined : +m[3]);
  }
  if ((m = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(t)) && isMonth(m[1]) && MONTHS[m[1].slice(0, 3)] !== undefined) {
    return withYear(base, MONTHS[m[1].slice(0, 3)], +m[2], m[3] === undefined ? undefined : +m[3]);
  }
  if (/^(hoje|hoje a (tarde|noite)|fim do dia|final do dia|ainda hoje|today|tonight|end of (the )?day|eod|hoy|hoy mismo|fin del dia)$/.test(t)) return base;
  if (/^(amanha( cedo| de manha| a tarde)?|tomorrow( morning| afternoon)?|manana( temprano| por la manana| por la tarde)?)$/.test(t)) return addDays(base, 1);
  if (/^(depois de amanha|(the )?day after tomorrow|pasado manana)$/.test(t)) return addDays(base, 2);
  if ((m = new RegExp(`^(?:(?:esta|essa|nesta|nessa|este|esse|proxima|proximo|a proxima|na proxima|this|next|this coming|el proximo|proximo)\\s+)?(${WEEKDAY_RE})(?:-feira| feira)?(?: que vem| que viene)?$`).exec(t))) {
    const diff = (WEEKDAYS[m[1]] - base.getDay() + 7) % 7 || 7;
    return addDays(base, diff);
  }
  if (/^(fim|final) (da|de) semana$|^(esta|essa|nesta|nessa) semana$|^(end of (the )?week|this week|eow)$|^(fin de (la )?semana|esta semana)$/.test(t)) return fridayOf(base);
  if (/^(semana que vem|(a )?proxima semana|next week|(la )?(proxima semana|semana que viene))$/.test(t)) return fridayOf(addDays(base, 7 - base.getDay() + 1));
  if (/^(fim|final) do mes$|^(este|esse|neste|nesse) mes$|^(end of (the )?month|this month|eom)$|^(fin de(l)? mes|este mes)$/.test(t)) return endOfMonth(base.getFullYear(), base.getMonth());
  if (/^(mes que vem|(o )?proximo mes|next month|(el )?(proximo mes|mes que viene))$/.test(t)) return endOfMonth(base.getFullYear(), base.getMonth() + 1);
  if ((m = /^(?:daqui a |in |within |dentro de )?(\d{1,3}) (dias?|semanas?|days?|weeks?|business days?)( uteis| habiles)?$/.exec(t))) return addDays(base, +m[1] * (/^(semana|week)/.test(m[2]) ? 7 : 1));
  if ((m = /^(?:(inicio|comeco|meados|metade|fim|final|principios|comienzos|mediados|finales|fin) d[eo]l? |(early|mid|late|end of|beginning of|the end of|middle of) )?([a-z]{3})[a-z]*(?:,? (?:de )?(\d{4}))?$/.exec(t)) && MONTHS[m[3]] !== undefined && MONTH_NAME.test(t.split(' ').find(w => w.startsWith(m[3])) || '')) {
    m = [m[0], m[1] || m[2], m[3], m[4]];
    const dd = !m[1] ? 0 : /inicio|comeco|principios|comienzos|early|beginning/.test(m[1]) ? 1 : /meados|metade|mediados|mid|middle/.test(m[1]) ? 15 : 0;
    const y = m[3] ? +m[3] : undefined;
    if (dd) return withYear(base, MONTHS[m[2]], dd, y);
    const first = withYear(base, MONTHS[m[2]], 1, y);
    return first && endOfMonth(first.getFullYear(), first.getMonth());
  }
  return null;
}

// ---------- To-dos (lib/commitments.js) ----------

const TASK_RE = /^(\s*[-*+]\s+\[)( |x|X)(\]\s+)(.*)$/;
const UNKNOWN = /^(\?+|n\/?a|-+|a definir|indefinido|desconhecido|n[ãa]o (mencionado|definido|informado|especificado)|sem respons[áa]vel|sem prazo|tbd|tba|unknown|unassigned|not (specified|mentioned|defined)|no (owner|deadline|due date)|none|por definir|desconocido|no (especificado|mencionado|definido)|sin responsable|sin plazo|sin fecha)$/i;
const known = s => { const t = String(s || '').trim(); return UNKNOWN.test(t) ? '' : t; };
const NAME_RE = /^\p{Lu}[\p{L}.'-]*(?:,?\s+(?:e|y|and|de|da|do|das|dos|del|la|\p{Lu}[\p{L}.'-]*))*$/u;
const DASH = '[—–-]';

// "Enviar a planilha — **Ana** (sexta)" → { action, owner: 'Ana', due: 'sexta' }
function parseTaskText(text) {
  const original = String(text).trim();
  let rest = original;
  let due = '', owner = '', extra = '';
  const dueOk = s => UNKNOWN.test(s) || isDueText(s);
  const dm = /\s*\(([^()]*)\)\s*\.?$/.exec(rest);
  const DUE_LABEL = /^(prazo|due|deadline|plazo|fecha l[íi]mite):?\s*/i;
  if (dm && dueOk(dm[1].replace(DUE_LABEL, '').trim())) { due = dm[1].replace(DUE_LABEL, '').trim(); rest = rest.slice(0, dm.index).trim(); }
  const om = /\*\*([^*]+)\*\*([^*]*)$/.exec(rest);
  const tail = om ? om[2].trim() : '';
  const tailDue = om && tail && new RegExp(`^(?:[,;]|${DASH})?\\s*(?:(?:prazo|due|plazo):?\\s*)?(.+)$`, 'i').exec(tail);
  const tailParen = /^\(([^()]*)\)\s*\.?$/.exec(tail);
  if (om && (!tail || tailParen || (tailDue && !due && /^(?:[,;]|[—–-]|prazo|due|plazo|at[ée]\s|by\s|until\s|hasta\s)/i.test(tail)))) {
    owner = om[1].replace(/^(respons[áa]vel|owner|responsable):?\s*/i, '').trim();
    if (tailParen) extra = tailParen[1].trim();
    else if (tail && dueOk(tailDue[1].trim())) due = tailDue[1].trim();
    else if (tail) extra = tail.replace(/^[,;—–-]\s*/, '');
    rest = rest.slice(0, om.index).trim().replace(/(respons[áa]vel|owner|responsable):?\s*$/i, '').trim();
  } else if (!om) {
    const parts = rest.split(new RegExp(`\\s+${DASH}+\\s+`));
    if (parts.length > 1 && !due && /^(prazo:?\s*|at[ée]\s)/i.test(parts[parts.length - 1])) {
      const t = parts.pop().replace(/^prazo:?\s*/i, '').trim();
      if (dueOk(t)) due = t; else extra = t;
    }
    if (parts.length > 1) {
      const last = parts[parts.length - 1].trim();
      const byLabel = /^(?:respons[áa]vel|owner|responsable):?\s*(.+)$/i.exec(last);
      if (byLabel || (NAME_RE.test(last) && last.split(/\s+/).length <= 4)) {
        owner = byLabel ? byLabel[1].trim() : last;
        parts.pop();
      }
    }
    rest = parts.join(' — ');
  }
  let action = rest.replace(new RegExp(`\\s*${DASH}+\\s*$`), '').replace(/\*\*/g, '').trim();
  if (extra) action += ` (${extra})`;
  return { action: action || original, owner: known(owner), due: known(due) };
}

// To-dos da parte do resumo (antes das anotações e da transcrição). line = índice da linha no arquivo.
// Checkboxes das anotações do usuário não viram ações (mesma regra do app).
function parseCommitments(md, file = '') {
  const lines = String(md).split('\n');
  const isH = (l, kind) => headingRe(kind, '').test(l);
  const tIdx = lines.findIndex(l => isH(l.replace(/\r$/, ''), 'transcript'));
  const aIdx = lines.findIndex((l, i) => isH(l.replace(/\r$/, ''), 'annotations') && (tIdx < 0 || i < tIdx));
  const end = aIdx >= 0 ? aIdx : tIdx < 0 ? lines.length : tIdx;
  const out = [];
  for (let i = 0; i < end; i++) {
    const m = TASK_RE.exec(lines[i].replace(/\r$/, ''));
    if (!m) continue;
    out.push({ file, line: i, raw: lines[i].replace(/\r$/, ''), done: m[2] !== ' ', ...parseTaskText(m[4]) });
  }
  return out;
}

// Marca/desmarca o to-do no texto da nota (port do setDone, sem disco: devolve o texto novo).
// Confere se a linha ainda é a mesma; se o arquivo mudou, procura a linha idêntica. Se não achar
// (ou achar repetida), lança erro com code 'TODO_CHANGED' em vez de gravar no lugar errado.
function toggleTask(md, line, raw, done) {
  const lines = String(md).split('\n');
  const same = i => lines[i] !== undefined && lines[i].replace(/\r$/, '') === raw;
  let idx = same(line) ? line : -1;
  if (idx < 0) {
    const hits = lines.map((_, i) => i).filter(same);
    if (hits.length === 1) idx = hits[0];
  }
  if (idx < 0) {
    const e = new Error('The to-do changed in the file. The list was refreshed.');
    e.code = 'TODO_CHANGED';
    throw e;
  }
  const cr = lines[idx].endsWith('\r') ? '\r' : '';
  const updated = raw.replace(TASK_RE, (_m, a, _c, b, t) => `${a}${done ? 'x' : ' '}${b}${t}`);
  lines[idx] = updated + cr;
  return { md: lines.join('\n'), line: idx, raw: updated, done: !!done };
}

// ---------- Pasta do Persist Notes no cofre ----------

// Identificadores fixos do formato (README do app, "Fixed identifiers").
const SYNTHESIS_FILE = '_synthesis.md';
const GROUP_FILE = '_group.md';
const RESERVED_DIRS = new Set(['audio', 'summaries', 'attachments']);
const isProjectDir = name => !!name && !name.startsWith('.') && !name.startsWith('_') && !RESERVED_DIRS.has(name.toLowerCase());
const isNoteName = name => /\.md$/i.test(name) && !name.startsWith('_') && !name.startsWith('.');

// Frontmatter de uma reunião do Persist Notes: title + date + (status ou source ou duration_seconds).
function isMeetingFrontmatter(fm) {
  if (!fm || typeof fm !== 'object') return false;
  if (fm.type === 'period_summary') return false;
  return !!fm.title && !!fm.date && (fm.status !== undefined || fm.source !== undefined || fm.duration_seconds !== undefined);
}

const parentOf = p => { const i = p.lastIndexOf('/'); return i < 0 ? '' : p.slice(0, i); };
const depth = p => (p ? p.split('/').length : 0);

// Acha a pasta do Persist Notes: files = [{ path, frontmatter }] (caminhos do cofre, com "/").
// Pontua cada pasta pelas reuniões nela e nas subpastas diretas (projetos) e pelos _synthesis.md dos projetos.
// Devolve o caminho ('' = raiz do cofre) ou null se não houver nenhuma reunião.
function detectRoot(files) {
  const score = new Map();
  const add = (dir, n) => score.set(dir, (score.get(dir) || 0) + n);
  let any = false;
  // Projetos-pai (app 0.16.0) marcados com _group.md: um projeto dentro deles conta para a pasta acima do pai.
  const groups = new Set(files.filter(f => f.path.split('/').pop() === GROUP_FILE).map(f => parentOf(f.path)));
  const rootOf = dir => (groups.has(parentOf(dir)) ? parentOf(parentOf(dir)) : parentOf(dir));
  for (const f of files) {
    const name = f.path.split('/').pop();
    const dir = parentOf(f.path);
    if (name === SYNTHESIS_FILE) { if (dir) { add(rootOf(dir), 1); any = true; } continue; }
    if (!isNoteName(name) || !isMeetingFrontmatter(f.frontmatter)) continue;
    any = true;
    add(dir, 1);
    if (dir && isProjectDir(dir.split('/').pop())) add(rootOf(dir), 1);
  }
  if (!any) return null;
  // Maior pontuação; no empate, a pasta mais funda (a raiz do cofre só ganha se tiver mais reuniões).
  let best = null, bestScore = -1;
  for (const [dir, s] of score) {
    if (s > bestScore || (s === bestScore && depth(dir) > depth(best))) { best = dir; bestScore = s; }
  }
  return best;
}

// Onde um arquivo está em relação à pasta do Persist Notes:
// { kind: 'meeting' | 'synthesis', project } ou null (fora da pasta, reservado, oculto).
// Projetos em dois níveis (app 0.16.0): 'Pai/Projeto/nota.md' é do projeto 'Pai/Projeto'; o pai só agrupa.
// Uma nota solta direto na pasta do pai fica com o nome do pai.
function classify(filePath, root) {
  const prefix = root ? root.replace(/\/+$/, '') + '/' : '';
  if (prefix && !filePath.startsWith(prefix)) return null;
  const parts = filePath.slice(prefix.length).split('/');
  if (parts.length === 1) return isNoteName(parts[0]) ? { kind: 'meeting', project: '' } : null;
  if (parts.length < 2 || parts.length > 3 || !parts.slice(0, -1).every(isProjectDir)) return null;
  const project = parts.slice(0, -1).join('/'), name = parts[parts.length - 1];
  if (name === SYNTHESIS_FILE) return { kind: 'synthesis', project };
  return isNoteName(name) ? { kind: 'meeting', project } : null;
}

module.exports = {
  normalize, SECTIONS, headingRe, resolveDue, isDueText,
  TASK_RE, parseTaskText, parseCommitments, toggleTask,
  SYNTHESIS_FILE, GROUP_FILE, RESERVED_DIRS, isProjectDir, isMeetingFrontmatter, detectRoot, classify,
};
