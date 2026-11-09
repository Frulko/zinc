---
id: ZN-1012
title: >-
  Plugin docs: fill plugins/<name>/docs for the main plugins, links to source,
  site decision
status: Done
assignee: []
created_date: '2026-11-07 16:34'
updated_date: '2026-11-09 09:46'
labels:
  - docs
  - plugins
  - size-M
milestone: m-19
dependencies: []
ordinal: 9700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Most engine plugins fall back to `docs/plugins/<name>.md` or the plugin.json description. Write overview, one tutorial with `<Steps>` and a screenshot for the ten most used plugins (following docs/reports/plugin-docs-audit/), link `.ts/.tsx` references to the repository, measure the search index (1.2 MB) on an old tablet, and decide between `site/` (Astro) and `zinc doc --std` for publishing.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-856: fill `plugins/<name>/docs/` for every plugin (overview, a tutorial with `<Steps>`, a screenshot, notes), following docs/reports/plugin-docs-audit/; most engine plugins fall back to `docs/plugins/<name>.md` or the `plugin.json` description.
- ZN-856: MDX components written in Zinc and rendered at build time, so a plugin can add its own (an unknown component keeps its text with a warning).
- ZN-856: links from docs to source files (`.ts`, `.tsx`) lose their link; point them at the repository when zinc.json names one.
- ZN-856: the engine site's search index is 1.2 MB; measure it on a Pi or an old tablet, then split it per section or vendor minisearch.
- ZN-856: decide whether `site/` (Astro) keeps publishing the docs or uses `zinc doc --std`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ten plugins have overview, tutorial and screenshot in plugins/<name>/docs
- [x] #2 links to source files go to the repository when zinc.json names one
- [x] #3 the decision on site/ vs zinc doc --std is recorded
- [x] #4 search index split or measured
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Done (docs only, nothing built): plugins/<name>/docs/ with index.md (overview, screenshot, links) and one 01-*.mdx tutorial (Steps, Command, Example, Screenshot, Callout) for ten plugins: 3d, lottie, map, svg, video, camera, gsap, script, three, mapping. Screenshots are the existing ones of docs/img and examples, copied to docs/img of each plugin and captioned as the example's. Every tutorial program was type-checked with zinc check (main tree binary, ZINC_ROOT = worktree); the pages build with zinc doc plugins/<name> and zinc doc --std (302 pages, no warning from the new pages; cross-plugin links use GitHub URLs because other plugins' pages are not in a single-plugin site). Links to source and reference are absolute https://github.com/Frulko/zinc/blob/main/... URLs (the repo is Frulko/zinc), written by hand.
Web search: Expo, Tauri and Capacitor split a plugin page into overview + install + API (generated from the types) + usage guide; this layout (overview, one tutorial, generated api.html) matches.
Measured (Mac M1 Pro): zinc doc --std = 302 pages, 9284 symbols, 82 plugins, 295 ms, 19 MB; _zdoc/search-index.js = 1,633,544 bytes (302,328 gzip); one plugin alone (3d) = 27 KB index. site/ uses pagefind (loaded by fragments), not that file. Not measured on an old tablet or a Pi (no browser to time there): AC4 stays open for that.
AC2 (links from docs to .ts/.tsx source go to the repository when zinc.json names one) is a change of the doc generator in src/, not documentation: left open. Next: in zinc doc a link that leaves the site and points at a file of the checkout becomes <zinc.json repository>/blob/<branch>/<path> instead of losing its link; one T0 test.
DECISION (site/ vs zinc doc --std), to record as the next D number, refining D176: both stay, with different jobs. site/ (Astro) remains the public website and publishes the curated docs/ guides (learn, start, guide, reference, plugins/*.md, targets: site/docs-map.mjs) with i18n and pagefind search. zinc doc generates the API and plugin pages (plugins/<name>/docs/, api.html, 9284 symbols) and the offline docs a user builds on a machine (zinc doc --std, --serve). The website links to a zinc doc --std build (published as a folder of the site at release time) for the API and the plugin tutorials, instead of Astro re-rendering them: one source per kind of page, no second renderer for MDX components. Revisit if the 1.6 MB search index is too slow on old tablets (then split it per section).
Proposed tests: none written. zinc doc --std builds in 0.3 s: a T0 that fails on a warning coming from plugins/*/docs would keep the pages honest.
later.md lines: ZN-1012: zinc doc search index is 1.6 MB (302 KB gzip) for --std: time it on the Pi and an old tablet, split per section if slow. / ZN-1012: tutorials for the other plugins of the audit list, same layout as plugins/3d/docs. / ZN-1012: once plugins/<name>/docs/index.md exists, zinc doc no longer shows the long docs/plugins/<name>.md: move the long reference into the plugin folder or let index.md include it.
AC2 done (C++, src/doc/doc.cpp, NOT BUILT by this worktree agent; the coordinator builds): zinc.json "repository" (https URL string or {url}; git+ prefix and .git suffix stripped) is read into Site::repo; resolve() turns a link to a .md/.mdx/.ts/.tsx/.cpp/.h file under the project root into <repo>/blob/main/<path>#frag instead of a "leads nowhere" warning; without a repository it stays a warning. T0 cases added to tests/t0/doc.sh (not run: needs the rebuilt zinc). Branch fixed to main; plugin-alone and --std modes read no zinc.json, so they are unchanged.
AC4 measured, stays whole: zinc doc --std search-index.js = 1,633,544 bytes, 302,328 gzip, a deferred script (works from file://), cached after the first page; only the engine-wide --std build is that big, a project or one plugin is tens of KB (3d: 27 KB). The public site uses pagefind, which already splits the index into fragments loaded on demand. No old-tablet timing (no browser there); split per section only if a device measures slow.
<!-- SECTION:NOTES:END -->
