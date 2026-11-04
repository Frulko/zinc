// The words of the editor: assets/i18n/<lang>.json, flat, with `{placeholders}` and CLDR plural suffixes (zinc:i18n). English is the source: a key
// a language lacks shows the English text. A new language is its file and a line in LANGUAGES. What the user named (layers, media) is never translated.
//   tr('mapper.history.empty')                   "Nothing yet"
//   tr('mapper.clip.where', ['layer', name])     {layer} filled from name, value pairs
//   trn('mapper.tasks.running', 3)               ..._one, ..._other
import { readText } from 'zinc:assets';
import * as i18n from 'zinc:i18n';
import * as storage from 'zinc:storage';
import { createSignal } from 'zinc:ui/solid';

export const LANGUAGES: string[] = ['en', 'fr'];
const LANGUAGE_KEY = 'mapper-language';

function texts(lang: string): Map<string, string> {
  const words = new Map<string, string>();
  const file: any = JSON.parse(readText(`i18n/${lang}.json`));
  for (const key in file) words.set(key, file[key] as string);
  return words;
}

function catalogOf(lang: string): i18n.Catalog { return new i18n.Catalog(lang, texts(lang), texts('en')); }

function firstLanguage(): string {
  const said = storage.keys().includes(LANGUAGE_KEY) ? storage.get(LANGUAGE_KEY) : i18n.language();
  const base = i18n.normalize(said).split('-')[0];
  return LANGUAGES.includes(base) ? base : 'en';
}

let catalog: i18n.Catalog = catalogOf(firstLanguage());
const [shown, setShown] = createSignal<string>(catalog.lang);

/** The language shown; what reads it is built again when it changes. */
export function language(): string { return shown(); }

/** The text of `key`, its `{placeholders}` from name, value pairs. */
export function tr(key: string, params: string[] = []): string { return catalog.t(key, params); }

/** The plural form of `key` for `count`, {count} filled. */
export function trn(key: string, count: number, params: string[] = []): string { return catalog.n(key, count, params); }

/** A language's name in that language. */
export function languageName(lang: string): string { return catalogOf(lang).t('mapper.language.name'); }

/** Shows the editor in `lang` and keeps the choice with this browser or client. */
export function setLanguage(lang: string): void {
  catalog = catalogOf(lang);
  storage.set(LANGUAGE_KEY, lang);
  setShown(lang);
}
