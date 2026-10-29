# zinc doc: generated and written documentation (ZN-856, 2026-10-29)

The owner, 2026-10-29: documentation that looks good and current, made automatically with room for pages written by hand, on the model
of Rust and Go: `zinc` generates it, plugins add what is theirs (a procedure, examples, screenshots, notes), themable and static, with
screenshots, tutorials, commands, Markdown and even MDX; exported as a folder or served by a small local server, as Rust does.

Shipped: `zinc doc` (src/doc, docs/guide/14-doc.md). Screenshots: [guide-light.png](zinc-doc/guide-light.png),
[engine-guide-dark.png](zinc-doc/engine-guide-dark.png), [api-dark.png](zinc-doc/api-dark.png).

## What the reference tools do

| Tool | Input | API from code | Pages | Output, serving | Runtime it needs | What we take |
|---|---|---|---|---|---|---|
| rustdoc / `cargo doc --open` | the crate | yes, from the compiler (items, signatures, `///` Markdown, intra-doc links) | `#![doc = include_str!]`, no site of guides | static `target/doc`, opened from disk; search index as a JS file | rustc | one command, static output that works from `file://`, the search index as a script, type names linked in signatures, items by kind |
| godoc / pkgsite | the module | yes, from go/doc (comments right above a declaration, plain `//` lines) | package overview from the package comment | `pkgsite` serves locally; pkg.go.dev | Go | doc comments are the comment right above, `//` lines count; the file's leading comment is the package overview |
| TypeDoc | TypeScript project | yes, through the TypeScript compiler (JSDoc tags) | `projectDocuments` Markdown | static; themes | Node, tsc | JSDoc tags (`@param`, `@returns`, `@example`, `@deprecated`, `@see`) laid out as sections |
| Starlight (Astro) | Markdown/MDX content | no (plugins) | yes: sidebar, ToC, Steps, Tabs, Aside, Card(Grid), LinkCard, code with copy, Pagefind search | static build, dev server with HMR | Node, Astro, Vite, npm install | the look (sidebar, on-page ToC, cards, callouts), the component names and the `syncKey` tabs |
| VitePress | Markdown (+ Vue) | no | yes: containers `::: tip`, code groups, local search (minisearch) | static, dev server | Node, Vite, Vue | the light/dark switch and the local search UX |
| Docusaurus | MDX | no (plugins) | yes, React MDX, admonitions, tabs | static, dev server | Node, React, Webpack | MDX as the authoring format people know |
| mdBook | Markdown + SUMMARY.md | no | yes, a book | static, `mdbook serve` with reload | one Rust binary | one binary, `serve` with reload over the same build |
| Nextra, Mintlify-style | MDX | no / OpenAPI | yes, polished components (Steps, Tabs, Callout, Card, Frame) | static or hosted | Node, Next.js / SaaS | the "modern" look: Inter-like type, soft borders, framed screenshots, step rails |

What the repository already had: `site/` is an Astro 7 site (`docs-map.mjs` publishes docs/learn, start, guide, reference, targets and a
list of top-level pages; `astro.config.mjs` rewrites links to GitHub); `docs/plugins/*.md` hold the plugin pages; plugin specs
(`plugins/*/native/*.spec.ts`) and modules (`plugins/*/index.ts`, `lib/std`, `lib/*.d.ts`) carry doc comments; md4c 0.6.0 is already vendored
and pinned for zinc:markdown (ZN-844); `src/frontend/lexer.cpp` reads every file the engine reads, .d.ts and .tsx included.

## The question and the options

Who uses it: Zinc's people (education, makers, artists) on modest machines, often offline, for whom zinc is one binary with no Node. A plugin
author writes pages next to the plugin. The engine's own reference must build from the checkout.

- **A. zinc generates content and runs Astro/Starlight** (the existing `site/`): the best-looking pages for free, but `zinc doc` would need
  Node, pnpm and an `npm install` (network, ~200 MB of node_modules) on the user's machine.
- **B. VitePress or Docusaurus**, the same shape as A.
- **C. Our own static generator inside zinc**: md4c (already pinned, MIT) for Markdown, the frontend's lexer for the API, a fixed set of MDX
  components rendered at build time, a theme compiled into the binary, a JSON search index and a small script.
- **D. TypeDoc for the API plus Starlight for pages**: two Node tools; TypeDoc goes through tsc, which does not know Zinc's `i32`/`f64` without
  the lib and fails on code tsc refuses.
- **E. Real MDX through `@mdx-js/mdx` in the vendored QuickJS**: true MDX expressions, but micromark + acorn + a JSX runtime to render to HTML
  (about 1 MB of JavaScript to vendor and keep), and components would still be ours.
- **F. mdBook** (a pinned download, like zig): a fine book, no API, no MDX, another binary to fetch on first use.

Scores (RULES.md §4: fit x3, performance x3, size x2, maintainability x2, licence and supply x2, portability x1, effort x1; max 70):

| Option | Fit | Perf | Size | Maint | Licence/supply | Port | Effort | Total |
|---|---|---|---|---|---|---|---|---|
| A. Astro/Starlight | 2 | 2 | 1 | 3 | 2 | 3 | 3 | 33 |
| B. VitePress/Docusaurus | 2 | 3 | 1 | 3 | 2 | 3 | 3 | 36 |
| **C. own generator in zinc** | **5** | **5** | **5** | **4** | **5** | **5** | **2** | **65** |
| D. TypeDoc + Starlight | 2 | 2 | 1 | 2 | 2 | 3 | 3 | 30 |
| E. MDX in QuickJS | 4 | 3 | 2 | 2 | 3 | 4 | 2 | 45 |
| F. mdBook | 3 | 5 | 3 | 3 | 4 | 4 | 3 | 51 |

