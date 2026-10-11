// The document of the storyboard editor: the project being edited, what is on disk, and every edit as one step that undo takes back.
// Pure code like ../src/project.ts (no screen, no file system): the editor's views call these operations and draw `project`; selftest.ts runs
// them without a window. Every operation leaves a project the player accepts (parseProject), so that Save never writes a file that cannot be
// opened again: ids stay unique, a required text is never emptied, deleting a sequence takes the links that led to it, or leads them elsewhere,
// in the same step.
// The one exception is a project with no sequence at all, which is the empty state and is not saved.
import { Project, Sequence, Media, Item, Link, Point, Presentation, Colours, Text, KINDS, LIGHTS, serializeProject, parseProject, unreachable, copyProject, sequenceJson, mediaJson } from '../src/project';

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
/** The width a medium gets when it is put on the table, by kind (KINDS), in units of a table 1920 wide. */
const WIDTHS: number[] = [480, 600, 800, 420, 320, 640];
/** A time in seconds as the file keeps it: tenths, never negative. */
function tenths(t: number): number { return Math.max(0, Math.round(t * 10) / 10); }
/** A place of a model, or a direction in a panorama, as the file keeps it: four digits of its largest coordinate (a tenth of a millimetre
 *  on an object of some decimetres, whatever the unit of the model). */
function placed(at: number[]): number[] {
  const m = Math.max(Math.abs(at[0]), Math.max(Math.abs(at[1]), Math.abs(at[2])));
  if (!(m > 0)) return [0, 0, 0];
  const p = Math.pow(10, 3 - Math.floor(Math.log(m) / Math.log(10)));
  return [Math.round(at[0] * p) / p, Math.round(at[1] * p) / p, Math.round(at[2] * p) / p];
}
/** The names of the six colours of a theme, in the order of the file. */
export const COLOURS: string[] = ['background', 'paper', 'ink', 'text', 'muted', 'accent'];
/** Every text of a project, whatever it belongs to: what a change of the languages has to visit. */
function texts(p: Project): Text[] {
  const out: Text[] = [p.title];
  for (const m of p.media) {
    for (const t of [m.title, m.date, m.medium, m.description, m.audioDescription, m.text, m.transcript]) out.push(t);
    for (const q of m.points) { out.push(q.title); out.push(q.text); }
  }
  for (const s of p.sequences) { out.push(s.title); out.push(s.text); for (const l of s.links) out.push(l.label); }
  for (const r of p.presentations) out.push(r.title);
  return out;
}
/** Where a button may be: on the table and within `reach` of one of its edges. Returns [x, y], moved toward the nearest edge when it was not. */
function reachable(x: number, y: number, width: number, height: number, reach: number): number[] {
  let nx = Math.max(0, Math.min(width, Math.round(x))), ny = Math.max(0, Math.min(height, Math.round(y)));
  const left = nx, right = width - nx, top = ny, bottom = height - ny, nearest = Math.min(Math.min(left, right), Math.min(top, bottom));
  if (nearest > reach) {
    if (nearest === bottom) ny = height - reach; else if (nearest === top) ny = reach; else if (nearest === left) nx = reach; else nx = width - reach;
  }
  return [nx, ny];
}
// The words a new thing is named with until the author names it, in the languages the editor offers (strings.ts LANGUAGE_NAMES): a
// sequence, a guided visit, a point of interest, a copy.
const SEQUENCE: i32 = 1, TOUR: i32 = 2, POINT: i32 = 3, COPY: i32 = 4;
const WORDS: string[] = ['fr', 'Séquence', 'Visite', 'Point', 'copie', 'en', 'Sequence', 'Tour', 'Point', 'copy', 'de', 'Sequenz', 'Rundgang', 'Punkt', 'Kopie',
  'es', 'Secuencia', 'Visita', 'Punto', 'copia', 'it', 'Sequenza', 'Visita', 'Punto', 'copia', 'nl', 'Sequentie', 'Rondleiding', 'Punt', 'kopie', 'pt', 'Sequência', 'Visita', 'Ponto', 'cópia'];
/** The word of a language ("pt-BR" has Portuguese's); '' when the editor has no word in it. */
function wordIn(lang: string, which: i32): string {
  const at = WORDS.indexOf(lang.split('-')[0].toLowerCase());
  return at >= 0 && at % 5 === 0 ? WORDS[at + which] : '';
}
/** The word in the default language, where a name is required: English's when the editor has none. */
function mainWord(lang: string, which: i32): string { const w = wordIn(lang, which); return w.length > 0 ? w : wordIn('en', which); }
/** Names a new thing "<word> n" in each language in its own word; a language the editor has no word in is left empty for the author
 *  (the table then shows the default language's name), except the default one. */
