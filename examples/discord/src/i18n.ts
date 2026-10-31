// The words of the app (ZN-922): every text the interface shows comes from i18n/<lang>/discord.json of the engine through zinc:i18n, in the
// language of the user (ZINC_LANG, the choice of Settings > Appearance saved in ~/.zinc/config.json, the system's, else English). English is the
// source; a key a language lacks shows the English text. Discord's own content (messages, server and channel names) is never translated.
//   tr('discord.call.mute')                       "Mute"
//   tr('discord.settings.sensitivity', ['db', '-40'])   "Nothing is sent while the microphone stays under -40 dB…"
//   trn('discord.poll.votes', 3)                  discord.poll.votes_one / _other
import * as i18n from 'zinc:i18n';

let catalog: i18n.Catalog = i18n.load('discord');
/** The languages the app has a catalog for, English first. */
export const LANGUAGES: string[] = i18n.languages('discord');
/** The language the texts are in ('fr' for a user of fr-CA, 'en' when the language has no catalog). */
export function lang(): string { return catalog.lang; }
/** The text of `key`, its `{placeholders}` filled from name, value pairs. */
/** The values may be numbers: they are written as text. */
export function tr(key: string, params: any[] = []): string { return catalog.t(key, texts(params)); }
function texts(params: any[]): string[] { const out: string[] = []; for (const p of params) out.push(`${p}`); return out; }
/** The plural form of `key` for `count` (key_one, key_other...), {count} filled. */
export function trn(key: string, count: number, params: any[] = []): string { return catalog.n(key, count, texts(params)); }
/** A language's name in that language ('Français'). */
export function languageName(code: string): string { return i18n.load('discord', code).t('discord.language.name'); }
/** Shows the app in `code` from the next render and keeps it for the next start. */
export function setLanguage(code: string): void { catalog = i18n.load('discord', code); i18n.saveLanguage(code); }
