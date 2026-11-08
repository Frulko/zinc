---
id: ZN-1011
title: 'zinc:storage: one store per program, not one shared file'
status: Backlog
assignee: []
created_date: '2026-11-07 16:34'
labels:
  - storage
  - size-S
milestone: m-14
dependencies: []
ordinal: 1004000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On desktop every program writes to `~/.zinc/storage.kv`: localStorage and AsyncStorage of two apps share keys, and JS-engine apps leave `@async/...` keys there while rn-showcase on QuickJS reads other prefs than the interpreter. Key the store by the project name or bundle id, migrate the old keys once, and make the engines agree.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- qjs_demos: rn-showcase on QuickJS ignores the prefs (language, notes) saved by earlier runs that the interpreter reads (French and 2 notes against English and 3 on 2026-10-29): zinc:storage seems keyed per engine, and the test runs in the user's ZINC_HOME; give the test its own ZINC_HOME and make the store the same on every engine.
- zinc:storage: one file for every program on a desktop (~/.zinc/storage.kv): localStorage and AsyncStorage of two apps share it (the
- Storage: AsyncStorage keys (`@async/…`) that JS-engine apps wrote to the shared `<zinc home>/storage.kv` stay there (only `<name>.` keys migrate), so fatty and other QuickJS apps start with an empty own store; a one-time migration needs a rule for keys no app owns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 two programs with different names write the same key without seeing each other
- [ ] #2 the old shared keys migrate once to the owner program, `@async/...` included
- [ ] #3 rn-showcase on QuickJS and the interpreter read the same prefs
- [ ] #4 a T0 test with two project names
<!-- AC:END -->
