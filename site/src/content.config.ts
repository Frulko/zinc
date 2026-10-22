import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { patterns } from '../docs-map.mjs';

const docs = defineCollection({ loader: glob({ base: '../docs', pattern: patterns }) });

export const collections = { docs };
