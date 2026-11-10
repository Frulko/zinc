# QuickJS-ng patch queue

`third_party/quickjs-ng` is the release named in `../PRISTINE` (its files and their SHA-256) with the patches of this directory applied, in the order of their numbers. Today: 0001-profile-hooks (the QuickJS profiler of ZN-598, compiled only with ZN_QJS_PROFILE), 0002-aot-hooks (the qjs2c spike of ZN-599, compiled only with ZN_QJS_AOT_GEN), 0003-android-old-bionic-cond (Android below API 21) and 0004-fast-calls (typed fast native calls and borrowed buffer and array accessors, ZN-596: the `__host_*` rows of numbers use them; prepared for upstream) and 0005-deterministic-math (Math.sin, cos, tan, exp, log, atan2 and pow through zinc's V8 fdlibm port, the bits of the other engines and of Node on every CPU, ZN-703).

`tools/quickjs-patches check` proves it offline (`tests/t0/quickjs_patches.sh`): every patch must reverse, last to first, onto a copy of the tree, and each file must then have the release's hash. A change made in the tree without a patch fails the check.

0006-allocator-size exposes the existing allocator byte counter in constant time for frame-boundary cycle collection; it does not change the collector.

## Adding a patch

1. Change the files in `third_party/quickjs-ng`, then write the change as a unified diff against the previous state: `NNNN-short-name.patch`, the next number, paths `a/<file>` and `b/<file>` relative to `third_party/quickjs-ng` (applied with `patch -p1`).
2. Start the file with a header, before the first `---` line (patch ignores it):

   ```
   Purpose: what the patch changes and why Zinc needs it.
   Measured: the gain or the fix, with the command and the numbers (or "behaviour", with the test that shows it).
   Upstream: the pull request URL, or "not upstreamable: <reason>".
   ```

3. Run `tools/quickjs-patches check`, the QuickJS tests (`tests/run --only quickjs`, `--only test262_regexp`) and, for an engine change, the test262 subset (`tests/run --tier t2 --only compat`).
4. Commit the patch with the changed files.

## Moving to a new quickjs-ng release

`tools/quickjs-patches rebase <tag>` fetches the release archive, prints its SHA-256, copies the vendored files from it and applies the queue, reporting each patch (`applies` or `CONFLICT`); nothing is written. With `--apply` it replaces the vendored files and `PRISTINE`. Then build, run the QuickJS tests and the test262 subset, and update the version and checksum in `../../README.md` and `../../components.json`. A patch that upstream has merged is deleted from the queue first.

Checked on 2026-10-10 with `tools/quickjs-patches rebase master` (v0.17.0 is the newest release): 7 of the 19 vendored files differ on master, and a demonstration patch to `cutils.h` applied.

0007-iteration-clone-semantics adds an IteratorStep-only opcode for destructuring elisions, preserving next/done failures without reading the skipped value. The private bytecode version is 29, so local version 28 caches fall back to source. `JS_WRITE_OBJ_STRUCTURED_CLONE` rejects Symbol values and gives unsupported objects DataCloneError only for the embedding clone call; ordinary bytecode and generic serialization keep their existing behavior. Getter exceptions are preserved. Exact regressions: `tests/data/symbols/main.ts`, `clone.ts`, and `native.js`. No upstream submission has been made.