function nameNew(title: Text, languages: string[], which: i32, n: i32): void {
  for (let i = 0; i < languages.length; i++) {
    const w = i === 0 ? mainWord(languages[i], which) : wordIn(languages[i], which);
    if (w.length > 0) title.set(languages[i], `${w} ${n}`);
  }
}
function copyWord(lang: string): string { const w = wordIn(lang, COPY); return w.length > 0 ? ` (${w})` : ' 2'; }

// ---------------------------------------------------------------- problems

/** Something the author should look at: an `error` is a project the table refuses, a `warning` plays but is probably not meant. The editor
 *  says it in its own language from `kind`: 'refused' (detail: the loader's message, which names the field), 'unreachable' (subject: the
 *  title of a sequence no link leads to), 'no-title' and 'no-label' (subject: the title of a sequence, detail: the language that is missing).
 *  `sequence` (an id) and `link` (an index in it, -1 for none) say where it is, so that the panel can lead there. */
export class Problem {
  level: string; kind: string; subject: string; detail: string; sequence: string; link: i32;
  constructor(level: string, kind: string, subject: string, detail: string, sequence: string, link: i32) {
    this.level = level; this.kind = kind; this.subject = subject; this.detail = detail; this.sequence = sequence; this.link = link;
  }
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
      nameNew(s.title, p.languages, SEQUENCE, n);
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

  /** Sets when a link can be followed, like an item's times. */
  setLinkTimes(from: string, index: i32, at: number, until: number): void {
    const found = this.link(from, index);
    if (found === null) return;
    const l: Link = found, a = tenths(at), u = until > 0 ? Math.max(tenths(until), a + 0.5) : 0;
    this.apply('Change link times', '', (p: Project) => { l.at = a; l.until = u; });
  }
  /** Leads a link to another sequence. */
  setLinkTarget(from: string, index: i32, to: string): void {
    const found = this.link(from, index);
    if (found === null || to === from || this.project.sequence(to) === null) return;
    const l: Link = found;
    this.apply('Change link target', '', (p: Project) => { l.to = to; });
  }
  /** Where the button of a link is. On the table, in table units: kept on the table and within `table.reach` of an edge, which the player
   *  requires (a seated visitor reaches it). A hotspot: fractions of its item's box, kept inside it. */
  moveLink(from: string, index: i32, x: number, y: number): void {
    const found = this.link(from, index);
    if (found === null) return;
    const l: Link = found, t = this.project.table;
    let nx = x, ny = y;
    if (l.on.length > 0) { nx = Math.max(0, Math.min(1, Math.round(x * 100) / 100)); ny = Math.max(0, Math.min(1, Math.round(y * 100) / 100)); }
    else { const at = reachable(x, y, t.width, t.height, t.reach); nx = at[0]; ny = at[1]; }   // too far from every edge: back toward the nearest one
    this.apply('Move button', '', (p: Project) => { l.x = nx; l.y = ny; });
  }
  /** A hotspot: a link to `to` in the middle of the item of `from` that shows the medium `on`. Returns its index, -1 when not made. */
  addHotspot(from: string, on: string, to: string): i32 {
    const source = this.project.sequence(from), found = this.project.sequence(to);
    if (source === null || found === null || from === to || source.items.filter((it: Item) => it.media === on).length === 0) return -1;
    const s: Sequence = source, target: Sequence = found;
    this.apply('New hotspot', '', (p: Project) => {
      const l = new Link();
      l.to = to; l.on = on; l.x = 0.5; l.y = 0.5;
      for (const lang of p.languages) { const t = target.title.get(lang); if (t !== undefined) l.label.set(lang, t); }
      s.links.push(l);
    });
    return s.links.length - 1;
  }

  // ---- media

