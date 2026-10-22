// The site's own strings (nav, notices, home, get-started): site/src/i18n/<lang>.json, flat keys, English as the fallback per key.
// A key a language lacks shows English; tools/i18n-docs-check lists them. Docs pages are separate: docs/i18n/<lang>/ (docs/i18n/README.md).
import en from './en.json';
import fr from './fr.json';
import es from './es.json';
import it from './it.json';
import de from './de.json';

export const langs = ['en', 'fr', 'es', 'it', 'de'] as const;
export type Lang = (typeof langs)[number];
export const others = langs.filter((l) => l !== 'en');
export const names: Record<Lang, string> = { en: 'English', fr: 'Français', es: 'Español', it: 'Italiano', de: 'Deutsch' };
const tables: Record<string, Record<string, any>> = { en, fr, es, it, de };
export const strings = (lang: string): Record<string, any> => ({ ...en, ...(tables[lang] ?? {}) });
/** The pages that exist in every language; the others (philosophy, cli, demos...) stay English, the nav and the switcher link to them. */
export const hasLang = (rest: string) => rest === '' || rest.startsWith('get-started/') || rest.startsWith('docs/');
/** The path of a page in a language: /zinc/fr/docs/learn/ (English has no prefix). rest has no leading slash. */
export const route = (base: string, lang: string, rest: string) => (lang === 'en' || !hasLang(rest) ? `${base}${rest}` : `${base}${lang}/${rest}`);
