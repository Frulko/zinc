// zinc:i18n — the translations of Zinc's tools, read from the same files as the CLI (D159): `i18n/<lang>/<area>.json`, flat JSON,
// every key starting with its area (`atelier.cmd.save`), values with named `{placeholders}` and CLDR plural suffixes (`_one`, `_many`,
// `_other`). English is the source: a key or a file a language lacks shows the English text, and a key English lacks shows itself,
// never an empty string.
//   const tr = i18n.load('atelier');            the language of the user (language()), English beside it
//   tr.t('atelier.saved', ['name', 'main.ts'])   "Saved main.ts"; the params are name, value pairs
//   tr.n('atelier.problems', 3)                   atelier.problems_one / _many / _other by the CLDR rule of the language, {count} filled
// The language: ZINC_LANG, then `lang` in $ZINC_HOME/config.json (written by `zinc config set lang`, Atelier's Language setting and
// saveLanguage()), then the system's (locale() of zinc:sys), then English; `fr-CA` reads fr when there is no fr-CA. The files: ZINC_I18N_DIR
// (a translator tries a file without building), else the i18n/ of the engine this module belongs to.
import * as sys from 'zinc:sys';
import * as fs from 'zinc:fs';

/** The folder of the catalogs: ZINC_I18N_DIR, else the engine's i18n/ (this file is lib/std/i18n.ts of the engine), on the web the page's i18n/. */
export function root(): string {
  const d = sys.env('ZINC_I18N_DIR');
  if (d !== '') return d;
  return sys.platform() === 'web' ? 'i18n' : import.meta.dirname + '/../../i18n';   // a web build ships the catalogs as files i18n/<lang>/<area>.json of the page
}
/** Zinc's own folder for settings and caches: $ZINC_HOME, else ~/.zinc. */
export function home(): string { const h = sys.env('ZINC_HOME'); return h !== '' ? h : sys.env('HOME') + '/.zinc'; }
function configFile(): string { return home() + '/config.json'; }

/** A language tag as the files name it: 'fr_FR.UTF-8' and 'fr-fr' give 'fr-FR'; 'C' and 'POSIX' (no language) give ''. */
export function normalize(tag: string): string {
  let t = tag.trim();
  const dot = t.indexOf('.'), at = t.indexOf('@');
  if (dot >= 0) t = t.slice(0, dot);
  else if (at >= 0) t = t.slice(0, at);
  const parts = t.split('_').join('-').split('-');
  const lang = parts[0].toLowerCase();
  if (lang === '' || lang === 'c' || lang === 'posix') return '';
  return parts.length > 1 && parts[1] !== '' ? lang + '-' + parts[1].toUpperCase() : lang;
}
/** The `lang` of $ZINC_HOME/config.json, '' when it says none. */
export function savedLanguage(): string {
  try {
    const c: any = JSON.parse(fs.readText(configFile()));
    if (typeof c.lang === 'string') { const l: string = c.lang; return normalize(l); }
  } catch (e) { /* no file, or not JSON: nothing saved */ }
  return '';
}
/** The language of the user: ZINC_LANG, the saved setting, the system, else 'en'. */
export function language(): string {
  for (const said of [sys.env('ZINC_LANG'), savedLanguage(), sys.locale()]) { const l = normalize(said); if (l !== '') return l; }
  return 'en';
}
/** Writes `lang` into $ZINC_HOME/config.json and keeps every other key of it; false when it cannot (a config.json that is not a JSON object
 *  is left alone rather than replaced). */
export function saveLanguage(lang: string): boolean {
  let c: any = null;
  try { c = JSON.parse(fs.exists(configFile()) ? fs.readText(configFile()) : '{}'); } catch (e) { return false; }
  if (c === null || typeof c !== 'object') return false;
  c.lang = lang;
  try { fs.mkdir(home(), true); fs.writeText(configFile(), JSON.stringify(c) + '\n'); } catch (e) { return false; }
  return true;
}

/** The languages that have a catalog of `area`, English first. */
export function languages(area: string): string[] {
  const out: string[] = ['en'];
  try { for (const l of fs.list(root())) if (l !== 'en' && fs.exists(`${root()}/${l}/${area}.json`)) out.push(l); } catch (e) { }
  return out;
}

