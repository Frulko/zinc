// The project file of the museum table (docs/museum-table-format.md): one JSON document holds a whole installation: the media library with
// its credits, the sequences (what lies on the table, where, when), the links between them, the texts in every language, the storyboard
// positions, the table, kiosk and accessibility settings and the theme. parseProject validates it and names the field at fault;
// serializeProject writes the canonical form, so that load, save, load gives the same bytes. The player and the storyboard editor both
// import this module; nothing here touches the screen or the file system.

export const FORMAT = 'zinc-museum-table';
/** The newest version this module reads; a file says which one it was written for. */
export const VERSION = 1;
export const KINDS: string[] = ['photo', 'model', 'panorama', 'text', 'audio', 'video'];
export const MODEL_FORMATS: string[] = ['obj', 'glb', 'gltf'];
export const LIGHTS: string[] = ['studio', 'raking', 'flat'];
export const TRANSITIONS: string[] = ['fade', 'slide', 'none'];

export class ProjectError extends Error {}

/** A text in the languages of the project (language code to string). Empty when the file leaves it out. */
export type Text = Map<string, string>;
function noText(): Text { return new Map<string, string>(); }

export class Credit {
  institution = '';
  accession = '';
  /** The credit line the institution asks for. */
  line = '';
  /** The page of the work at the institution. */
  source = '';
  licence = '';
  licenceUrl = '';
}

/** Where the camera is. Around a model: angles in degrees and the distance in multiples of the model's radius. Inside a panorama: the
 *  direction looked at and the field of view in degrees. */
export class View {
  yaw = 0;
  pitch = 0;
  distance = 3.2;
  fov = 75;
}

/** A point of interest: on a model, a place in the model's own coordinates; in a panorama, the direction from the centre. */
export class Point {
  id = '';
  title: Text = noText();
  text: Text = noText();
  at: number[] = [0, 0, 0];
  /** Where the camera goes when the point opens. */
  view: View = new View();
  /** A sequence the point leads to ('' for none): its card offers a button to it. */
  to = '';
}

export class Media {
  id = '';
  /** One of KINDS. */
  kind = '';
  /** Path in the assets ('' for a text). In an audio, video or subtitle path `{lang}` stands for the language code. */
  file = '';
  title: Text = noText();
  creator = '';
  date: Text = noText();
  medium: Text = noText();
  description: Text = noText();
  /** What a visitor who cannot see it needs to hear: read by the synthesised voice. */
  audioDescription: Text = noText();
  credit: Credit = new Credit();
  /** text: the body. */
  text: Text = noText();
  /** model: the image wrapped on it ('' for none) and the lighting preset (one of LIGHTS). */
  texture = '';
  light = 'studio';
  /** model and panorama: the opening view and the points of interest. */
  view: View = new View();
  points: Point[] = [];
  /** audio and video: what is said (the synthesised narration is made from it) and the timed subtitles (WebVTT, '' for none). */
  transcript: Text = noText();
  subtitles = '';
  /** video: the image shown before it plays ('' for none), and whether it starts again at its end. */
  poster = '';
  loop = false;
}

/** A medium placed in a sequence: centre, width (the height follows the medium unless given) and rotation (degrees, clockwise) in table
 *  units; it is there from `at` to `until`, in seconds from the start of the sequence (until 0: to the end). */
export class Item {
  media = '';
  x = 0;
  y = 0;
  width = 0;
  height = 0;
  rotation = 0;
  at = 0;
  until = 0;
}

/** A link to another sequence: a button at (x, y) in table units, or with `on` a hotspot at (x, y) on the item showing that medium,
 *  in fractions of its box. `overlay`: the target opens over this sequence, which waits underneath. */
export class Link {
  to = '';
  label: Text = noText();
  x = 0;
  y = 0;
  at = 0;
  until = 0;
  on = '';
  /** One of TRANSITIONS. */
  transition = 'fade';
  overlay = false;
}

export class Sequence {
  id = '';
  title: Text = noText();
  text: Text = noText();
  /** Position of the node in the storyboard. */
  storyX = 0;
  storyY = 0;
  items: Item[] = [];
  links: Link[] = [];
  /** An audio medium played with the sequence ('' for none). */
  narration = '';
  /** Seconds the sequence lasts in a guided presentation or before `next` (0: as long as its narration, else until the visitor moves on). */
  duration = 0;
  /** The sequence that follows by itself at the end ('' to stay). */
  next = '';
}

/** A guided visit: sequences played in order. */
export class Presentation {
  id = '';
  title: Text = noText();
  path: string[] = [];
}