  private freeMediaId(base: string, except: string): string {
    const b = base.length > 0 ? base : 'media';
    for (let n = 1; ; n++) {
      const id = n === 1 ? b : `${b}-${n}`;
      if (id === except || this.project.medium(id) === null) return id;
    }
  }
  /** Adds a file of the project folder to the library. A file shown to visitors says where it comes from and under which licence: `title`
   *  (default language), `source` and `licence` are required. `texture`: the picture wrapped on an OBJ model ('' for none). Returns the id,
   *  '' when something is missing. */
  addMedia(kind: string, file: string, title: string, source: string, licence: string, texture: string = '', subtitles: string = '', poster: string = ''): string {
    if (KINDS.indexOf(kind) < 0 || kind === 'text' || file.length === 0 || title.length === 0 || source.length === 0 || licence.length === 0) return '';
    const id = this.freeMediaId(slug(title), '');
    this.apply('Add media', '', (p: Project) => {
      const m = new Media();
      m.id = id; m.kind = kind; m.file = file; m.title.set(p.languages[0], title); m.credit.source = source; m.credit.licence = licence;
      if (kind === 'model') m.texture = texture;
      if (kind === 'audio' || kind === 'video') m.subtitles = subtitles;
      if (kind === 'video') m.poster = poster;
      p.media.push(m);
    });
    return id;
  }
  /** Adds a text written in the editor (a label, a quotation). Returns its id, '' when the title or the text is missing. */
  addText(title: string, body: string): string {
    if (title.length === 0 || body.length === 0) return '';
    const id = this.freeMediaId(slug(title), '');
    this.apply('Add text', '', (p: Project) => {
      const m = new Media();
      m.id = id; m.kind = 'text'; m.title.set(p.languages[0], title); m.text.set(p.languages[0], body);
      p.media.push(m);
    });
    return id;
  }
  /** One of the texts of a medium in one language. `field`: title, date, medium, description, audioDescription, text, transcript. The
   *  title (and the body of a text) cannot be emptied in the default language; an id derived from the title follows it, as for sequences.
   *  Returns the id the medium has afterwards. */
  setMediaText(id: string, field: string, lang: string, value: string): string {
    const found = this.project.medium(id);
    if (found === null) return id;
    const m: Media = found, main = lang === this.project.languages[0];
    if (main && value.length === 0 && (field === 'title' || (field === 'text' && m.kind === 'text'))) return id;
    let now = id;
    if (field === 'title' && main && derived(id, slug(m.title.get(lang) ?? ''))) now = this.freeMediaId(slug(value), id);
    this.apply('Edit media text', `media:${this.project.media.indexOf(m)}:${field}:${lang}`, (p: Project) => {
      const t: Text = field === 'title' ? m.title : field === 'date' ? m.date : field === 'medium' ? m.medium : field === 'description' ? m.description
        : field === 'audioDescription' ? m.audioDescription : field === 'text' ? m.text : m.transcript;
      if (value.length > 0) t.set(lang, value); else t.delete(lang);
      if (now === id) return;
      m.id = now;
      for (const s of p.sequences) {
        for (const it of s.items) if (it.media === id) it.media = now;
        for (const l of s.links) if (l.on === id) l.on = now;
        if (s.narration === id) s.narration = now;
      }
    });
    return now;
  }
  /** The author and the credit of a medium. `field`: creator, institution, accession, line, source, licence, licenceUrl. The source and the
   *  licence of a file cannot be emptied. */
  setMediaCredit(id: string, field: string, value: string): void {
    const found = this.project.medium(id);
    if (found === null || (value.length === 0 && (field === 'source' || field === 'licence'))) return;
    const m: Media = found;
    this.apply('Edit media credit', `credit:${this.project.media.indexOf(m)}:${field}`, (p: Project) => {
      if (field === 'creator') m.creator = value; else if (field === 'institution') m.credit.institution = value; else if (field === 'accession') m.credit.accession = value;
      else if (field === 'line') m.credit.line = value; else if (field === 'source') m.credit.source = value; else if (field === 'licence') m.credit.licence = value;
      else if (field === 'licenceUrl') m.credit.licenceUrl = value;
    });
  }
  /** A step the player has to accept: tried on a copy first. Returns '' when done, else what the loader refuses, and nothing is changed. */
  private checked(label: string, key: string, change: (p: Project) => void): string {
    const trial = copyProject(this.project);
    change(trial);
    try { parseProject(serializeProject(trial)); } catch (e) { return e.message; }
    this.apply(label, key, change);
    return '';
  }
  /** A file of a medium, as a path in the project folder. `field`: file (the medium itself), subtitles (WebVTT, of a sound or a film),
   *  poster (the picture of a film's card), texture (the picture wrapped on a model). In the file and the subtitles of a sound or a film
   *  `{lang}` stands for the language code: one file per language. Returns '' when done, else what the loader refuses. */
  setMediaFile(id: string, field: string, value: string): string {
    if (this.project.medium(id) === null) return '';
    return this.checked('Change a file of a medium', `file:${id}:${field}`, (p: Project) => {
      const m = p.medium(id);
      if (m === null) return;
      if (field === 'file') m.file = value; else if (field === 'subtitles') m.subtitles = value; else if (field === 'poster') m.poster = value; else if (field === 'texture') m.texture = value;
    });
  }
  /** Whether a film starts again at its end. */
  setMediaLoop(id: string, loop: boolean): void {
    const found = this.project.medium(id);
    if (found === null || found.kind !== 'video') return;
    const m: Media = found;
    this.apply('Change a film', '', (p: Project) => { m.loop = loop; });
  }
  /** In how many places sequences show or play the medium: what removing it from the project takes away. */
  mediaUses(id: string): i32 {
    let n: i32 = 0;
    for (const s of this.project.sequences) { n += s.items.filter((it: Item) => it.media === id).length; if (s.narration === id) n++; }
    return n;
  }
  /** Removes a medium from the library, and with it the items that show it and their hotspots, in one step. The file stays in the folder. */
  removeMedia(id: string): void {
    if (this.project.medium(id) === null) return;
    this.apply('Remove media', '', (p: Project) => {
      p.media = p.media.filter((m: Media) => m.id !== id);
      for (const s of p.sequences) {
        s.items = s.items.filter((it: Item) => it.media !== id);
        s.links = s.links.filter((l: Link) => l.on !== id);
        if (s.narration === id) s.narration = '';
      }
    });
  }

