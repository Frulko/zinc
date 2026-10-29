// Demo dataset: links to file into six folders.
//
// `folder` is the ground truth — the folder where the fictional user actually files this
// link. The demos only use it to replay a sorting session automatically and show the model's
// accuracy climb; in normal use the user's gesture decides, and the model obviously has
// access to nothing of the sort.

export interface Link {
  id: number;
  host: string;
  title: string;
  excerpt: string;
  tags: string[];
  folder: string;
}

export const zones = [
  { id: 'dev', label: 'dev', icon: '⌘', color: '#4a54f2' },
  { id: 'ai', label: 'ai', icon: '◑', color: '#8b5cf6' },
  { id: 'design', label: 'design', icon: '◈', color: '#ec4899' },
  { id: 'home', label: 'home', icon: '⌂', color: '#f59e0b' },
  { id: 'watch', label: 'watch', icon: '◎', color: '#10b981' },
  { id: 'to read', label: 'to read', icon: '▤', color: '#64748b' },
];

const raw: Array<[string, string, string, string[], string]> = [
  ['github.com', 'tokio-rs/axum', 'Ergonomic and modular web framework for Rust', ['rust', 'web', 'async'], 'dev'],
  ['github.com', 'oven-sh/bun', 'All-in-one JavaScript runtime written in Zig', ['javascript', 'runtime', 'zig'], 'dev'],
  ['github.com', 'sqlite/sqlite', 'The most widely deployed embedded database engine', ['sqlite', 'c', 'database'], 'dev'],
  ['github.com', 'BurntSushi/ripgrep', 'Recursive line-oriented search, very fast', ['rust', 'cli', 'search'], 'dev'],
  ['github.com', 'sharkdp/fd', 'A simple, fast alternative to find', ['rust', 'cli'], 'dev'],
  ['github.com', 'astral-sh/uv', 'Python package manager written in Rust', ['rust', 'python', 'packaging'], 'dev'],
  ['github.com', 'microsoft/TypeScript', 'Typed JavaScript that compiles to JavaScript', ['typescript', 'compiler'], 'dev'],
  ['github.com', 'vitejs/vite', 'Next generation frontend tooling', ['javascript', 'build', 'web'], 'dev'],
  ['news.ycombinator.com', 'SQLite is not a toy database', 'Why SQLite holds up in production more often than people think', ['sqlite', 'database'], 'dev'],
  ['news.ycombinator.com', 'The case for monorepos', 'What six years of a single repository actually taught us', ['monorepo', 'process'], 'dev'],
  ['developer.mozilla.org', 'Pointer events', 'One event model for mouse, touch and pen', ['web', 'javascript', 'api'], 'dev'],
  ['developer.mozilla.org', 'IndexedDB API', 'Transactional database on the browser side', ['web', 'storage', 'api'], 'dev'],
  ['developer.mozilla.org', 'CSS color-mix()', 'Mixing two colours straight from CSS', ['css', 'web'], 'design'],

  ['arxiv.org', 'Attention Is All You Need', 'The transformer architecture, no recurrence, no convolution', ['ml', 'transformer', 'nlp'], 'ai'],
  ['arxiv.org', 'Online Learning and Online Convex Optimization', 'A survey of regret guarantees in online learning', ['ml', 'online', 'theory'], 'ai'],
  ['arxiv.org', 'Adaptive Subgradient Methods', 'AdaGrad: one step size per coordinate, tuned on its own', ['ml', 'optimisation'], 'ai'],
  ['arxiv.org', 'A Few Useful Things to Know About Machine Learning', 'The classic pitfalls, explained without formalism', ['ml', 'practice'], 'ai'],
  ['huggingface.co', 'sentence-transformers/all-MiniLM-L6-v2', 'Small sentence embedding model', ['ml', 'embeddings', 'nlp'], 'ai'],
  ['huggingface.co', 'Text Embeddings Inference', 'An inference server dedicated to embeddings', ['ml', 'embeddings', 'server'], 'ai'],
  ['distill.pub', 'Why Momentum Really Works', 'Momentum explained visually', ['ml', 'optimisation', 'viz'], 'ai'],
  ['github.com', 'ggml-org/llama.cpp', 'Language model inference in C/C++', ['ml', 'inference', 'cpp'], 'ai'],
  ['github.com', 'facebookresearch/faiss', 'Similarity search over dense vectors', ['ml', 'embeddings', 'index'], 'ai'],

  ['figma.com', 'Variables and modes', 'Theming a component system without duplicating it', ['design', 'figma', 'tokens'], 'design'],
  ['practicaltypography.com', 'Typewriter habits', 'The typewriter reflexes worth unlearning', ['typography', 'design'], 'design'],
  ['ia.net', 'The 100% Easy-2-Read Standard', 'Tuning the readability of a long text', ['typography', 'design', 'reading'], 'design'],
  ['refactoringui.com', 'Establish a spacing system', 'A spacing scale instead of eyeballed pixels', ['design', 'ui', 'system'], 'design'],
  ['fonts.google.com', 'Inter', 'A typeface designed for on-screen interfaces', ['typography', 'design', 'font'], 'design'],
  ['lawsofux.com', "Fitts's Law", 'Time to reach a target depends on its size and distance', ['ux', 'design', 'theory'], 'design'],
  ['cassie.codes', 'Animating SVG paths', 'Line drawing, without a library', ['svg', 'animation', 'web'], 'design'],

  ['ikea.com', 'PAX planner', 'Composing a made-to-measure wardrobe', ['furniture', 'storage', 'home'], 'home'],
  ['thespruce.com', 'Hanging a wall shelf', 'Anchors, level, stud spacing', ['diy', 'home', 'howto'], 'home'],
  ['seriouseats.com', 'Naturally leavened bread', 'Autolyse, bulk ferment, proof', ['cooking', 'bread', 'recipe'], 'home'],
  ['seriouseats.com', 'Winter vegetable stew', 'One pot, two hours, nothing to watch', ['cooking', 'recipe'], 'home'],
  ['bbcgoodfood.com', 'Fig jam', 'Ratios and cooking times', ['cooking', 'recipe', 'preserve'], 'home'],
  ['youtube.com', 'Sharpening a knife on a whetstone', 'Angle, pressure, upkeep', ['cooking', 'tool', 'howto'], 'home'],
  ['youtube.com', 'Fixing a toilet cistern', 'Diagnosis and the parts you actually need', ['diy', 'plumbing', 'howto'], 'home'],
  ['gardenersworld.com', 'Pruning an apple tree', 'When, where, and above all why', ['garden', 'pruning', 'home'], 'home'],

  ['x.com', '@simonw on local models', 'Thread on what really runs on a laptop', ['ml', 'local', 'thread'], 'watch'],
  ['x.com', '@dan_abramov on server components', 'Thread rebuilding the mental model from scratch', ['react', 'web', 'thread'], 'watch'],
  ['x.com', '@jaffathecake on view transitions', 'A demo in three posts', ['web', 'css', 'thread'], 'watch'],
  ['reddit.com', 'r/rust — one year in production', 'What aged well and what turned expensive', ['rust', 'retro', 'production'], 'watch'],
  ['reddit.com', 'r/selfhosted — backups that hold', 'The 3-2-1 strategy, actually applied', ['selfhosting', 'backup'], 'watch'],
  ['lobste.rs', 'Writing a search engine in a weekend', 'BM25 end to end, no library', ['search', 'bm25', 'project'], 'watch'],
  ['changelog.com', 'The maintainers podcast', 'An episode on open source burnout', ['opensource', 'podcast'], 'watch'],

  ['medium.com', '@handle — Naive Bayes, how naive exactly?', 'What the independence assumption costs in practice', ['ml', 'bayes', 'article'], 'to read'],
  ['medium.com', '@handle — Twenty years of recommender systems', 'From collaborative filtering to embeddings', ['ml', 'reco', 'article'], 'to read'],
  ['substack.com', 'The Friday letter', 'Long form on attention and interfaces', ['essay', 'reading'], 'to read'],
  ['newyorker.com', 'The art of decision fatigue', 'Why sorting tires you more than choosing', ['essay', 'psychology', 'reading'], 'to read'],
  ['nature.com', 'On the memory of gestures', 'What repetition writes in, and what it erases', ['science', 'reading'], 'to read'],
  ['longform.org', 'A year without notifications', 'An account of a twelve-month experiment', ['essay', 'attention', 'reading'], 'to read'],
];

export const links: Link[] = raw.map(([host, title, excerpt, tags, folder], id) => ({
  id,
  host,
  title,
  excerpt,
  tags,
  folder,
}));

/** What the model looks at. The host decides — the library knows none of these fields. */
export const meta = (l: Link) => ({ domain: l.host, tag: l.tags, title: l.title });

/** Deterministic shuffle: the demo is the same on every visit. */
export function shuffled(seed = 11): Link[] {
  const out = [...links];
  let a = seed;
  for (let i = out.length - 1; i > 0; i--) {
    a = (a * 1664525 + 1013904223) >>> 0;
    const j = a % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