/** Colours, 0xRRGGBB: the table, a card and what is written on it, the texts on the table, secondary texts, what answers to a touch. */
export class Colours {
  background: u32 = 0x14151a;
  paper: u32 = 0xf4f1ea;
  ink: u32 = 0x23211d;
  text: u32 = 0xece8df;
  muted: u32 = 0x9b978d;
  accent: u32 = 0xd0a441;
}
export class Theme extends Colours {
  /** Font families: a baked family or a font file of the assets. */
  font = 'sans';
  titleFont = 'sans-bold';
  /** The museum's logo, an image of the assets ('' for none). */
  logo = '';
}
export function highContrast(): Colours {
  const c = new Colours();
  c.background = 0x000000; c.paper = 0xffffff; c.ink = 0x000000; c.text = 0xffffff; c.muted = 0xe0e0e0; c.accent = 0xffd400;
  return c;
}
export class Accessibility {
  /** The text sizes a visitor steps through, as factors of the designed size; the first is the one at rest. */
  textSizes: number[] = [1, 1.3, 1.6];
  /** The colours of the high-contrast mode. */
  highContrast: Colours = highContrast();
}

export class Table {
  /** The size the positions are written for; the player scales it to the screen. */
  width = 1920;
  height = 1080;
  /** Visitors served at the same time. */
  visitors = 2;
  /** Every button lies within this distance of an edge of the table, in table units, so that a seated visitor or a child reaches it
   *  (520 units of a 1920-unit table are 26 cm on a 43-inch screen and 33 cm on a 55-inch one). */
  reach = 520;
}

export class Kiosk {
  /** Fullscreen with no way out by gesture or key, and errors never shown to visitors. */
  fullscreen = true;
  /** Seconds without a touch before the attract loop starts, and before everything returns to the start. */
  attractAfter = 60;
  resetAfter = 120;
  /** The presentation played as the attract loop ('' for the start sequence alone). */
  attract = '';
  /** Count sequences seen, durations and languages, in a local file, with nothing that identifies a visitor. */
  statistics = false;
  /** Where the museum publishes a newer project ('' for never: the table then needs no network). */
  updateUrl = '';
}

export class Project {
  version = VERSION;
  id = '';
  title: Text = noText();
  /** Language codes; the first one is the default and every required text has it. */
  languages: string[] = [];
  /** The sequence shown first. */
  start = '';
  theme: Theme = new Theme();
  accessibility: Accessibility = new Accessibility();
  table: Table = new Table();
  kiosk: Kiosk = new Kiosk();
  media: Media[] = [];
  sequences: Sequence[] = [];
  presentations: Presentation[] = [];

  medium(id: string): Media | null {
    for (const m of this.media) if (m.id === id) return m;
    return null;
  }
  sequence(id: string): Sequence | null {
    for (const s of this.sequences) if (s.id === id) return s;
    return null;
  }
  /** The text in `lang`, else in the default language, else ''. */
  say(t: Text, lang: string): string {
    const v = t.get(lang) ?? '';
    return v.length > 0 ? v : t.get(this.languages[0]) ?? '';
  }
}

// ---------------------------------------------------------------- reading