/** The CLDR cardinal category of `n` in `lang`: 'one', 'many' or 'other' (the rules of en, de, fr, es and it; other languages take
 *  English's until their rule is added). */
export function plural(lang: string, n: number): string {
  const l = normalize(lang).split('-')[0], a = Math.abs(n), i = Math.floor(a), whole = i === a;
  if (l === 'fr' ? i < 2 : l === 'es' ? a === 1 : whole && i === 1) return 'one';   // fr: 0, 1 and 1.5; es: n = 1; en, de, it: i = 1, v = 0
  if ((l === 'fr' || l === 'es' || l === 'it') && whole && i !== 0 && i % 1000000 === 0) return 'many';
  return 'other';
}

/** `{name}` replaced by the value of its pair; `{{` and `}}` are a brace. A placeholder without a value stays as it is. */
export function fill(text: string, params: string[]): string {
  if (text.indexOf('{') < 0 && text.indexOf('}') < 0) return text;
  let out = '';
  let k = 0;
  while (k < text.length) {
    const c = text.charAt(k);
    if ((c === '{' || c === '}') && text.charAt(k + 1) === c) { out += c; k += 2; continue; }
    const end = c === '{' ? text.indexOf('}', k) : -1;
    if (end > k) {
      const name = text.slice(k + 1, end);
      let found = false;
      for (let p = 0; p + 1 < params.length; p += 2) if (params[p] === name) { out += params[p + 1]; found = true; break; }
      if (found) { k = end + 1; continue; }
    }
    out += c;
    k++;
  }
  return out;
}

function read(path: string): Map<string, string> {
  const m = new Map<string, string>();
  try {
    const d: any = JSON.parse(fs.readText(path));
    for (const k in d) if (typeof d[k] === 'string') { const v: string = d[k]; m.set(k, v); }
  } catch (e) { /* missing or broken: the next one down answers */ }
  return m;
}

/** One area's texts in one language, with English beside it. */
export class Catalog {
  /** The language the texts are in ('en' when its file was not found). */
  lang: string;
  texts: Map<string, string>;
  english: Map<string, string>;
  constructor(lang: string, texts: Map<string, string>, english: Map<string, string>) { this.lang = lang; this.texts = texts; this.english = english; }
  /** Whether the key has a text, in this language or in English. */
  has(key: string): boolean { return this.texts.has(key) || this.english.has(key); }
  private raw(key: string): string {
    const v = this.texts.get(key);
    if (v !== undefined && v !== '') return v as string;
    const e = this.english.get(key);
    return e !== undefined && e !== '' ? e as string : key;
  }
  /** The text of `key`, its `{placeholders}` filled from the name, value pairs of `params`. */
  t(key: string, params: string[] = []): string { return fill(this.raw(key), params); }
  /** The plural form of `key` for `count` (key_one, key_many, key_other, then the bare key), with {count} and `params` filled. */
  n(key: string, count: number, params: string[] = []): string {
    const cat = plural(this.lang, count), all = params.concat(['count', `${count}`]);
    for (const k of [key + '_' + cat, key + '_other', key]) if (this.texts.has(k)) return fill(this.raw(k), all);
    const en = plural('en', count);
    for (const k of [key + '_' + en, key + '_other', key]) if (this.english.has(k)) return fill(this.raw(k), all);
    return key;
  }
}

/** The catalog of `area` in `lang` (default: language()): <root>/<lang>/<area>.json, else the file of its base language (fr for fr-CA),
 *  with English underneath. */
export function load(area: string, lang: string = ''): Catalog {
  const want = normalize(lang !== '' ? lang : language()), dir = root();
  const english = read(`${dir}/en/${area}.json`);
  for (const l of [want, want.split('-')[0]]) {
    if (l === 'en') return new Catalog('en', english, english);
    if (l !== '' && fs.exists(`${dir}/${l}/${area}.json`)) return new Catalog(l, read(`${dir}/${l}/${area}.json`), english);
  }
  return new Catalog('en', english, english);
}
