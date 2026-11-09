---
id: ZN-1012
title: >-
  Plugin docs: fill plugins/<name>/docs for the main plugins, links to source,
  site decision
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
labels:
  - docs
  - plugins
  - size-M
milestone: m-19
dependencies: []
ordinal: 9700
updated_date: '2026-11-07 18:30'
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
- [ ] #1 ten plugins have overview, tutorial and screenshot in plugins/<name>/docs
- [ ] #2 links to source files go to the repository when zinc.json names one
- [ ] #3 the decision on site/ vs zinc doc --std is recorded
- [ ] #4 search index split or measured
<!-- AC:END -->