function bad(path: string, problem: string): ProjectError { return new ProjectError(`${path}: ${problem}`); }
function given(v: any): boolean { return v !== undefined && v !== null; }
function str(v: any, path: string): string {
  if (typeof v !== 'string') throw bad(path, given(v) ? 'must be a string' : 'missing');
  return v as string;
}
function word(v: any, path: string): string {
  const s = str(v, path);
  if (s.length === 0) throw bad(path, 'must not be empty');
  return s;
}
function optStr(v: any, path: string): string { return given(v) ? str(v, path) : ''; }
function oneOf(v: any, path: string, choices: string[], otherwise: string): string {
  if (!given(v)) return otherwise;
  const s = str(v, path);
  if (choices.indexOf(s) < 0) throw bad(path, `"${s}" is not one of ${choices.join(', ')}`);
  return s;
}
function num(v: any, path: string): number {
  if (typeof v !== 'number') throw bad(path, given(v) ? 'must be a number' : 'missing');
  const n: number = v;
  if (n - n !== 0) throw bad(path, 'must be a finite number');
  return n;
}
function optNum(v: any, path: string, otherwise: number): number { return given(v) ? num(v, path) : otherwise; }
function positive(v: any, path: string): number {
  const n = num(v, path);
  if (n <= 0) throw bad(path, 'must be greater than 0');
  return n;
}
function optPositive(v: any, path: string, otherwise: number): number { return given(v) ? positive(v, path) : otherwise; }
/** A time or a delay in seconds: 0 or more. */
function seconds(v: any, path: string, otherwise: number): number {
  const n = optNum(v, path, otherwise);
  if (n < 0) throw bad(path, 'must be 0 or more');
  return n;
}
function flag(v: any, path: string, otherwise: boolean): boolean {
  if (!given(v)) return otherwise;
  if (typeof v !== 'boolean') throw bad(path, 'must be true or false');
  return v === true;
}
function record(v: any, path: string): any {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw bad(path, given(v) ? 'must be an object' : 'missing');
  return v;
}
function count(v: any, path: string): i32 {
  if (!Array.isArray(v)) throw bad(path, given(v) ? 'must be a list' : 'missing');
  const n: i32 = v.length;
  return n;
}
/** A path inside the assets: relative, no `..`, so that a project file cannot name a file outside its own directory. */
function assetPath(v: any, path: string): string {
  const s = word(v, path);
  if (s.startsWith('/') || s.indexOf('\\') >= 0 || s.indexOf(':') >= 0 || s.split('/').indexOf('..') >= 0) throw bad(path, `"${s}" must be a path inside the assets`);
  return s;
}
function optAsset(v: any, path: string): string { return given(v) ? assetPath(v, path) : ''; }
function colour(v: any, path: string, otherwise: u32): u32 {
  if (!given(v)) return otherwise;
  const s = str(v, path);
  let ok = s.length === 7 && s.charCodeAt(0) === 35;
  for (let i = 1; ok && i < 7; i++) {
    const c = s.charCodeAt(i) | 32;
    ok = (c >= 48 && c <= 57) || (c >= 97 && c <= 102);
  }
  if (!ok) throw bad(path, `"${s}" is not a colour (#rrggbb)`);
  const n: u32 = parseInt(s.slice(1), 16);
  return n;
}
function readColours(o: any, path: string, into: Colours, d: Colours): void {
  into.background = colour(o.background, `${path}.background`, d.background);
  into.paper = colour(o.paper, `${path}.paper`, d.paper);
  into.ink = colour(o.ink, `${path}.ink`, d.ink);
  into.text = colour(o.text, `${path}.text`, d.text);
  into.muted = colour(o.muted, `${path}.muted`, d.muted);
  into.accent = colour(o.accent, `${path}.accent`, d.accent);
}
/** `required`: the default language must be there and not empty. */
function text(v: any, path: string, languages: string[], required: boolean): Text {
  const t = noText();
  if (!given(v)) {
    if (required) throw bad(path, 'missing');
    return t;
  }
  const o = record(v, path);
  for (const lang of languages) {
    const s = o[lang];
    if (given(s)) t.set(lang, str(s, `${path}.${lang}`));
  }
  if (required && (t.get(languages[0]) ?? '').length === 0) throw bad(`${path}.${languages[0]}`, 'missing (the default language)');
  return t;
}
function view(v: any, path: string, d: View): View {
  const w = new View();
  w.yaw = d.yaw; w.pitch = d.pitch; w.distance = d.distance; w.fov = d.fov;
  if (!given(v)) return w;
  const o = record(v, path);
  w.yaw = optNum(o.yaw, `${path}.yaw`, d.yaw);
  w.pitch = optNum(o.pitch, `${path}.pitch`, d.pitch);
  w.distance = optPositive(o.distance, `${path}.distance`, d.distance);
  w.fov = optPositive(o.fov, `${path}.fov`, d.fov);
  return w;
}
function unique(ids: Set<string>, id: string, path: string): void {
  if (ids.has(id)) throw bad(path, `duplicate id "${id}"`);
  ids.add(id);
}

function readMedia(o: any, path: string, languages: string[]): Media {
  const m = new Media();
  m.id = word(o.id, `${path}.id`);
  m.kind = oneOf(word(o.kind, `${path}.kind`), `${path}.kind`, KINDS, '');
  m.title = text(o.title, `${path}.title`, languages, true);
  m.creator = optStr(o.creator, `${path}.creator`);
  m.date = text(o.date, `${path}.date`, languages, false);
  m.medium = text(o.medium, `${path}.medium`, languages, false);
  m.description = text(o.description, `${path}.description`, languages, false);
  m.audioDescription = text(o.audioDescription, `${path}.audioDescription`, languages, false);
  if (m.kind === 'text') {
    m.text = text(o.text, `${path}.text`, languages, true);
    return m;
  }
  m.file = assetPath(o.file, `${path}.file`);
  // every file shown says where it comes from and under which licence
  const c = record(o.credit, `${path}.credit`);
  m.credit.institution = optStr(c.institution, `${path}.credit.institution`);
  m.credit.accession = optStr(c.accession, `${path}.credit.accession`);
  m.credit.line = optStr(c.line, `${path}.credit.line`);
  m.credit.source = word(c.source, `${path}.credit.source`);
  m.credit.licence = word(c.licence, `${path}.credit.licence`);
  m.credit.licenceUrl = optStr(c.licenceUrl, `${path}.credit.licenceUrl`);
  if (m.kind === 'audio' || m.kind === 'video') {
    m.transcript = text(o.transcript, `${path}.transcript`, languages, false);
    m.subtitles = optAsset(o.subtitles, `${path}.subtitles`);
    if (m.kind === 'video') {
      m.poster = optAsset(o.poster, `${path}.poster`);
      m.loop = flag(o.loop, `${path}.loop`, false);
    }
    return m;
  }
  if (m.kind === 'photo') return m;
  if (m.kind === 'model') {
    const dot = m.file.lastIndexOf('.');
    if (MODEL_FORMATS.indexOf(m.file.slice(dot + 1).toLowerCase()) < 0) throw bad(`${path}.file`, `"${m.file}" is not a model (${MODEL_FORMATS.join(', ')})`);
    m.texture = optAsset(o.texture, `${path}.texture`);
    m.light = oneOf(o.light, `${path}.light`, LIGHTS, 'studio');
  }
  m.view = view(o.view, `${path}.view`, new View());
  if (given(o.points)) {
    const ids = new Set<string>();
    for (let i = 0; i < count(o.points, `${path}.points`); i++) {
      const at = `${path}.points[${i}]`, q = record(o.points[i], at), p = new Point();
      p.id = word(q.id, `${at}.id`);
      unique(ids, p.id, `${at}.id`);
      p.title = text(q.title, `${at}.title`, languages, true);
      p.text = text(q.text, `${at}.text`, languages, false);
      if (count(q.at, `${at}.at`) !== 3) throw bad(`${at}.at`, 'must be [x, y, z]');
      p.at = [num(q.at[0], `${at}.at[0]`), num(q.at[1], `${at}.at[1]`), num(q.at[2], `${at}.at[2]`)];
      p.view = view(q.view, `${at}.view`, m.view);
      if (given(q.to)) p.to = word(q.to, `${at}.to`);
      m.points.push(p);
    }
  }
  return m;
}

