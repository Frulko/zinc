// The words of Atelier (ZN-774.06, D159): every text the interface shows comes from i18n/<lang>/atelier.json of the engine through
// zinc:i18n, in the language of the user (ZINC_LANG, the Language setting saved in ~/.zinc/config.json, the system's, else English).
// `t` reads a signal: a view that shows a text follows a change of language; the desktop menu is built again (setOnLanguage).
import { createSignal } from 'zinc:ui/solid';
import * as i18n from 'zinc:i18n';

const [catalog, setCatalog] = createSignal<i18n.Catalog>(i18n.load('atelier'));
/** The language the texts are in ('fr' for a user of fr-CA, 'en' when the language has no catalog). */
export function lang(): string { return catalog().lang; }
/** The text of `key`, its `{placeholders}` filled from name, value pairs: t('atelier.file.saved', ['name', 'main.ts']). */
export function t(key: string, params: string[] = []): string { return catalog().t(key, params); }
/** The plural form of `key` for `count`: tn('atelier.console.problems', 2) reads atelier.console.problems_other. */
export function tn(key: string, count: number, params: string[] = []): string { return catalog().n(key, count, params); }
export function has(key: string): boolean { return catalog().has(key); }

/** The languages Atelier has a catalog for, English first. */
export const LANGUAGES: string[] = i18n.languages('atelier');
/** A language's name in that language ('Français'), from its own catalog. */
export function languageName(code: string): string { return i18n.load('atelier', code).t('atelier.language.name'); }

let onLanguage: () => void = () => {};
export function setOnLanguage(f: () => void): void { onLanguage = f; }
/** Shows Atelier in `code` from now on and saves it for the next start (and for the CLI: the same `lang` of config.json). */
export function setLanguage(code: string): void {
  setCatalog(i18n.load('atelier', code));
  i18n.saveLanguage(code);
  onLanguage();
}
