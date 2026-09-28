import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const docs = defineCollection({
  loader: glob({
    base: '../docs',
    pattern: ['guide/*.md', 'plugins/*.md', 'targets/*.md', 'reports/*.md', 'decisions/*.md', '{ui-kit,ui,plugins,boards,studio,dev-mode,licenses}.md'],
  }),
});

export const collections = { docs };