function readSequence(o: any, path: string, languages: string[]): Sequence {
  const s = new Sequence();
  s.id = word(o.id, `${path}.id`);
  s.title = text(o.title, `${path}.title`, languages, true);
  s.text = text(o.text, `${path}.text`, languages, false);
  if (given(o.storyboard)) {
    const b = record(o.storyboard, `${path}.storyboard`);
    s.storyX = num(b.x, `${path}.storyboard.x`);
    s.storyY = num(b.y, `${path}.storyboard.y`);
  }
  for (let i = 0; i < count(o.items, `${path}.items`); i++) {
    const at = `${path}.items[${i}]`, q = record(o.items[i], at), it = new Item();
    it.media = word(q.media, `${at}.media`);
    it.x = num(q.x, `${at}.x`);
    it.y = num(q.y, `${at}.y`);
    it.width = positive(q.width, `${at}.width`);
    it.height = optPositive(q.height, `${at}.height`, 0);
    it.rotation = optNum(q.rotation, `${at}.rotation`, 0);
    it.at = seconds(q.at, `${at}.at`, 0);
    it.until = seconds(q.until, `${at}.until`, 0);
    s.items.push(it);
  }
  if (given(o.links)) {
    for (let i = 0; i < count(o.links, `${path}.links`); i++) {
      const at = `${path}.links[${i}]`, q = record(o.links[i], at), l = new Link();
      l.to = word(q.to, `${at}.to`);
      l.label = text(q.label, `${at}.label`, languages, true);
      l.x = num(q.x, `${at}.x`);
      l.y = num(q.y, `${at}.y`);
      l.at = seconds(q.at, `${at}.at`, 0);
      l.until = seconds(q.until, `${at}.until`, 0);
      l.on = optStr(q.on, `${at}.on`);
      l.transition = oneOf(q.transition, `${at}.transition`, TRANSITIONS, 'fade');
      l.overlay = flag(q.overlay, `${at}.overlay`, false);
      s.links.push(l);
    }
  }
  s.narration = optStr(o.narration, `${path}.narration`);
  s.duration = seconds(o.duration, `${path}.duration`, 0);
  s.next = optStr(o.next, `${path}.next`);
  return s;
}

/** The project in `json`. Throws a ProjectError whose message names the field at fault, as `media[3].credit.licence: missing`.
 *  Fields the reference does not name are ignored (and not written back). */
