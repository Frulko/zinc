// zinc:i18n (ZN-774.06): the catalogs of i18n/<lang>/<area>.json, run by tests/t0/zinc_i18n.sh with ZINC_I18N_DIR on the i18n/ beside this
// file and ZINC_HOME on a scratch folder. It prints what the module answers; main.expected is the golden.
import * as i18n from 'zinc:i18n';
import * as fs from 'zinc:fs';

console.log('language ' + i18n.language());
console.log('languages ' + i18n.languages('demo').join(' '));
for (const tag of ['fr_FR.UTF-8', 'fr-ca', 'de', 'C', 'POSIX', 'pt_br', 'en_US.UTF-8@euro', '']) console.log(`normalize '${tag}' '${i18n.normalize(tag)}'`);
for (const lang of ['en', 'de', 'fr', 'es', 'it'])
  console.log('plural ' + lang + ' ' + [0, 1, 1.5, 2, 21, 1000000].map((n: number) => i18n.plural(lang, n)).join(' '));

const fr = i18n.load('demo', 'fr-CA');
console.log(`fr-CA reads ${fr.lang}: ${fr.t('demo.saved', ['name', 'main.ts'])} | ${fr.n('demo.files', 0)} | ${fr.n('demo.files', 1.5)} | ${fr.n('demo.files', 2)} | ${fr.n('demo.files', 1000000)}`);
console.log(`fr order: ${fr.t('demo.order', ['name', 'Ada', 'count', '3'])} | ${fr.t('demo.braces', ['name', 'x'])}`);
console.log(`fr falls back: ${fr.t('demo.only_english')} | ${fr.t('demo.nowhere')} | has ${fr.has('demo.only_english')} ${fr.has('demo.nowhere')}`);
const en = i18n.load('demo', 'en');
console.log(`en: ${en.n('demo.files', 0)} | ${en.n('demo.files', 1)} | ${en.n('demo.files', 1.5)} | ${en.t('demo.saved')}`);
const missing = i18n.load('demo', 'it');
console.log(`it has no file: ${missing.lang} ${missing.t('demo.saved', ['name', 'a.ts'])}`);
const none = i18n.load('nothing', 'fr');
console.log(`no file at all: ${none.t('nothing.key')} | ${none.n('nothing.key', 2)}`);

// the saved language: written with the other keys of config.json kept
const cfg = i18n.home() + '/config.json';
fs.writeText(cfg, '{"welcomed":true,"lang":"es"}');
console.log('saved ' + i18n.savedLanguage());
console.log('save ' + i18n.saveLanguage('de') + ' ' + fs.readText(cfg).trim());
fs.writeText(cfg, 'not json');
console.log('save over a broken file ' + i18n.saveLanguage('fr') + ' ' + fs.readText(cfg).trim());
fs.remove(cfg);
console.log('save without a file ' + i18n.saveLanguage('it') + ' ' + fs.readText(cfg).trim());