  // ---- points of interest of a model or a panorama, and how it is first seen

  point(media: string, id: string): Point | null {
    const m = this.project.medium(media);
    if (m !== null) for (const q of m.points) if (q.id === id) return q;
    return null;
  }
  private freePointId(m: Media, base: string, except: string): string {
    const b = base.length > 0 ? base : 'point';
    for (let n = 1; ; n++) {
      const id = n === 1 ? b : `${b}-${n}`;
      if (id === except || m.points.filter((q: Point) => q.id === id).length === 0) return id;
    }
  }
  /** A view as the file keeps it: whole degrees, and the distance of a model (in radii, two decimals) or the field of view of a panorama. */
  private see(m: Media, into: Point | null, yaw: number, pitch: number, reach: number): void {
    const v = into !== null ? into.view : m.view;
    v.yaw = Math.round(yaw); v.pitch = Math.round(pitch);
    if (m.kind === 'panorama') v.fov = Math.round(reach); else v.distance = Math.round(reach * 100) / 100;
  }
  /** A point of interest where the author clicked: on a model `at` is a place in the model's own coordinates, in a panorama the direction
   *  it is seen in. It is "Point N" until it is named, and opens with the view it was placed from (`yaw`, `pitch`, and the distance of a
   *  model or the field of view of a panorama). Returns its id, '' when the medium takes no point. */
  addPoint(media: string, at: number[], yaw: number, pitch: number, reach: number): string {
    const found = this.project.medium(media);
    if (found === null || (found.kind !== 'model' && found.kind !== 'panorama') || at.length !== 3) return '';
    const m: Media = found;
    let n = 1;
    while (m.points.filter((q: Point) => q.id === `point-${n}`).length > 0) n++;
    const id = `point-${n}`;
    this.apply('New point of interest', '', (p: Project) => {
      const q = new Point();
      q.id = id; q.at = placed(at);
      nameNew(q.title, p.languages, POINT, n);
      this.see(m, q, yaw, pitch, reach);
      m.points.push(q);
    });
    return id;
  }
  movePoint(media: string, id: string, at: number[]): void {
    const found = this.point(media, id);
    if (found === null || at.length !== 3) return;
    const q: Point = found;
    this.apply('Move point of interest', '', (p: Project) => { q.at = placed(at); });
  }
  /** The title or the description (`field`: title, text) of a point in one language. Its title cannot be emptied in the default language,
   *  and an id derived from it follows it, as for sequences. Returns the id the point has afterwards. */
  setPointText(media: string, id: string, field: string, lang: string, value: string): string {
    const m = this.project.medium(media), found = this.point(media, id);
    if (m === null || found === null) return id;
    const q: Point = found, owner: Media = m, main = lang === this.project.languages[0];
    if (field === 'title' && main && value.length === 0) return id;
    let now = id;
    if (field === 'title' && main && derived(id, slug(q.title.get(lang) ?? ''))) now = this.freePointId(owner, slug(value), id);
    this.apply('Edit point of interest', `point:${this.project.media.indexOf(owner)}:${owner.points.indexOf(q)}:${field}:${lang}`, (p: Project) => {
      const t: Text = field === 'title' ? q.title : q.text;
      if (value.length > 0) t.set(lang, value); else t.delete(lang);
      q.id = now;
    });
    return now;
  }
  /** Where the camera goes when the point opens: what the author sees now ("use this view"). */
  setPointView(media: string, id: string, yaw: number, pitch: number, reach: number): void {
    const m = this.project.medium(media), found = this.point(media, id);
    if (m === null || found === null) return;
    const q: Point = found, owner: Media = m;
    this.apply('Set the view of a point', '', (p: Project) => { this.see(owner, q, yaw, pitch, reach); });
  }
  /** The sequence the card of a point offers a button to ('' for none). */
  setPointTarget(media: string, id: string, to: string): void {
    const found = this.point(media, id);
    if (found === null || (to.length > 0 && this.project.sequence(to) === null)) return;
    const q: Point = found;
    this.apply('Change point link', '', (p: Project) => { q.to = to; });
  }
  deletePoint(media: string, id: string): void {
    const m = this.project.medium(media);
    if (m === null || this.point(media, id) === null) return;
    const owner: Media = m;
    this.apply('Delete point of interest', '', (p: Project) => { owner.points = owner.points.filter((q: Point) => q.id !== id); });
  }
  /** How a model or a panorama is first seen. A point keeps the view it was given. */
  setMediaView(media: string, yaw: number, pitch: number, reach: number): void {
    const found = this.project.medium(media);
    if (found === null || (found.kind !== 'model' && found.kind !== 'panorama')) return;
    const m: Media = found;
    this.apply('Set the opening view', '', (p: Project) => { this.see(m, null, yaw, pitch, reach); });
  }
  /** The lighting of a model at rest: one of LIGHTS. */
  setMediaLight(media: string, light: string): void {
    const found = this.project.medium(media);
    if (found === null || found.kind !== 'model' || LIGHTS.indexOf(light) < 0) return;
    const m: Media = found;
    this.apply('Change the lighting', '', (p: Project) => { m.light = light; });
  }