Why C wins: it is the only option that keeps `zinc doc` working on the first run, offline, on a Raspberry Pi, with nothing installed; it builds
the whole engine reference (256 pages, 7,880 symbols, 67 plugins) in about 0.3 s on the M1 Pro; the parser is md4c, a proven library already
pinned (no Markdown parser written, RULES.md §3); the API reader is the engine's own lexer, so a file the engine reads documents.
What it costs: we own the theme and the component set (src/doc is about 2,800 lines, the theme 390 of them), and MDX is a subset (below).

## Sub-decisions

- **MDX without a JavaScript toolchain.** Components are a fixed set named after Starlight and Mintlify (Steps/Step, Tabs/Tab, Callout (and
  Aside), Cards/Card (and CardGrid, LinkCard), Command, Screenshot, Example, Details, ApiRef), turned into HTML blocks before md4c parses the
  page, so the Markdown inside them is Markdown. `import`/`export` lines are dropped, `{/* */}` comments removed; `{expressions}` are not
  evaluated (an attribute `{'x'}` or `{2}` is read as its text). An unknown component keeps its content with a warning. Revisit when a
  plugin needs its own component: a component written in Zinc and rendered by the engine at build time is the path, not Node.
- **Highlighting at build time.** TypeScript, TSX and JavaScript go through `src/frontend/lexer.cpp` (keywords, contextual keywords, Zinc's
  machine types, strings, templates, numbers, comments from the gaps); shell, JSON and C-like code through a 150-line scanner with keyword
  tables. Options weighed: highlight.js in the browser (BSD-3, ~120 KB with the languages, a page needs JavaScript to show colours, runs on
  every view on a slow tablet), Shiki (Node + Oniguruma). Pre-rendered spans cost the reader nothing and need no script; a highlighter is
  not on the "never write" list (regex, TLS, fonts, SQL, codecs, JSON).
- **API extraction from tokens, not the checker.** Exports at brace depth 0, signatures as the source text up to the body (dedented),
  members of classes and interfaces (private, protected, `_` and `#` names left out), overloads merged, `export * from './x'` followed, `declare
  module 'x'` blocks of lib/*.d.ts as modules. Doc comments: the `/** */` block or the `//` lines right above (godoc's rule), the file's
  leading comment as the module overview, JSDoc tags laid out (TypeDoc's sections). Doc comments are rendered with raw HTML off, so JSX in
  an example stays text. Ceiling: statement ends use an ASI rule of thumb; a parser-based reader if it misreads real code.
- **Search.** A JSON index written as `_zdoc/search-index.js` (a script, so it works from `file://` like rustdoc's), entries for pages,
  sections and every symbol and member, ranked by name match then section then text, ~80 lines of client code. Pagefind (a Rust binary,
  WebAssembly in the page) and lunr/minisearch were weighed; the engine site's index is 1.2 MB and answers at once. Upgrade path: vendor
  minisearch (MIT) if full-text ranking over larger sites matters.
- **Theme.** CSS variables on `:root` with a light set, a dark set (system preference, or the reader's choice kept in localStorage) and the
  Zinc brand's lime accent; a project's `docs/theme.css` (or `doc.theme`) is loaded after and overrides any variable. System font stacks, no
  web font (no network). Sidebar with folding plugin groups, on-page ToC that follows the reading, step rails, tabs, framed screenshots,
  cards, callouts, a terminal style for commands, prev/next, a search dialog (`/`, Cmd+K), a mobile drawer.
- **Links.** Pages link to each other by file, as on GitHub; links are rewritten to the site, heading anchors use GitHub's slugs so
  existing `#fragments` resolve; images and other files are copied (screenshots over 2400 px wide are scaled down); a link that leads
  outside the site keeps its text and is reported (`ZINC_DOC_WARNINGS=1`).
- **Serving.** `--serve` binds 127.0.0.1 only (port 7878 or the next free one; `--port 0` for any), serves the folder, polls the inputs'
  stamps every 0.5 s and rebuilds; pages poll `__zdoc/version` and reload (a static host answers 404 and the poll stops). It opens no browser.
- **Where it writes.** `build/doc` of the project (cargo's `target/doc`); `--std` outside the checkout writes `~/.zinc/doc/std`. It refuses a
  non-empty folder it did not make (no `_zdoc/` inside) and a folder that holds the sources.

## The decision (for the coordinator's record)

zinc doc is a static site generator inside zinc (option C, 65/70 against 51 for mdBook and 33 to 45 for the Node-based tools): md4c parses
Markdown, the frontend's lexer reads the API, MDX is a fixed set of components rendered at build time, code is highlighted at build time
(the frontend lexer for TS, small tables for shell, JSON and C), search is a prebuilt index in a script, the theme is CSS variables compiled
into zinc and overridden by a project's theme.css; `--out` exports, `--serve` serves with reload. Revisit if users need MDX expressions or
their own components (a Zinc-rendered component, not Node), or if the token-based API reader misreads real code (a reader over the parser).

## Measured

`zinc doc --std` on the M1 Pro (Release build): 256 pages, 7,880 symbols, 67 plugins in 0.30 s, 9.5 MB of output (most of it the copied
images), search index 1.2 MB. The fixture of tests/t0/doc.sh: 9 pages in 25 ms. Whole test (fixture, plugin alone, engine, serve): 5 s.
