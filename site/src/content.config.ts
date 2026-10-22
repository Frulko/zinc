import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { patterns } from '../docs-map.mjs';

const docs = defineCollection({ loader: glob({ base: '../docs', pattern: patterns }) });
// Translations (docs/i18n/README.md): docs/i18n/<lang>/<same path as the English file>.md, ids "fr/learn/01-window-and-shape".
const docsI18n = defineCollection({ loader: glob({ base: '../docs/i18n', pattern: '{fr,es,it,de}/**/*.md' }) });

export const collections = { docs, docsI18n };