// ponytail: a misspelt optional field is dropped in silence, because a parsed JSON object cannot list its keys (no Object.keys on a Dyn);
// refuse unknown fields here once the engine has it.
export function parseProject(json: string): Project {
  let root: any = null;
  try { root = JSON.parse(json); } catch (e) { throw new ProjectError('not a JSON document'); }
  const o = record(root, 'project');
  if (o.format !== FORMAT) throw bad('format', `must be "${FORMAT}"`);
  const p = new Project();
  p.version = num(o.version, 'version');
  if (p.version !== Math.floor(p.version) || p.version < 1) throw bad('version', 'must be a whole number, 1 or more');
  if (p.version > VERSION) throw bad('version', `${p.version} is newer than this player (${VERSION})`);
  p.id = word(o.id, 'id');
  const langs = new Set<string>();
  for (let i = 0; i < count(o.languages, 'languages'); i++) {
    const lang = word(o.languages[i], `languages[${i}]`);
    unique(langs, lang, `languages[${i}]`);
    p.languages.push(lang);
  }
  if (p.languages.length === 0) throw bad('languages', 'must list at least one language');
  p.title = text(o.title, 'title', p.languages, true);

  if (given(o.theme)) {
    const t = record(o.theme, 'theme');
    readColours(t, 'theme', p.theme, new Colours());
    p.theme.font = given(t.font) ? word(t.font, 'theme.font') : 'sans';
    p.theme.titleFont = given(t.titleFont) ? word(t.titleFont, 'theme.titleFont') : 'sans-bold';
    p.theme.logo = optAsset(t.logo, 'theme.logo');
  }
  if (given(o.accessibility)) {
    const a = record(o.accessibility, 'accessibility');
    if (given(a.textSizes)) {
      p.accessibility.textSizes = [];
      for (let i = 0; i < count(a.textSizes, 'accessibility.textSizes'); i++) p.accessibility.textSizes.push(positive(a.textSizes[i], `accessibility.textSizes[${i}]`));
      if (p.accessibility.textSizes.length === 0) throw bad('accessibility.textSizes', 'must list at least one size');
    }
    if (given(a.highContrast)) readColours(record(a.highContrast, 'accessibility.highContrast'), 'accessibility.highContrast', p.accessibility.highContrast, highContrast());
  }
  if (given(o.table)) {
    const t = record(o.table, 'table'), d = new Table();
    p.table.width = optPositive(t.width, 'table.width', d.width);
    p.table.height = optPositive(t.height, 'table.height', d.height);
    p.table.visitors = optPositive(t.visitors, 'table.visitors', d.visitors);
    p.table.reach = optPositive(t.reach, 'table.reach', d.reach);
  }
  if (given(o.kiosk)) {
    const k = record(o.kiosk, 'kiosk'), d = new Kiosk();
    p.kiosk.fullscreen = flag(k.fullscreen, 'kiosk.fullscreen', d.fullscreen);
    p.kiosk.attractAfter = seconds(k.attractAfter, 'kiosk.attractAfter', d.attractAfter);
    p.kiosk.resetAfter = seconds(k.resetAfter, 'kiosk.resetAfter', d.resetAfter);
    p.kiosk.attract = optStr(k.attract, 'kiosk.attract');
    p.kiosk.statistics = flag(k.statistics, 'kiosk.statistics', d.statistics);
    p.kiosk.updateUrl = optStr(k.updateUrl, 'kiosk.updateUrl');
  }

  const mediaIds = new Set<string>();
  for (let i = 0; i < count(o.media, 'media'); i++) {
    const m = readMedia(record(o.media[i], `media[${i}]`), `media[${i}]`, p.languages);
    unique(mediaIds, m.id, `media[${i}].id`);
    p.media.push(m);
  }
  const sequenceIds = new Set<string>();
  for (let i = 0; i < count(o.sequences, 'sequences'); i++) {
    const s = readSequence(record(o.sequences[i], `sequences[${i}]`), `sequences[${i}]`, p.languages);
    unique(sequenceIds, s.id, `sequences[${i}].id`);
    p.sequences.push(s);
  }
  if (p.sequences.length === 0) throw bad('sequences', 'must hold at least one sequence');
  const presentationIds = new Set<string>();
  if (given(o.presentations)) {
    for (let i = 0; i < count(o.presentations, 'presentations'); i++) {
      const at = `presentations[${i}]`, q = record(o.presentations[i], at), r = new Presentation();
      r.id = word(q.id, `${at}.id`);
      unique(presentationIds, r.id, `${at}.id`);
      r.title = text(q.title, `${at}.title`, p.languages, true);
      for (let k = 0; k < count(q.path, `${at}.path`); k++) r.path.push(word(q.path[k], `${at}.path[${k}]`));
      if (r.path.length === 0) throw bad(`${at}.path`, 'must name at least one sequence');
      p.presentations.push(r);
    }
  }

  // references: nothing may point at something that is not in the file
  for (let i = 0; i < p.media.length; i++)
    for (let k = 0; k < p.media[i].points.length; k++) {
      const to = p.media[i].points[k].to;
      if (to.length > 0 && !sequenceIds.has(to)) throw bad(`media[${i}].points[${k}].to`, `unknown sequence "${to}"`);
    }
  p.start = word(o.start, 'start');
  if (!sequenceIds.has(p.start)) throw bad('start', `unknown sequence "${p.start}"`);
  if (p.kiosk.attract.length > 0 && !presentationIds.has(p.kiosk.attract)) throw bad('kiosk.attract', `unknown presentation "${p.kiosk.attract}"`);
  const W = p.table.width, H = p.table.height;
  for (let i = 0; i < p.sequences.length; i++) {
    const s = p.sequences[i], shown = new Set<string>();
    for (let k = 0; k < s.items.length; k++) {
      if (!mediaIds.has(s.items[k].media)) throw bad(`sequences[${i}].items[${k}].media`, `unknown media "${s.items[k].media}"`);
      shown.add(s.items[k].media);
    }
    for (let k = 0; k < s.links.length; k++) {
      const l = s.links[k], at = `sequences[${i}].links[${k}]`;
      if (!sequenceIds.has(l.to)) throw bad(`${at}.to`, `unknown sequence "${l.to}"`);
      if (l.on.length > 0) {
        if (!shown.has(l.on)) throw bad(`${at}.on`, `"${l.on}" is not shown in this sequence`);
      } else if (Math.min(Math.min(l.x, W - l.x), Math.min(l.y, H - l.y)) > p.table.reach) {
        throw bad(at, `the button at (${l.x}, ${l.y}) is farther than table.reach (${p.table.reach}) from every edge`);
      }
    }
    if (s.narration.length > 0 && (p.medium(s.narration)?.kind ?? '') !== 'audio') throw bad(`sequences[${i}].narration`, `"${s.narration}" is not an audio medium`);
    if (s.next.length > 0 && !sequenceIds.has(s.next)) throw bad(`sequences[${i}].next`, `unknown sequence "${s.next}"`);
  }
  for (let i = 0; i < p.presentations.length; i++) {
    const path = p.presentations[i].path;
    for (let k = 0; k < path.length; k++) if (!sequenceIds.has(path[k])) throw bad(`presentations[${i}].path[${k}]`, `unknown sequence "${path[k]}"`);
  }
  return p;
}

