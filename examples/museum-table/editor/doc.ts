// The document of the storyboard editor: the project being edited, what is on disk, and every edit as one step that undo takes back.
// Pure code like ../src/project.ts (no screen, no file system): the editor's views call these operations and draw `project`; selftest.ts runs
// them without a window. Every operation leaves a project the player accepts (parseProject), so that Save never writes a file that cannot be
// opened again: ids stay unique, a required text is never emptied, deleting a sequence takes the links that led to it, or leads them elsewhere,
// in the same step.
// The one exception is a project with no sequence at all, which is the empty state and is not saved.
import { Project, Sequence, Link, Presentation, serializeProject, parseProject, unreachable, copyProject } from '../src/project';

/** What "New project" opens: French and English (the owner's languages), no sequence yet. */
export function newProject(): Project {
  const p = new Project();
  p.id = 'project';
  p.languages = ['fr', 'en'];
  p.title.set('fr', 'Nouveau projet');
  p.title.set('en', 'New project');
  return p;
}

// ---------------------------------------------------------------- names

const ACCENTED = 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ';
const PLAIN = 'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy';
/** A title as an id: "Le vase à décor" gives "le-vase-a-decor". Ids are what links, statistics and messages name, so they stay readable. */
export function slug(title: string): string {
  const t = title.replaceAll('œ', 'oe').replaceAll('Œ', 'oe').replaceAll('æ', 'ae').replaceAll('Æ', 'ae');
  let out = '', gap = false;
  for (let i = 0; i < t.length; i++) {
    let ch = t.charAt(i);
    const k = ACCENTED.indexOf(ch);
    if (k >= 0) ch = PLAIN.charAt(k);
    ch = ch.toLowerCase();
    const c = ch.charCodeAt(0);
    if ((c >= 97 && c <= 122) || (c >= 48 && c <= 57)) {
      if (gap && out.length > 0) out += '-';
      out += ch;
      gap = false;
    } else gap = true;
  }
  return out;
}
/** Whether `id` is `base` or `base-N`: an id the editor derived from a title. */
function derived(id: string, base: string): boolean {
  if (id === base) return true;
  if (!id.startsWith(base + '-')) return false;
  const n = id.slice(base.length + 1);
  for (let i = 0; i < n.length; i++) { const c = n.charCodeAt(i); if (c < 48 || c > 57) return false; }
  return n.length > 0;
}
function sequenceWord(lang: string): string { return lang === 'fr' ? 'Séquence' : 'Sequence'; }
function copyWord(lang: string): string { return lang === 'fr' ? ' (copie)' : ' (copy)'; }

// ---------------------------------------------------------------- problems

/** Something the author should look at: an `error` is a project the table refuses, a `warning` plays but is probably not meant.
 *  `sequence` (an id) and `link` (an index in it, -1 for none) say where it is, so the panel can lead there. */
export class Problem {
  level = 'warning';
  message = '';
  sequence = '';
  link: i32 = -1;
  constructor(level: string, message: string, sequence: string, link: i32) { this.level = level; this.message = message; this.sequence = sequence; this.link = link; }
}

// ---------------------------------------------------------------- the document

class Step {
  label: string;
  state: Project;
  constructor(label: string, state: Project) { this.label = label; this.state = state; }
}

export class Doc {
  project: Project;
  /** The text on disk ('' when never saved): the project is unsaved while its text differs. */
  saved = '';
  /** Called after every change of `project` (an edit, undo, redo, load). */
  onChange: (() => void) | null = null;
  // ponytail: an undo step keeps a whole copy of the project (copyProject, 45 KB of text for the sample); inverse operations if projects grow past a few MB
  private undone: Step[] = [];
  private redone: Step[] = [];
  private lastKey = '';
  private cached = '';
  private cachedOk = false;

  constructor(project: Project, saved: string) { this.project = project; this.saved = saved; }

  /** The canonical text of the project: what Save writes. */
  text(): string {
    if (!this.cachedOk) { this.cached = serializeProject(this.project); this.cachedOk = true; }
    return this.cached;
  }
  get dirty(): boolean { return this.project.sequences.length > 0 ? this.text() !== this.saved : this.saved.length > 0; }
  get canUndo(): boolean { return this.undone.length > 0; }
  get canRedo(): boolean { return this.redone.length > 0; }
  get undoLabel(): string { return this.undone.length > 0 ? this.undone[this.undone.length - 1].label : ''; }
  get redoLabel(): string { return this.redone.length > 0 ? this.redone[this.redone.length - 1].label : ''; }
  markSaved(): void { this.saved = this.text(); this.lastKey = ''; }

