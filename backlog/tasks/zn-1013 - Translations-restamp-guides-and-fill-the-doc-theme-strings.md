---
id: ZN-1013
title: 'Translations: restamp guides and fill the doc theme strings'
status: Done
assignee: []
created_date: '2026-11-07 16:34'
updated_date: '2026-11-09 09:18'
labels:
  - docs
  - i18n
  - size-S
milestone: m-19
dependencies: []
ordinal: 12400
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mechanical, for non-English users: translate the doc theme interface strings (Search, On this page, Copy, Previous/Next) into the five languages, restamp the translated learn READMEs and the "A first mistake" sections with the current output, translate the comment lines inside the explain fixes and the zinc learn section of docs/learn/README.md.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-856: translate the doc theme's interface strings (Search, On this page, Copy, Previous/Next) into the five languages.
- ZN-774.33: restamp the translated learn READMEs (fr, es, it, de) with `example:` names (their code must match the English source commit).
- ZN-774.34: restamp the "A first mistake" section of the translated guides (fr, es, it, de) with the new error output.
- ZN-774.28: translate the comment lines inside the explain fixes (English code comments today).
- ZN-774.26: translate the "zinc learn" section of docs/learn/README.md in docs/i18n/*.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs site shows the interface in fr, es, it, de and one more language
- [x] #2 the translated READMEs carry `example:` names and their code matches the English source commit
- [x] #3 a check script reports stale translations
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restamped the 16 stale pages (guide, learn README with example: names and zinc learn section, syntax, styles) in fr, es, it, de; tools/i18n-docs-check (already there) reports none stale. Added Portuguese (site/src/i18n/pt.json, 'search' key in all six, the search box placeholder). Not done: the explain-fix comment lines (ZN-774.28), pt doc pages, 'On this page' and Previous/Next (the theme has none), pt queries in site/search-check.mjs. The first-mistake sections already matched the English at HEAD (not in the diff since their source).
<!-- SECTION:NOTES:END -->