/** The sequences nothing leads to from the start: no link, no `next`, no presentation, no point of interest of a medium shown on the way. */
export function unreachable(p: Project): string[] {
  const seen = new Set<string>(), todo: string[] = [p.start];
  for (const r of p.presentations) for (const id of r.path) todo.push(id);
  while (todo.length > 0) {
    const s = p.sequence(todo[todo.length - 1]);
    todo.pop();
    if (s === null || seen.has(s.id)) continue;
    seen.add(s.id);
    for (const l of s.links) todo.push(l.to);
    for (const it of s.items) { const m = p.medium(it.media); if (m !== null) for (const q of m.points) todo.push(q.to); }
    todo.push(s.next);
  }
  return p.sequences.filter((s: Sequence) => !seen.has(s.id)).map((s: Sequence) => s.id);
}

/** The asset files the project names, each once, in the order of the media (`{lang}` replaced by each language). */
export function assetFiles(p: Project): string[] {
  const out: string[] = [];
  const add = (f: string): void => {
    if (f.length === 0) return;
    const names = f.indexOf('{lang}') >= 0 ? p.languages.map((lang: string) => f.replaceAll('{lang}', lang)) : [f];
    for (const n of names) if (out.indexOf(n) < 0) out.push(n);
  };
  add(p.theme.logo);
  for (const m of p.media) { add(m.file); add(m.texture); add(m.poster); add(m.subtitles); }
  return out;
}

// ---------------------------------------------------------------- copying

function copyText(t: Text): Text {
  const c = noText();
  for (const lang of t.keys()) c.set(lang, t.get(lang) ?? '');
  return c;
}
function copyView(v: View): View {
  const c = new View();
  c.yaw = v.yaw; c.pitch = v.pitch; c.distance = v.distance; c.fov = v.fov;
  return c;
}
function copyColours(into: Colours, c: Colours): void {
  into.background = c.background; into.paper = c.paper; into.ink = c.ink; into.text = c.text; into.muted = c.muted; into.accent = c.accent;
}

/** A copy of the project that shares nothing with it (an editor keeps one per undo step). Unlike serialize + parse it also copies a
 *  project that would not load yet: no sequence, a link to nowhere. */
export function copyProject(p: Project): Project {
  const c = new Project();
  c.version = p.version; c.id = p.id; c.title = copyText(p.title); c.languages = p.languages.slice(); c.start = p.start;
  copyColours(c.theme, p.theme);
  c.theme.font = p.theme.font; c.theme.titleFont = p.theme.titleFont; c.theme.logo = p.theme.logo;
  c.accessibility.textSizes = p.accessibility.textSizes.slice();
  copyColours(c.accessibility.highContrast, p.accessibility.highContrast);
  c.table.width = p.table.width; c.table.height = p.table.height; c.table.visitors = p.table.visitors; c.table.reach = p.table.reach;
  c.kiosk.fullscreen = p.kiosk.fullscreen; c.kiosk.attractAfter = p.kiosk.attractAfter; c.kiosk.resetAfter = p.kiosk.resetAfter;
  c.kiosk.attract = p.kiosk.attract; c.kiosk.statistics = p.kiosk.statistics; c.kiosk.updateUrl = p.kiosk.updateUrl;
  for (const m of p.media) {
    const n = new Media();
    n.id = m.id; n.kind = m.kind; n.file = m.file; n.title = copyText(m.title); n.creator = m.creator; n.date = copyText(m.date);
    n.medium = copyText(m.medium); n.description = copyText(m.description); n.audioDescription = copyText(m.audioDescription);
    n.credit.institution = m.credit.institution; n.credit.accession = m.credit.accession; n.credit.line = m.credit.line;
    n.credit.source = m.credit.source; n.credit.licence = m.credit.licence; n.credit.licenceUrl = m.credit.licenceUrl;
    n.text = copyText(m.text); n.texture = m.texture; n.light = m.light; n.view = copyView(m.view);
    for (const q of m.points) {
      const r = new Point();
      r.id = q.id; r.title = copyText(q.title); r.text = copyText(q.text); r.at = q.at.slice(); r.view = copyView(q.view); r.to = q.to;
      n.points.push(r);
    }
    n.transcript = copyText(m.transcript); n.subtitles = m.subtitles; n.poster = m.poster; n.loop = m.loop;
    c.media.push(n);
  }
  for (const s of p.sequences) {
    const n = new Sequence();
    n.id = s.id; n.title = copyText(s.title); n.text = copyText(s.text); n.storyX = s.storyX; n.storyY = s.storyY;
    for (const it of s.items) {
      const r = new Item();
      r.media = it.media; r.x = it.x; r.y = it.y; r.width = it.width; r.height = it.height; r.rotation = it.rotation; r.at = it.at; r.until = it.until;
      n.items.push(r);
    }
    for (const l of s.links) {
      const r = new Link();
      r.to = l.to; r.label = copyText(l.label); r.x = l.x; r.y = l.y; r.at = l.at; r.until = l.until; r.on = l.on; r.transition = l.transition; r.overlay = l.overlay;
      n.links.push(r);
    }
    n.narration = s.narration; n.duration = s.duration; n.next = s.next;
    c.sequences.push(n);
  }
  for (const r of p.presentations) {
    const n = new Presentation();
    n.id = r.id; n.title = copyText(r.title); n.path = r.path.slice();
    c.presentations.push(n);
  }
  return c;
}