  private changed(): void {
    this.cachedOk = false;
    const f = this.onChange;
    if (f !== null) f();
  }
  /** One undoable step. Consecutive steps with the same non-empty `key` are one (typing in a field); a step that changes nothing leaves no trace. */
  private apply(label: string, key: string, change: (p: Project) => void): void {
    const before = this.text();
    const merge = key.length > 0 && key === this.lastKey && this.undone.length > 0;
    const kept = merge ? null : copyProject(this.project);
    change(this.project);
    this.cachedOk = false;
    if (this.text() === before) return;
    if (kept !== null) this.undone.push(new Step(label, kept));
    this.redone = [];
    this.lastKey = key;
    this.changed();
  }
  /** Ends a run of merged steps: the next edit of the same field is a step of its own (the field lost the focus). */
  seal(): void { this.lastKey = ''; }
  /** Takes the last step back and returns its label ('' when there is none). */
  undo(): string {
    if (this.undone.length === 0) return '';
    const s = this.undone[this.undone.length - 1];
    this.undone.pop();
    this.redone.push(new Step(s.label, this.project));
    this.project = s.state;
    this.lastKey = '';
    this.changed();
    return s.label;
  }
  redo(): string {
    if (this.redone.length === 0) return '';
    const s = this.redone[this.redone.length - 1];
    this.redone.pop();
    this.undone.push(new Step(s.label, this.project));
    this.project = s.state;
    this.lastKey = '';
    this.changed();
    return s.label;
  }

  // ---- names

  private freeSequenceId(base: string, except: string): string {
    const b = base.length > 0 ? base : 'sequence';
    for (let n = 1; ; n++) {
      const id = n === 1 ? b : `${b}-${n}`;
      if (id === except || this.project.sequence(id) === null) return id;
    }
  }
  /** The title shown for a sequence in `lang` (the default language when it has none there). */
  titleOf(id: string, lang: string): string {
    const s = this.project.sequence(id);
    return s === null ? id : this.project.say(s.title, lang);
  }
  /** Gives the sequence `from` the id `to` everywhere it is named. */
  private renameId(p: Project, from: string, to: string): void {
    if (from === to) return;
    for (const s of p.sequences) {
      if (s.id === from) s.id = to;
      if (s.next === from) s.next = to;
      for (const l of s.links) if (l.to === from) l.to = to;
    }
    if (p.start === from) p.start = to;
    for (const r of p.presentations) for (let i = 0; i < r.path.length; i++) if (r.path[i] === from) r.path[i] = to;
    for (const m of p.media) for (const q of m.points) if (q.to === from) q.to = to;
  }

  // ---- sequences

