---
id: ZN-815
title: >-
  QuickJS and npm packages: Web globals, browser field, CommonJS, local Date,
  catch annotations
status: Backlog
assignee: []
created_date: '2026-10-24 23:56'
labels:
  - size-M
milestone: m-14
dependencies: []
ordinal: 13200
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-?: QuickJS bundle: packages that read Web globals (crypto, TextEncoder, fetch, URL) get undefined because zinc:web imports are added per project file only; install them as globals when linking packages (uuid fails)
- ZN-?: QuickJS bundle: try the `browser` field and `--conditions=browser` after module/main (nanoid picks its Node build; papaparse and qs stop on Node built-ins)
- ZN-?: `zinc run x.ts --engine quickjs` cannot load CommonJS/UMD packages (dayjs); auto-bundle packages or tell the user to run zinc bundle
- ZN-?: Date on QuickJS: src/qjs/prelude.cpp makes local getters UTC while the constructor and getTimezoneOffset keep the machine zone, so date-fns/dayjs/moment are off by the offset outside UTC
- ZN-?: the TS stripper rejects a type annotation on a catch variable (`catch (e: any)`)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Packages reading crypto/TextEncoder/fetch/URL get the globals when linked
- [ ] #2 `browser` condition tried after module/main; CommonJS/UMD (dayjs) loads or the error says to run zinc bundle
- [ ] #3 Date local getters agree with the constructor zone (date-fns/dayjs/moment test)
- [ ] #4 `catch (e: any)` parses
<!-- AC:END -->