  // ---- what lies on the table of a sequence

  item(sequence: string, index: i32): Item | null {
    const s = this.project.sequence(sequence);
    return s !== null && index >= 0 && index < s.items.length ? s.items[index] : null;
  }
  /** Puts a medium on the table of a sequence, centred on (x, y) in table units, on top of the others. Returns its index, -1 when not made. */
  addItem(sequence: string, media: string, x: number, y: number): i32 {
    const found = this.project.sequence(sequence), m = this.project.medium(media);
    if (found === null || m === null) return -1;
    const s: Sequence = found, width = Math.round(WIDTHS[KINDS.indexOf(m.kind)] * this.project.table.width / 1920);
    this.apply('Place media', '', (p: Project) => {
      const it = new Item();
      it.media = media; it.x = Math.round(x); it.y = Math.round(y); it.width = width;
      s.items.push(it);
    });
    return s.items.length - 1;
  }
  moveItem(sequence: string, index: i32, x: number, y: number): void {
    const found = this.item(sequence, index);
    if (found === null) return;
    const it: Item = found;
    this.apply('Move media', '', (p: Project) => { it.x = Math.round(x); it.y = Math.round(y); });
  }
  /** The width of an item, and its height (0: the height follows the medium). */
  resizeItem(sequence: string, index: i32, width: number, height: number): void {
    const found = this.item(sequence, index);
    if (found === null) return;
    const it: Item = found;
    this.apply('Resize media', '', (p: Project) => { it.width = Math.max(20, Math.round(width)); it.height = Math.max(0, Math.round(height)); });
  }
  /** Degrees, clockwise. */
  rotateItem(sequence: string, index: i32, rotation: number): void {
    const found = this.item(sequence, index);
    if (found === null) return;
    const it: Item = found;
    this.apply('Rotate media', '', (p: Project) => { it.rotation = Math.round(rotation * 10) / 10; });
  }
  /** When the item appears and when it leaves, in seconds from the start of the sequence (until 0: it stays to the end). */
  setItemTimes(sequence: string, index: i32, at: number, until: number): void {
    const found = this.item(sequence, index);
    if (found === null) return;
    const it: Item = found, a = tenths(at), u = until > 0 ? Math.max(tenths(until), a + 0.5) : 0;
    this.apply('Change media times', '', (p: Project) => { it.at = a; it.until = u; });
  }
  /** Moves an item in the drawing order: `by` 1 one step toward the front, -1 toward the back. Returns its index afterwards. */
  raiseItem(sequence: string, index: i32, by: i32): i32 {
    const found = this.project.sequence(sequence);
    if (found === null || index < 0 || index >= found.items.length) return index;
    const s: Sequence = found, to: i32 = Math.max(0, Math.min(s.items.length - 1, index + by));
    this.apply(by > 0 ? 'Bring media forward' : 'Send media backward', '', (p: Project) => {
      const it = s.items[index];
      s.items[index] = s.items[to];
      s.items[to] = it;
    });
    return to;
  }
  /** Takes an item off the table; the hotspots on its medium go with it unless another item of the sequence shows the same medium. */
  removeItem(sequence: string, index: i32): void {
    const found = this.project.sequence(sequence);
    if (found === null || index < 0 || index >= found.items.length) return;
    const s: Sequence = found;
    this.apply('Take media off the table', '', (p: Project) => {
      const media = s.items[index].media;
      s.items.splice(index, 1);
      if (s.items.filter((it: Item) => it.media === media).length === 0) s.links = s.links.filter((l: Link) => l.on !== media);
    });
  }
  /** The introduction shown with the title of a sequence, in one language. */
  setSequenceText(id: string, lang: string, text: string): void {
    const found = this.project.sequence(id);
    if (found === null) return;
    const s: Sequence = found;
    this.apply('Edit sequence text', `text:${this.project.sequences.indexOf(s)}:${lang}`, (p: Project) => { if (text.length > 0) s.text.set(lang, text); else s.text.delete(lang); });
  }
  /** What is said when the sequence comes on the table: a sound of the library ('' for nothing). */
  setNarration(id: string, media: string): void {
    const found = this.project.sequence(id), m = this.project.medium(media);
    if (found === null || (media.length > 0 && (m === null || m.kind !== 'audio'))) return;
    const s: Sequence = found;
    this.apply('Change the narration', '', (p: Project) => { s.narration = media; });
  }
  /** The sequence that follows by itself, once the duration or the narration is over ('' for none). Returns '' when done, else what the
   *  loader refuses. */
  setNext(id: string, next: string): string {
    if (this.project.sequence(id) === null || next === id) return '';
    return this.checked('Change what follows', '', (p: Project) => { const s = p.sequence(id); if (s !== null) s.next = next; });
  }
  /** Seconds the sequence lasts in a guided presentation (0: as long as its narration, else until the visitor moves on). */
  setSequenceDuration(id: string, seconds: number): void {
    const found = this.project.sequence(id);
    if (found === null) return;
    const s: Sequence = found;
    this.apply('Change sequence duration', '', (p: Project) => { s.duration = tenths(seconds); });
  }