  /** A new sequence at (x, y) of the storyboard; the first one of a project is where the visit starts. Returns its id. */
  addSequence(x: number, y: number): string {
    let n = 1;
    while (this.project.sequence(`sequence-${n}`) !== null) n++;
    const id = `sequence-${n}`;
    this.apply('New sequence', '', (p: Project) => {
      const s = new Sequence();
      s.id = id;
      for (const lang of p.languages) s.title.set(lang, `${sequenceWord(lang)} ${n}`);
      s.storyX = x; s.storyY = y;
      p.sequences.push(s);
      if (p.sequences.length === 1) p.start = id;
    });
    return id;
  }
  /** Sets the title in one language. An id the editor derived from the title follows it ("sequence-1" becomes "accueil"); a title in the
   *  default language is required, so an empty one is not taken. Returns the id the sequence has afterwards. */
  renameSequence(id: string, lang: string, title: string): string {
    const found = this.project.sequence(id);
    if (found === null) return id;
    const s: Sequence = found;
    const main = lang === this.project.languages[0];
    if (main && title.length === 0) return id;
    let now = id;
    if (main && derived(id, slug(s.title.get(lang) ?? ''))) now = this.freeSequenceId(slug(title), id);
    this.apply('Rename sequence', `title:${this.project.sequences.indexOf(s)}:${lang}`, (p: Project) => {
      if (title.length > 0) s.title.set(lang, title); else s.title.delete(lang);
      this.renameId(p, id, now);
    });
    return now;
  }
  moveSequence(id: string, x: number, y: number): void {
    const found = this.project.sequence(id);
    if (found === null) return;
    const s: Sequence = found;
    this.apply('Move sequence', '', (p: Project) => { s.storyX = x; s.storyY = y; });
  }
  /** A copy next to the original, with its media and its own links; the links that lead to the original still lead to the original. */
  duplicateSequence(id: string): string {
    const found = this.project.sequence(id);
    if (found === null) return id;
    const s: Sequence = found;
    const main = this.project.languages[0];
    const copy = this.freeSequenceId(slug((s.title.get(main) ?? '') + copyWord(main)), '');
    // a copy of the whole project is where a copy of one sequence comes from: the format module copies projects
    const twin = copyProject(this.project).sequence(id);
    if (twin === null) return id;
    const c: Sequence = twin;
    this.apply('Duplicate sequence', '', (p: Project) => {
      c.id = copy;
      for (const lang of p.languages) { const t = s.title.get(lang); if (t !== undefined) c.title.set(lang, t + copyWord(lang)); }
      c.storyX = s.storyX + 40; c.storyY = s.storyY + 40;
      const at = p.sequences.indexOf(s) + 1;
      p.sequences = p.sequences.slice(0, at).concat([c]).concat(p.sequences.slice(at));
    });
    return copy;
  }
  /** How many links and points of interest lead to the sequence from elsewhere: what deleting it breaks. */
  linksTo(id: string): i32 {
    let n: i32 = 0;
    for (const s of this.project.sequences) if (s.id !== id) for (const l of s.links) if (l.to === id) n++;
    for (const m of this.project.media) for (const q of m.points) if (q.to === id) n++;
    return n;
  }
  /** Removes the sequence, and with it what named it, in one step. With `instead` (another sequence) the links, points of interest, automatic
   *  continuations and presentation steps that led to it lead there; with '' they go: the links are removed, a point of interest keeps its text
   *  and loses its button, a presentation left empty is removed. The start moves to `instead`, else to the first sequence left. */
  deleteSequence(id: string, instead: string): void {
    if (this.project.sequence(id) === null || instead === id || (instead.length > 0 && this.project.sequence(instead) === null)) return;
    this.apply('Delete sequence', '', (p: Project) => {
      p.sequences = p.sequences.filter((s: Sequence) => s.id !== id);
      for (const s of p.sequences) {
        // a sequence does not lead to itself: the links of `instead` to the deleted one go
        if (instead.length > 0 && s.id !== instead) { for (const l of s.links) if (l.to === id) l.to = instead; }
        s.links = s.links.filter((l: Link) => l.to !== id);
        if (s.next === id) s.next = s.id !== instead ? instead : '';
      }
      for (const m of p.media) for (const q of m.points) if (q.to === id) q.to = instead;
      for (const r of p.presentations) {
        const path: string[] = [];
        for (const step of r.path) {
          const now = step === id ? instead : step;
          if (now.length === 0) continue;
          // the replacement is not played twice in a row
          if (now === instead && path.length > 0 && path[path.length - 1] === now) continue;
          path.push(now);
        }
        r.path = path;
      }
      p.presentations = p.presentations.filter((r: Presentation) => r.path.length > 0);
      if (p.kiosk.attract.length > 0 && p.presentations.filter((r: Presentation) => r.id === p.kiosk.attract).length === 0) p.kiosk.attract = '';
      if (p.start === id) p.start = instead.length > 0 ? instead : p.sequences.length > 0 ? p.sequences[0].id : '';
    });
  }
  /** The sequence the visit starts with. */
  setStart(id: string): void {
    if (this.project.sequence(id) === null) return;
    this.apply('Set start sequence', '', (p: Project) => { p.start = id; });
  }

  // ---- links

