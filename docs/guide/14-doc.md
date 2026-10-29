# Documentation: zinc doc

`zinc doc` makes the documentation of your project as a website, the way `cargo doc` does for Rust and `godoc` for Go. It reads your
code (what each module exports, with its doc comments) and the pages you write in Markdown or MDX, and writes a static folder you can
open, copy to any web host, or serve on your machine while you write. Everything it needs is inside `zinc`: it downloads nothing and
needs no Node.js.

```sh
zinc doc                  # build/doc/index.html: open it in a browser
zinc doc --serve          # http://127.0.0.1:7878/, rebuilt when you save a page or a source
zinc doc --out site       # the folder somewhere else (a web host, a USB key)
zinc doc --std            # the engine's own documentation: guides, standard library, every plugin
```

`--serve` prints the address and opens nothing: open it yourself. It picks the next free port when 7878 is taken (`--port 9000` asks for
one, `--port 0` for any free one), and a page you have open reloads by itself when the site is rebuilt. Ctrl-C stops it.

## What goes in the site

| Part | Where it comes from |
|---|---|
| Home | `docs/index.md` (or `index.mdx`, or `README.md`), else a page with your project's name, its `description` and cards to the rest |
| Guides | every `.md` and `.mdx` file of `docs/` and its sub-folders (a sub-folder is a group in the sidebar) |
| API | every `.ts` and `.tsx` file of `src/`: what it exports, with signatures and doc comments; tests (`*.test.ts`) are left out |
| Plugins | the plugins of your `plugins/` folder, and the engine plugins your code imports (`import ... from 'zinc:sqlite'`): their pages and their API |

`zinc.json` can change each of these:

```json
{
  "name": "starfield",
  "description": "Collect the stars before they drift away.",
  "doc": {
    "title": "Starfield",
    "pages": "docs",
    "api": ["src", "lib/extra.ts"],
    "theme": "docs/theme.css"
  }
}
```

A folder with a `plugin.json` and no `zinc.json` is documented as that plugin alone: its overview is the home page.

## Pages

A page is Markdown as GitHub shows it: headings, lists, tables, task lists, footnotes, links and images, code blocks with highlighting.
Each heading gets an anchor (the same `#fragment` GitHub gives it), H2 and H3 go in the "On this page" column, and every code block has a
copy button.

A page may start with a front matter:

```md
---
title: Getting started
description: From nothing to a running game.
order: 1
---
```

`title` replaces the first `# heading` (and the file name), `description` is the line under the title and the text of its card on the
home page, `order` sorts the pages of a folder (else the file name does: `01-install.md`, `02-run.md`).

A link to another page is written to its file (`[the notes](02-notes.md#limits)`), the way GitHub reads it; `zinc doc` turns it into the
page of the site. An image or any other file a page links to is copied into the site. A link to something that is not in the site
(a source file, a report) keeps its text and loses its link, and `zinc doc` says so in its warnings (`ZINC_DOC_WARNINGS=1` lists them all).

Notes as GitHub writes them become coloured boxes:

```md
> [!TIP]
> `zinc dev` swaps a saved file into the running game.
```

The kinds are `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and `CAUTION`.

## MDX: steps, tabs, commands, screenshots

A `.mdx` page can use these components between its Markdown. They are drawn when the site is built: no JavaScript toolchain runs, and
`import` and `export` lines are left out (write them if your editor wants them).

````mdx
<Steps>
  <Step title="Install Zinc">
    <Command>zinc doctor</Command>
  </Step>
  <Step title="Run the game">
    Open a terminal in the project, then `zinc run`.
  </Step>
</Steps>

<Tabs>
  <Tab label="macOS">Press <kbd>Cmd</kbd>+<kbd>Q</kbd> to quit.</Tab>
  <Tab label="Linux">Press <kbd>Ctrl</kbd>+<kbd>Q</kbd> to quit.</Tab>
</Tabs>

<Callout type="warning" title="Careful">
  Always put a resistor in series with the LED.
</Callout>

<Screenshot src="img/game.png" alt="The game" title="Starfield" caption="The first level." />

<Example title="Blink twice a second" screenshot="img/board.png">
```ts
import { blink } from 'zinc:blink';
blink(13, 2);
```
</Example>

<Cards>
  <Card title="Getting started" href="01-getting-started.mdx" icon="▶">Install, run, change.</Card>
</Cards>

The game is one <ApiRef name="World" /> that moves on every frame.
````

| Component | What it shows |
|---|---|
| `<Steps>` with `<Step title>` | numbered steps on a line (a plain numbered list inside `<Steps>` works too) |
| `<Tabs>` with `<Tab label>` | one tab at a time; the tab a reader picks is picked in every group of the site |
| `<Callout type title>` | a box: `note`, `tip`, `warning`, `danger`, `important` |
| `<Command>` | a terminal line with a copy button that copies the command without its `$` |
| `<Screenshot src alt title caption frame="none">` | an image in a window frame, sized from the file; very large images are scaled down to 2400 pixels |
| `<Example title screenshot>` | a code example with what it shows under it |
| `<Cards>` with `<Card title href icon>` | a grid of links |
| `<Details summary>` | a part the reader opens |
| `<ApiRef name>` | a link to a class, function or type of the API (`World`, `World.step`, `zinc:sqlite.Database`) |

Another component keeps its content and `zinc doc` warns about it.

## Doc comments

A doc comment is the `/** ... */` block (or the `//` lines) right above an export, written in Markdown. The usual JSDoc tags are laid out:

```ts
/**
 * Moves everything by one time step.
 * @param dt the time step, in seconds
 * @returns the number of stars taken during the step
 * @example
 * world.step(1 / 60);
 */
step(dt: f64): i32 { ... }
```

`@param`, `@returns`, `@throws`, `@example`, `@see` and `@deprecated` are understood. The comment at the top of a file describes the module.
Private and protected members, and names that start with `_`, stay out of the site. Type names in signatures link to their page.

## A plugin's pages

A plugin documents itself in its own `docs/` folder; `zinc doc` puts these pages next to the API it reads from the plugin's entry and its
native spec (the records and the functions of `native/<name>.spec.ts`):

```
plugins/blink/
  plugin.json
  index.ts                  the API: its exports and doc comments
  native/blink.spec.ts      the native interface: its records and functions
  docs/
    index.md                the overview (the plugin's first page)
    01-wiring.mdx           a tutorial: steps, a screenshot, an example
    02-notes.md             what to know
    img/board.png           images the pages show
```

Without `docs/index.md`, the overview is the engine's `docs/plugins/<name>.md` for an engine plugin, else the description of `plugin.json`.
The overview shows the module's name, its targets and an `import` line to start from.

## Themes

The look is a set of CSS variables. A `docs/theme.css` (or the file `doc.theme` names) is loaded after the default theme, so it only says
what it changes:

```css
:root { --accent: #7c5cff; --accent-ink: #5b3fd6; --accent-soft: #efeaff; }
:root[data-theme="dark"] { --accent: #a48bff; --accent-ink: #b9a6ff; --accent-soft: #1d1733; }
```

The variables: colours (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--accent`, `--code-bg`, the code colours `--tok-*`, the
callout colours `--note`, `--tip`, `--warning`, `--danger`), the fonts `--sans` and `--mono`, and the sizes `--content`, `--sidebar`,
`--radius`. Pages follow the light or dark setting of the system until the reader picks one with the button at the top.

## Search

Search is in every page (the box at the top, or the `/` key, or Cmd+K): pages, sections and every symbol of the API, by name first. Its
index is written next to the pages (`_zdoc/search-index.js`), so it works without a server, from a folder opened in a browser.
