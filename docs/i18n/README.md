# Translating the docs and the site (D159)

Zinc speaks English, French (`fr`), Spanish (`es`), Italian (`it`) and German (`de`). English is the source: a page that is not
translated yet shows its English version with a notice, so a language can grow page by page.

The words and the register (vous, tú, tu, du) are fixed in `i18n/glossary.md`: read it first.

## What is translated

The onboarding set, in every language:

- `docs/start/choose.md`, `docs/start/styles.md`, `docs/reference/syntax.md`, `docs/guide/01-getting-started.md`
- `docs/learn/README.md` and the lessons `docs/learn/NN-*.md`
- the site's home page and get-started page, and its menu and notices (`site/src/i18n/<lang>.json`)
- one `README.<lang>.md` beside the `README.md` of each template of `templates/` (`zinc new` copies the one for the language)

`tools/i18n-docs-check --list <lang>` prints the pages of the set a language still lacks. Reports, decisions and the other docs
are not translated.

## A doc page

1. The file goes in `docs/i18n/<lang>/`, with the same path as the English file: `docs/learn/01-window-and-shape.md` becomes
   `docs/i18n/fr/learn/01-window-and-shape.md`.
2. Translate the prose, the headings, the alt text of the images and the link texts. Keep the structure (same headings in the
   same order, same list items).
3. **Never translate**: fenced code blocks (copy them as they are, comments included), `inline code`, command names and flags
   (`zinc run`, `--lang`), file and folder names, module names (`zinc:gfx`), error codes (`Z0103`), URLs. The brand and product
   names stay (Zinc, Atelier, TypeScript, Fast Refresh). A code sample that prints a message may keep the English output.
4. **Links and images keep the target of the English file**, even though your file lives one folder deeper
   (`![...](img/01-window-and-shape.png)`, `[syntax](../reference/syntax.md)`). The site resolves them from the English place and
   keeps the reader in the language. Only the link text is translated. Anchors (`#a-heading`) follow your headings.
5. Start the file with the frontmatter that records which English file you translated:

   ```
   ---
   source: <git sha>
   ---
   ```

   Do not type the sha by hand: commit the English file first (it is, as long as you start from a clean `develop`), write the
   translation, then run `tools/i18n-docs-check --stamp docs/i18n/<lang>/<path>.md`. It writes the last commit of the English file.
   When the English page changes later, the site shows "the English page changed after this translation" on your page and the
   check lists it as stale: update the translation, run `--stamp` again.

## The site's own words

`site/src/i18n/en.json` holds every string of the menu, the footer, the notices, the home page and the get-started page.
`site/src/i18n/<lang>.json` holds your translation of the same keys: copy the keys you translate, leave out the others (English
shows for a missing key). Keep the keys, the `{placeholders}` (`{base}`, `{sources}`) and the HTML (`<code>`, `<a href="...">`) of
the English value; arrays (`home.feats`, `home.engines`, `start.targets`) keep their order and length. Product data that is
not prose (the numbers of the engines table, the commands, the demo captions in `site/src/data/site.ts`) stays English.

## A template README

`templates/<name>/README.<lang>.md` next to `README.md`, translated as a doc page (no frontmatter, the same code blocks).

## The check

```sh
tools/i18n-docs-check                      # errors fail, warnings and info are listed
tools/i18n-docs-check --list es            # what Spanish still lacks
tools/i18n-docs-check --stamp docs/i18n/es/learn/README.md
tests/run --only i18n_docs                 # the same check as a T0 test
```

An error: the English file does not exist, `source` is missing or is not a commit, the fenced code blocks or the link and image
targets differ from the English file's, or a site key is not in `en.json`. A warning: the page is stale. Info: pages or site strings
not translated yet.

To see the site: `cd site && pnpm install && pnpm dev`, then open `/zinc/fr/` (the language switcher in the menu lists the five).