  // ---- the settings of the project: its name, its languages, its theme, the table, the kiosk, accessibility

  /** The title of the installation in one language (required in the default one), or with `lang` '' its id, under which statistics and
   *  updates are filed. */
  setProjectTitle(lang: string, title: string): void {
    if (title.length === 0 && (lang.length === 0 || lang === this.project.languages[0])) return;
    this.apply('Rename the project', `project:${lang}`, (p: Project) => {
      if (lang.length === 0) p.id = title; else if (title.length > 0) p.title.set(lang, title); else p.title.delete(lang);
    });
  }
  /** A language more: its code ("de", "pt-BR"), last in the list. Every text is empty in it and falls back on the default language until
   *  it is translated. False when the code is not one, or is there already. */
  addLanguage(code: string): boolean {
    let ok = code.length >= 2 && code.length <= 10 && this.project.languages.indexOf(code) < 0;
    for (let i = 0; i < code.length; i++) {
      const c = code.charCodeAt(i) | 32;
      if (!((c >= 97 && c <= 122) || (code.charCodeAt(i) === 45 && i > 1 && i < code.length - 1))) ok = false;
    }
    if (!ok) return false;
    this.apply('Add a language', '', (p: Project) => { p.languages.push(code); });
    return true;
  }
  /** Makes a language of the project the default one, the first of the list: what a visitor reads before choosing, and what a text without
   *  a translation falls back on. Every required text has to be written in it: returns '' when done, else what the loader misses
   *  ("sequences[1].title.en: missing (the default language)") and nothing is changed. */
  setDefaultLanguage(code: string): string {
    if (this.project.languages.indexOf(code) < 1) return '';
    const first = (p: Project): void => { p.languages = [code].concat(p.languages.filter((l: string) => l !== code)); };
    const trial = copyProject(this.project);
    first(trial);
    try { parseProject(serializeProject(trial)); } catch (e) { return e.message; }
    this.apply('Change the default language', '', first);
    return '';
  }
  /** How many texts the project has in a language: what removing it loses. */
  textsIn(code: string): i32 {
    let n: i32 = 0;
    for (const t of texts(this.project)) if ((t.get(code) ?? '').length > 0) n++;
    return n;
  }
  /** Takes a language out, with every text written in it. The default language (the first) stays: every required text is written in it. */
  removeLanguage(code: string): void {
    if (this.project.languages.indexOf(code) < 1) return;
    this.apply('Remove a language', '', (p: Project) => {
      p.languages = p.languages.filter((l: string) => l !== code);
      for (const t of texts(p)) t.delete(code);
    });
  }
  /** One of the six colours (COLOURS) of the theme, or with `contrast` of the high-contrast mode, as 0xRRGGBB. */
  setColour(contrast: boolean, name: string, colour: i32): void {
    if (COLOURS.indexOf(name) < 0 || colour < 0 || colour > 0xffffff) return;
    this.apply('Change a colour', '', (p: Project) => {
      const c: Colours = contrast ? p.accessibility.highContrast : p.theme;
      if (name === 'background') c.background = colour; else if (name === 'paper') c.paper = colour; else if (name === 'ink') c.ink = colour;
      else if (name === 'text') c.text = colour; else if (name === 'muted') c.muted = colour; else c.accent = colour;
    });
  }
  /** The fonts and the logo of the theme. `field`: font, titleFont (a family, never empty) or logo (a picture of the folder, '' for none;
   *  a path outside the folder is not taken). */
  setThemeFile(field: string, value: string): void {
    const inside = !value.startsWith('/') && value.indexOf('\\') < 0 && value.indexOf(':') < 0 && value.split('/').indexOf('..') < 0;
    if ((field !== 'logo' && value.length === 0) || (field === 'logo' && !inside)) return;
    this.apply('Change the theme', `theme:${field}`, (p: Project) => {
      if (field === 'font') p.theme.font = value; else if (field === 'titleFont') p.theme.titleFont = value; else if (field === 'logo') p.theme.logo = value;
    });
  }
  /** A number of the table or of the kiosk. `field`: visitors (1 or more), reach (table units, more than 0: the buttons farther than it
   *  from every edge come back within it, in the same step), attractAfter, resetAfter (seconds, 0: never). */
  setNumber(field: string, value: number): void {
    if (value - value !== 0 || value < 0 || ((field === 'visitors' || field === 'reach') && value <= 0)) return;
    this.apply('Change a setting', `number:${field}`, (p: Project) => {
      if (field === 'visitors') p.table.visitors = Math.max(1, Math.round(value));
      else if (field === 'attractAfter') p.kiosk.attractAfter = tenths(value);
      else if (field === 'resetAfter') p.kiosk.resetAfter = tenths(value);
      else if (field === 'reach') {
        p.table.reach = Math.round(value);
        for (const s of p.sequences) for (const l of s.links) if (l.on.length === 0) { const at = reachable(l.x, l.y, p.table.width, p.table.height, p.table.reach); l.x = at[0]; l.y = at[1]; }
      }
    });
  }
  /** A switch of the kiosk. `field`: fullscreen, statistics. */
  setFlag(field: string, on: boolean): void {
    this.apply('Change a setting', '', (p: Project) => { if (field === 'fullscreen') p.kiosk.fullscreen = on; else if (field === 'statistics') p.kiosk.statistics = on; });
  }
  /** Where the museum publishes a newer project ('' for nowhere). */
  setUpdateUrl(url: string): void {
    this.apply('Change a setting', 'updateUrl', (p: Project) => { p.kiosk.updateUrl = url; });
  }
  /** The presentation played as the attract loop ('' for none). */
  setAttract(presentation: string): void {
    if (presentation.length > 0 && this.presentation(presentation) === null) return;
    this.apply('Change the attract loop', '', (p: Project) => { p.kiosk.attract = presentation; });
  }
  /** The text sizes a visitor steps through, as factors of the designed size: at least one, each more than 0, at most 3 (two decimals). */
  setTextSizes(sizes: number[]): void {
    if (sizes.length === 0 || sizes.filter((v: number) => !(v > 0) || v > 3).length > 0) return;
    this.apply('Change the text sizes', 'textSizes', (p: Project) => { p.accessibility.textSizes = sizes.map((v: number) => Math.round(v * 100) / 100); });
  }