// ---------------------------------------------------------------- writing (the canonical form)

function quote(s: string): string { return JSON.stringify(s); }
function field(name: string, value: string): string { return `${quote(name)}: ${value}`; }
function block(open: string, close: string, parts: string[], indent: string): string {
  if (parts.length === 0) return open + close;
  return `${open}\n${parts.map((s: string) => `${indent}  ${s}`).join(',\n')}\n${indent}${close}`;
}
function hex(c: u32): string {
  let s = '#';
  for (let shift = 20; shift >= 0; shift -= 4) s += '0123456789abcdef'.charAt((c >> shift) & 15);
  return quote(s);
}
function coloursJson(c: Colours): string[] {
  return [field('background', hex(c.background)), field('paper', hex(c.paper)), field('ink', hex(c.ink)), field('text', hex(c.text)),
    field('muted', hex(c.muted)), field('accent', hex(c.accent))];
}
function textJson(t: Text, languages: string[], indent: string): string {
  const parts: string[] = [];
  for (const lang of languages) { const v = t.get(lang); if (v !== undefined) parts.push(field(lang, quote(v))); }
  return block('{', '}', parts, indent);
}
function optText(f: string[], name: string, t: Text, languages: string[], indent: string): void {
  if (t.size > 0) f.push(field(name, textJson(t, languages, indent)));
}
/** A model's view is its angles and distance, a panorama's its angles and field of view. */
function viewJson(v: View, panorama: boolean): string {
  return panorama ? `{ "yaw": ${v.yaw}, "pitch": ${v.pitch}, "fov": ${v.fov} }` : `{ "yaw": ${v.yaw}, "pitch": ${v.pitch}, "distance": ${v.distance} }`;
}

function mediaJson(m: Media, languages: string[], indent: string): string {
  const inner = indent + '  ', f: string[] = [field('id', quote(m.id)), field('kind', quote(m.kind))];
  if (m.file.length > 0) f.push(field('file', quote(m.file)));
  if (m.texture.length > 0) f.push(field('texture', quote(m.texture)));
  if (m.poster.length > 0) f.push(field('poster', quote(m.poster)));
  if (m.subtitles.length > 0) f.push(field('subtitles', quote(m.subtitles)));
  if (m.loop) f.push(field('loop', 'true'));
  f.push(field('title', textJson(m.title, languages, inner)));
  if (m.creator.length > 0) f.push(field('creator', quote(m.creator)));
  optText(f, 'date', m.date, languages, inner);
  optText(f, 'medium', m.medium, languages, inner);
  optText(f, 'description', m.description, languages, inner);
  optText(f, 'audioDescription', m.audioDescription, languages, inner);
  optText(f, 'text', m.text, languages, inner);
  optText(f, 'transcript', m.transcript, languages, inner);
  if (m.kind !== 'text') {
    const c = m.credit, cf: string[] = [];
    if (c.institution.length > 0) cf.push(field('institution', quote(c.institution)));
    if (c.accession.length > 0) cf.push(field('accession', quote(c.accession)));
    if (c.line.length > 0) cf.push(field('line', quote(c.line)));
    cf.push(field('source', quote(c.source)));
    cf.push(field('licence', quote(c.licence)));
    if (c.licenceUrl.length > 0) cf.push(field('licenceUrl', quote(c.licenceUrl)));
    f.push(field('credit', block('{', '}', cf, inner)));
  }
  if (m.kind === 'model' || m.kind === 'panorama') {
    const pano = m.kind === 'panorama', d = new View();
    if (m.light !== 'studio') f.push(field('light', quote(m.light)));
    if (viewJson(m.view, pano) !== viewJson(d, pano)) f.push(field('view', viewJson(m.view, pano)));
    if (m.points.length > 0) {
      const deep = inner + '  ', deeper = deep + '  ';
      f.push(field('points', block('[', ']', m.points.map((p: Point) => {
        const pf: string[] = [field('id', quote(p.id)), field('title', textJson(p.title, languages, deeper))];
        optText(pf, 'text', p.text, languages, deeper);
        pf.push(field('at', `[${p.at[0]}, ${p.at[1]}, ${p.at[2]}]`));
        if (viewJson(p.view, pano) !== viewJson(m.view, pano)) pf.push(field('view', viewJson(p.view, pano)));
        if (p.to.length > 0) pf.push(field('to', quote(p.to)));
        return block('{', '}', pf, deep);
      }), inner)));
    }
  }
  return block('{', '}', f, indent);
}

