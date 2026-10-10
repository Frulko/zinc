# QuickJS-ng patch queue

`third_party/quickjs-ng` is the release named in `../PRISTINE` (its files and their SHA-256) with the patches of this directory applied, in the order of their numbers. The queue is empty today: the vendored files are the v0.17.0 release unchanged (ZN-595).

`tools/quickjs-patches check` proves it offline (`tests/t0/quickjs_patches.sh`): every patch must reverse, last to first, onto a copy of the tree, and each file must then have the release's hash. A change made in the tree without a patch fails the check.

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