  // ---- presentations: guided visits

  presentation(id: string): Presentation | null {
    for (const r of this.project.presentations) if (r.id === id) return r;
    return null;
  }
  private freePresentationId(base: string, except: string): string {
    const b = base.length > 0 ? base : 'presentation';
    for (let n = 1; ; n++) {
      const id = n === 1 ? b : `${b}-${n}`;
      if (id === except || this.presentation(id) === null) return id;
    }
  }
  /** A guided visit, "Visite N" until it is named, that begins where the visit starts. Returns its id, '' while the project has no sequence. */
  addPresentation(): string {
    if (this.project.sequence(this.project.start) === null) return '';
    const word = (lang: string): string => mainWord(lang, TOUR), main = this.project.languages[0];
    let n = 1;
    while (this.presentation(slug(`${word(main)} ${n}`)) !== null) n++;
    const id = slug(`${word(main)} ${n}`);   // the id of its first title: it follows the title until the author names it otherwise
    this.apply('New presentation', '', (p: Project) => {
      const r = new Presentation();
      r.id = id; r.path = [p.start];
      nameNew(r.title, p.languages, TOUR, n);
      p.presentations.push(r);
    });
    return id;
  }
  /** Its title in one language (required in the default one); an id derived from the title follows it. Returns the id it has afterwards. */
  renamePresentation(id: string, lang: string, title: string): string {
    const found = this.presentation(id);
    if (found === null) return id;
    const r: Presentation = found, main = lang === this.project.languages[0];
    if (main && title.length === 0) return id;
    let now = id;
    if (main && derived(id, slug(r.title.get(lang) ?? ''))) now = this.freePresentationId(slug(title), id);
    this.apply('Rename presentation', `presentation:${this.project.presentations.indexOf(r)}:${lang}`, (p: Project) => {
      if (title.length > 0) r.title.set(lang, title); else r.title.delete(lang);
      if (p.kiosk.attract === id) p.kiosk.attract = now;
      r.id = now;
    });
    return now;
  }
  deletePresentation(id: string): void {
    if (this.presentation(id) === null) return;
    this.apply('Delete presentation', '', (p: Project) => {
      p.presentations = p.presentations.filter((r: Presentation) => r.id !== id);
      if (p.kiosk.attract === id) p.kiosk.attract = '';
    });
  }
  /** A step more at the end of the path: a sequence, which may come more than once in a visit, but not twice in a row. */
  addStep(id: string, sequence: string): void {
    const found = this.presentation(id);
    if (found === null || this.project.sequence(sequence) === null || found.path[found.path.length - 1] === sequence) return;
    const r: Presentation = found;
    this.apply('Add a step', '', (p: Project) => { r.path.push(sequence); });
  }
  /** Takes a step out; the last one stays (a visit shows at least one sequence: delete the presentation instead). */
  removeStep(id: string, index: i32): void {
    const found = this.presentation(id);
    if (found === null || index < 0 || index >= found.path.length || found.path.length < 2) return;
    const r: Presentation = found;
    this.apply('Remove a step', '', (p: Project) => { r.path.splice(index, 1); });
  }
  /** Moves a step to another place of the path (what a drag does). */
  moveStep(id: string, from: i32, to: i32): void {
    const found = this.presentation(id);
    if (found === null || from < 0 || from >= found.path.length || to < 0 || to >= found.path.length || from === to) return;
    const r: Presentation = found;
    this.apply('Move a step', '', (p: Project) => {
      const step = r.path[from];
      r.path.splice(from, 1);
      r.path = r.path.slice(0, to).concat([step]).concat(r.path.slice(to));
    });
  }

