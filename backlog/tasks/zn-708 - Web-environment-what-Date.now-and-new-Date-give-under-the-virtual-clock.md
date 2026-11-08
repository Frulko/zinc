---
id: ZN-708
title: 'Web environment: what Date.now and new Date() give under the virtual clock'
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-10 22:51'
updated_date: '2026-11-08 23:01'
labels:
  - js
  - qjs
  - size-S
milestone: m-22
dependencies: []
ordinal: 7100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**What is left (review 2026-11-07):** Write the decision record and a test: windowed run gives today's date, deterministic run the same date every run.

(Left by the web environment, ZN-568, see its decision record and docs/reports/zinc-next-webenv.md.) `Date.now` is the virtual clock from 0 in a deterministic run, so `new Date()` is 1970 in a web program; libraries seed, log and expire caches with it. Decide (the real date outside deterministic runs, a fixed epoch inside) and record it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 a decision record
- [x] #2 a windowed run gives today's date and a deterministic run the same date at every run (test)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review 2026-11-07: done-partly. Date.now is already the wall clock outside test runs and fractional virtual in deterministic runs; left: the decision record and one test. Evidence: git: 60193313e, fbb3e2fb7, d28d804df

Done 2026-11-09 (worktree agent).

Found: on QuickJS (and JSC/V8/Hermes, same prelude) Date.now followed the virtual clock but new Date() and Date() used the engine's own clock, so a deterministic run printed today's date (tests/t0/clock_real.sh even expected that). Fixed in src/qjs/prelude.cpp: Date is wrapped so no-argument construction and the call form read Date.now (same prototype, so instanceof, subclasses and Date.UTC/parse/now are unchanged), as the typed engine's constructor (ms = Date.now()).

Decision (record text for the coordinator, zinc-next-decisions.md): **Date.now and new Date() read one clock on every engine: the machine's wall clock in any run (windowed or headless), and in a deterministic run (ZINC_DETERMINISTIC, record, replay) a fixed epoch, Unix 0 (1970-01-01T00:00:00Z, UTC unless TZ is set), moved by the virtual clock.** Why: goldens and replays must not depend on the day they run; 0 is the default of @sinonjs/fake-timers and what zrt det_init and the goldens already use, so no golden changes (Jest fakes default to the real now, which is not reproducible). Revisit: a library that refuses dates before a minimum (then a fixed later epoch, one change in wallBaseMs and zrt det_init plus the goldens).

Proof: tests/t0/clock_real.sh extended (new Date() is today's UTC date in a real run on zinc and quickjs, 1970-01-01 in two deterministic runs on both, constructor === Date) PASS; a windowed run (ZINC_BACKGROUND=1, ZINC_FRAMES=3) of a zinc:gfx program printed today's date on zinc and quickjs.

Search notes: sinon fake-timers default now 0 (https://github.com/sinonjs/fake-timers), Jest defaults to the real Date.now (https://jestjs.io/docs/jest-object), Playwright clock fixes Date.now and new Date() together (https://playwright.dev/docs/clock).

Proposed tests: none beyond clock_real (T0, ~3 s).
<!-- SECTION:NOTES:END -->
