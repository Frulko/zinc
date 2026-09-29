# Paused VM / engines work — 2026-09-29

User explicitly requested: “stop et stock l'état pour reprendre plus tard”.
All three agents stopped. Root full-suite process tree terminated; no engine build/test remains active.
Do not resume implementation until the user asks. No push performed.

## Durable backup

/Users/mowmow/.codex/zinc-checkpoints/20260929-164833

Contains the complete tracked working-tree diff (including unrelated user changes), index diff, status,
recent commits, delivered agent patches, focused test logs, partial full-suite log, constructor fixture,
and ABI4 pre-edit snapshots. Working tree remains in place; no stash/reset was performed.
Index was empty at pause. Preserve unrelated UI/gfx/display/examples/tooling changes; never `git add .`.
Only root handles index and commits. Agent changes are integrated as isolated patches, validated against
an exact index checkout before commit.

## Latest completed milestone

- HEAD at pause: `1724050` (correct SDL environment in interaction report).
- `1242e24`: updated progress and committed forms interaction evidence.
- `d232828`: optional string/scalar presence, captured local functions, string bracket indexing.
  Four fixtures × native/interpreter/AArch64 JIT/QuickJS = 16 successful comparisons; isolated typecheck passed.
- `575bcb9`: precompiled app-specific VM core via `--core` for build/run/capture/dev.
  Real graphics core test passes interpreter/JIT and restart on save, hashes/mtime unchanged,
  with a failing fake CMake first in PATH. Isolated typecheck passed.
- `cfb491d`: source stack traces via validated `app.zbc.debug` sidecars, both interpreter/JIT.
  File/line/column stacks for exceptions, rejected promises and native callbacks. No interactive debugger yet.
- Many preceding language/runtime fixes committed; see git log and docs/engine-progress.md.

Forms runs on all four modes. Root independently checked frames 1 and 6 around scripted dragging,
zoom, selection and text entry on isolated committed code at `8a685d5`; all images match native and
frame 6 differs from frame 1. Report: docs/reports/engine-forms-interaction-2026-09-29.json.
Reload currently restarts process/window and loses state. Core is application-specific with baked resources,
fixed native export set and strict compiler/runtime fingerprint, not a universal portable core.

## IMPORTANT: uncommitted work at pause

### ABI4 — incomplete, not buildable as a completed feature

Agent buffers_abi changed only compiler/src/abi.ts and runtime/include/zinc_abi.h:
version 4, ARRAY tag 12, result_element_type, partial scalar/record-array result generation.
Runtime adapters runtime/vm/abi.h, main.cpp, quickjs.cpp and bytecode emission still require adaptation.
No ABI4 build/test has run. Do not commit this partial implementation.
Pre-edit files are backed up as abi4-* in the durable backup above. Complete this batch or safely remove
only these exact agent edits before trying the full working tree. Do not revert other people's changes.
Proposed scope: readonly copied arrays of scalars/scalar records for fs.list/readDir/sys.args/envKeys;
reuse record descriptors, explicit rejection of nested arrays/mutable parameters for this initial batch.
Later required work remains mutable buffers, ownership, nested composites, async/cancellation.

### Constructor defaults — delivered, not integrated

/tmp/zinc-constructor-defaults.patch (also in durable backup): HIR + C++ +
tests/engines/constructor-defaults.ts. Reuses call defaults for constructors, omitted/undefined arguments,
and deferred native defaults for calls returning reference types.
Agent reports native/QuickJS/interpreter/JIT fixture parity, typecheck and cached apply-check passed.
Root has NOT independently validated or committed it.
Keyboard interpreter captures now pass frames 1 and 60:
/tmp/zinc-ui-keyboard-vm/keyboard-1.png and keyboard-60.png.
Native/QuickJS/JIT captures and pixel comparison are still pending.

### Interactive debugger — no implementation edits

Agent tooling_matrix inspected existing plugins/devtools. It has DOM/CSS/console CDP, no Debugger/step/locals;
VM currently rejects its injected native adapter. Agreed first implementation: dedicated fd3/fd4 channel,
Tier0 explicit, pause on entry, file:line breakpoints, step/next/continue, stack and named register locals.
Extend sidecar with local/register names, runtime before-instruction hook, vm-debug.ts helper, `zinc debug`
using existing build()/--core. No code or tests for this new batch were written before pause.
Source-stack batch cfb491d is complete and separate.

## Test state / exact checkouts

Full suite launched at isolated `1242e24`, interrupted at user request. NOT a full pass.
Partial log /tmp/zinc-full-ui-core-suite.log, also backed up. Read log for exact completed fixtures.
Last complete suite before recent changes passed at `0afe934`; later work has focused validation.
Twelve existing conformance fixtures passed native + sim (24 checks) at isolated `aa70e4e`.

Exact-index checkouts (node_modules symlink to repository):
- /var/folders/26/2bd881l11jj2jgq_yhl4233c0000gn/T/zinc-index-check-kmdvlpt8
  Latest snapshot 1242e24; stopped full-suite builds remain reusable.
- /var/folders/26/2bd881l11jj2jgq_yhl4233c0000gn/T/zinc-next-check-bbf6gexy
  Earlier forms proof snapshot around 8a685d5.
Use `git checkout-index -f --all --prefix=<dir>/` only while no tests use that directory.
Helper /tmp/zinc-check-fixtures.mjs compares four engines for named fixture stems from current cwd.
The user's uncommitted cli.ts includes headless output suffix absent committed CLI. Always derive executable
paths via --print-exe --json in tests. Working-tree tools.ts has an unrelated Project.display type error;
isolated committed typecheck passes. Never fix or commit unrelated changes incidentally.

## Next order after explicit resume

1. Reconcile unfinished ABI4 edits before compiling current working tree; keep agent ownership separated.
2. Independently validate/integrate constructor-defaults patch, add fixture to common harness.
3. Capture keyboard on all four modes and compare pixels/interactions.
4. Finish minimal usable interactive VM debugger and validate --core workflow.
5. Complete readonly composite ABI4 batch with native/VM/QuickJS parity and GC checks.
6. Run full common suite on final isolated index; refresh full demo build/run/capture matrix.
7. Continue remaining original seven stages below; do not call the whole project complete.

Original scope: (1) language/memory parity; (2) complete shared ABI/ownership; (3) services/shared UI/input host;
(4) ScriptEngine embedding; (5) tooling/debug/HMR/export/profiling; (6) full demo/performance acceptance;
(7) JIT optimization/additional platforms. Baseline AArch64 JIT exists; optimizing tier and other targets do not.
PocketJS research is already recorded in docs/engines.md. Last full demo build audit had 5/58 VM demos before
many later fixes, so it is a dated baseline, not current pass rate.

## Commands available on completed commits

```sh
node compiler/bin/zinc.mjs run examples/ui/forms --engine zinc-vm
node compiler/bin/zinc.mjs run examples/ui/forms --engine zinc-vm --jit
node compiler/bin/zinc.mjs build examples/ui/forms/main.tsx --engine zinc-vm
node compiler/bin/zinc.mjs dev examples/ui/forms/main.tsx --engine zinc-vm --core examples/ui/forms/build/zinc-vm-macos
node tests/engines/core-cli.mjs
```

These refer to the completed code; the partial ABI4 edits in the working tree must first be reconciled.
See docs/precompiled-core.md for compatibility limits and process-restart semantics.