  // ---- the file, object by object

  /** A sequence (or with `link` >= 0 one of its links) as it is written in the file: the advanced view shows it, read only.
   *  ponytail: a link is cut out of its sequence's text by its indentation, because the format module writes a sequence in one piece. */
  jsonOf(id: string, link: i32): string {
    const s = this.project.sequence(id);
    if (s === null) return '';
    const block = sequenceJson(s, this.project.languages, '');
    if (link < 0) return block;
    let at = block.indexOf('\n  "links": [');
    for (let i = 0; i <= link && at >= 0; i++) at = block.indexOf('\n    {', at + 1);
    return at < 0 ? '' : block.slice(at + 1, block.indexOf('\n    }', at) + 6).split('\n').map((line: string) => line.slice(4)).join('\n');
  }
  /** A medium, with its points of interest, as it is written in the file. */
  mediaJsonOf(id: string): string {
    const m = this.project.medium(id);
    return m === null ? '' : mediaJson(m, this.project.languages, '');
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
      out.push(new Problem('error', 'refused', '', m, where, -1));
    }
    const main = p.languages[0];
    for (const id of unreachable(p)) out.push(new Problem('warning', 'unreachable', this.titleOf(id, main), '', id, -1));
    for (const s of p.sequences) {
      for (const lang of p.languages) {
        if (lang === main) continue;
        if ((s.title.get(lang) ?? '').length === 0) out.push(new Problem('warning', 'no-title', this.titleOf(s.id, main), lang, s.id, -1));
        for (let i = 0; i < s.links.length; i++) {
          if ((s.links[i].label.get(lang) ?? '').length === 0) out.push(new Problem('warning', 'no-label', this.titleOf(s.id, main), lang, s.id, i));
        }
      }
    }
    return out;
  }
}