function sequenceJson(s: Sequence, languages: string[], indent: string): string {
  const inner = indent + '  ', deep = inner + '  ';
  const f: string[] = [field('id', quote(s.id)), field('title', textJson(s.title, languages, inner))];
  optText(f, 'text', s.text, languages, inner);
  f.push(field('storyboard', `{ "x": ${s.storyX}, "y": ${s.storyY} }`));
  // an item is one line: a sequence reads as a table of what lies where
  f.push(field('items', block('[', ']', s.items.map((it: Item) => {
    let line = `{ "media": ${quote(it.media)}, "x": ${it.x}, "y": ${it.y}, "width": ${it.width}`;
    if (it.height > 0) line += `, "height": ${it.height}`;
    if (it.rotation !== 0) line += `, "rotation": ${it.rotation}`;
    if (it.at !== 0) line += `, "at": ${it.at}`;
    if (it.until !== 0) line += `, "until": ${it.until}`;
    return line + ' }';
  }), inner)));
  if (s.links.length > 0) {
    f.push(field('links', block('[', ']', s.links.map((l: Link) => {
      const lf: string[] = [field('to', quote(l.to)), field('label', textJson(l.label, languages, deep + '  ')), field('x', `${l.x}`), field('y', `${l.y}`)];
      if (l.at !== 0) lf.push(field('at', `${l.at}`));
      if (l.until !== 0) lf.push(field('until', `${l.until}`));
      if (l.on.length > 0) lf.push(field('on', quote(l.on)));
      if (l.transition !== 'fade') lf.push(field('transition', quote(l.transition)));
      if (l.overlay) lf.push(field('overlay', 'true'));
      return block('{', '}', lf, deep);
    }), inner)));
  }
  if (s.narration.length > 0) f.push(field('narration', quote(s.narration)));
  if (s.duration !== 0) f.push(field('duration', `${s.duration}`));
  if (s.next.length > 0) f.push(field('next', quote(s.next)));
  return block('{', '}', f, indent);
}

/** The project as its canonical JSON text (two spaces, fields in the order of the reference, optional fields left out at their default):
 *  serializeProject(parseProject(text)) is `text` again when `text` was written by this function. */
export function serializeProject(p: Project): string {
  const L = p.languages, t = p.theme, b = p.table, k = p.kiosk;
  const theme = coloursJson(t);
  theme.push(field('font', quote(t.font)));
  theme.push(field('titleFont', quote(t.titleFont)));
  if (t.logo.length > 0) theme.push(field('logo', quote(t.logo)));
  const kiosk: string[] = [field('fullscreen', k.fullscreen ? 'true' : 'false'), field('attractAfter', `${k.attractAfter}`), field('resetAfter', `${k.resetAfter}`)];
  if (k.attract.length > 0) kiosk.push(field('attract', quote(k.attract)));
  kiosk.push(field('statistics', k.statistics ? 'true' : 'false'));
  if (k.updateUrl.length > 0) kiosk.push(field('updateUrl', quote(k.updateUrl)));
  const f: string[] = [
    field('format', quote(FORMAT)), field('version', `${p.version}`), field('id', quote(p.id)), field('title', textJson(p.title, L, '  ')),
    field('languages', `[${L.map((s: string) => quote(s)).join(', ')}]`), field('start', quote(p.start)),
    field('theme', block('{', '}', theme, '  ')),
    field('accessibility', block('{', '}', [field('textSizes', `[${p.accessibility.textSizes.map((n: number) => `${n}`).join(', ')}]`),
      field('highContrast', block('{', '}', coloursJson(p.accessibility.highContrast), '    '))], '  ')),
    field('table', block('{', '}', [field('width', `${b.width}`), field('height', `${b.height}`), field('visitors', `${b.visitors}`), field('reach', `${b.reach}`)], '  ')),
    field('kiosk', block('{', '}', kiosk, '  ')),
    field('media', block('[', ']', p.media.map((m: Media) => mediaJson(m, L, '    ')), '  ')),
    field('sequences', block('[', ']', p.sequences.map((s: Sequence) => sequenceJson(s, L, '    ')), '  ')),
  ];
  if (p.presentations.length > 0) {
    f.push(field('presentations', block('[', ']', p.presentations.map((r: Presentation) => block('{', '}', [field('id', quote(r.id)),
      field('title', textJson(r.title, L, '      ')), field('path', `[${r.path.map((s: string) => quote(s)).join(', ')}]`)], '    ')), '  ')));
  }
  return block('{', '}', f, '') + '\n';
}
