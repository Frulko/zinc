---
id: ZN-1013
title: 'Translations: restamp guides and fill the doc theme strings'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:34'
labels:
  - docs
  - i18n
  - size-S
milestone: m-19
dependencies: []
ordinal: 12400
updated_date: '2026-11-07 18:30'
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
- [ ] #1 docs site shows the interface in fr, es, it, de and one more language
- [ ] #2 the translated READMEs carry `example:` names and their code matches the English source commit
- [ ] #3 a check script reports stale translations
<!-- AC:END -->