  /** A link from one sequence to another: a button of `from`, labelled with the title of where it leads, put on the first free place of the
   *  bottom row of the table (always within reach of the edge; the sequence editor moves it). Returns its index in `from`, -1 when not made. */
  addLink(from: string, to: string): i32 {
    const source = this.project.sequence(from), found = this.project.sequence(to);
    if (source === null || found === null || from === to) return -1;
    const s: Sequence = source, target: Sequence = found;
    const W = this.project.table.width, H = this.project.table.height;
    const step = Math.round(W * 300 / 1920), row = Math.round(Math.min(50 * H / 1080, this.project.table.reach));
    let x = Math.round(W / 2), y = Math.round(H - row);
    // centre, then left and right of it, then a row above
    for (let k = 0; k < 40; k++) {
      const side = k % 7, lane = Math.floor(k / 7);
      x = Math.round(W / 2) + (side === 0 ? 0 : (side % 2 === 1 ? -1 : 1) * Math.ceil(side / 2) * step);
      y = Math.round(H - row - lane * 2 * row);
      let taken = false;
      for (const l of s.links) if (l.on.length === 0 && Math.abs(l.x - x) < step / 2 && Math.abs(l.y - y) < row) taken = true;
      if (!taken && x > 0 && x < W) break;
    }
    this.apply('New link', '', (p: Project) => {
      const l = new Link();
      l.to = to; l.x = x; l.y = y;
      for (const lang of p.languages) { const t = target.title.get(lang); if (t !== undefined) l.label.set(lang, t); }
      s.links.push(l);
    });
    return s.links.length - 1;
  }
  /** The label of a link in one language; the default language is required, so an empty one is not taken. */
  setLinkLabel(from: string, index: i32, lang: string, label: string): void {
    const found = this.link(from, index);
    if (found === null || (lang === this.project.languages[0] && label.length === 0)) return;
    const l: Link = found;
    this.apply('Edit link label', `label:${from}:${index}:${lang}`, (p: Project) => { if (label.length > 0) l.label.set(lang, label); else l.label.delete(lang); });
  }
  /** How the target arrives: one of TRANSITIONS. */
  setLinkTransition(from: string, index: i32, transition: string): void {
    const found = this.link(from, index);
    if (found === null) return;
    const l: Link = found;
    this.apply('Change link transition', '', (p: Project) => { l.transition = transition; });
  }
  /** Whether the target opens over the sequence, which waits underneath, instead of replacing it. */
  setLinkOverlay(from: string, index: i32, overlay: boolean): void {
    const found = this.link(from, index);
    if (found === null) return;
    const l: Link = found;
    this.apply('Change link kind', '', (p: Project) => { l.overlay = overlay; });
  }
  deleteLink(from: string, index: i32): void {
    const found = this.project.sequence(from);
    if (found === null || index < 0 || index >= found.links.length) return;
    const s: Sequence = found;
    this.apply('Delete link', '', (p: Project) => { s.links.splice(index, 1); });
  }
  link(from: string, index: i32): Link | null {
    const s = this.project.sequence(from);
    return s !== null && index >= 0 && index < s.links.length ? s.links[index] : null;
  }

  // ---- the file, object by object

  /** A sequence (or with `link` >= 0 one of its links) as it is written in the file: the advanced view shows it, read only.
   *  ponytail: cut out of the canonical text by its indentation, because the format module writes whole projects only; a sequenceJson
   *  exported by ../src/project.ts would replace this. */
  jsonOf(id: string, link: i32): string {
    const t = this.text(), from = t.indexOf(`\n    {\n      "id": ${JSON.stringify(id)},`, t.indexOf('\n  "sequences": ['));
    if (from < 0) return '';
    const block = t.slice(from + 1, t.indexOf('\n    }', from + 1) + 6);
    const lines = (text: string, indent: i32): string => text.split('\n').map((line: string) => line.slice(indent)).join('\n');
    if (link < 0) return lines(block, 4);
    let at = block.indexOf('\n      "links": [');
    for (let i = 0; i <= link && at >= 0; i++) at = block.indexOf('\n        {', at + 1);
    return at < 0 ? '' : lines(block.slice(at + 1, block.indexOf('\n        }', at) + 10), 8);
  }

  // ---- problems

  /** What is wrong or doubtful in the project, the errors first. */
  problems(): Problem[] {
    const p = this.project, out: Problem[] = [];
    if (p.sequences.length === 0) return out;
    try { parseProject(this.text()); } catch (e) {
      // the loader names the field: "sequences[2].links[0].to: unknown sequence"
      const m: string = e.message;
      let where = '';
      if (m.startsWith('sequences[')) {
        const n: i32 = parseInt(m.slice(10, m.indexOf(']')), 10);
        if (n >= 0 && n < p.sequences.length) where = p.sequences[n].id;
      }
      out.push(new Problem('error', `The table would refuse this project: ${m}`, where, -1));
    }
    const main = p.languages[0];
    for (const id of unreachable(p)) out.push(new Problem('warning', `No link leads to "${this.titleOf(id, main)}": visitors cannot reach it.`, id, -1));
    for (const s of p.sequences) {
      for (const lang of p.languages) {
        if (lang === main) continue;
        if ((s.title.get(lang) ?? '').length === 0) out.push(new Problem('warning', `"${this.titleOf(s.id, main)}" has no title in ${lang}.`, s.id, -1));
        for (let i = 0; i < s.links.length; i++) {
          if ((s.links[i].label.get(lang) ?? '').length === 0) out.push(new Problem('warning', `A link of "${this.titleOf(s.id, main)}" has no label in ${lang}.`, s.id, i));
        }
      }
    }
    return out;
  }
}
