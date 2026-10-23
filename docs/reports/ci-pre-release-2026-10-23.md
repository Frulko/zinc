# Pre-release CI failures, 2026-10-23

Owner request: fix all failures of [run 39939275942](https://github.com/Frulko/zinc/actions/runs/39939275942), commit `b7b1a3e4`, before releasing. Its report contains 511 passes, nine failures and 30 skips. The two macOS packaging jobs also failed on the same obsolete `zinc new` output assertion, fixed separately in `276fdb10` (ZN-780).

## Findings and changes (ZN-781)

| Test | Finding and correction |
| --- | --- |
| `i18n` | A test of `LANG` inherited higher-priority locale variables. Clear those variables in the test; explicitly verify that `LC_ALL` and `LC_MESSAGES` still win over `LANG`. Production precedence is unchanged. |
| `atelier_tour` | The first French frame inherited the same locale overrides. Isolate them when starting the test session. |
| `tour` | A real save race: the first file stamp was taken after checking the file, so a save during the check could become the unnoticed baseline. Record the stamp first. The interactive save/error/fix scenario passes. |
| `guide_store` | The command verifier parsed the obsolete English help footer. Read the complete command table with `help --all`. This exposed missing `mem` help: register its existing handler and document `--check-leaks`, with summaries in all five languages. All worked-example commands still run. |
| `lexer` | The execution fixture gained explicit button styles after the neutral UI change. Keep its runtime styles and the frozen token golden; lexical comparison uses the exact source snapshot from `prototype-final:tests/conformance/ui.tsx`. |
| `native_gen` | Four intended device methods extended the API. Assert their exact declarations separately, then compare the rest against the unchanged historical header. |
| `plugin_manifest` | The network plugin adds one row. Assert that exact row separately and compare all remaining rows against the unchanged historical table. |
| `examples_all` | Fatty and Kanban were absent from the inventory. The runner also ignored project settings by running the entry file directly. Run the selected project entry as its directory, preserving its engine; explicitly requested secondary files remain selected. Both demos are registered as OK. |
| `notify_relay` | The archived run captured two notifications and then no further database changes; link, Focus and direct-notification paths continued working. The full scenario passes locally, including with the exact CI binary. The original stall is **not declared resolved**. Isolate the Messages database path and stop at the first failure with database counts and relay/tablet logs, instead of spending minutes on cascading failures. |

No frozen corpus, golden output or existing conformance source was rewritten. Additive API/table assertions fail if a declared addition is missing, duplicated or changed; the historical comparisons still detect other changes.

## Verification

- `tools/build zinc`: native incremental build passed.
- `i18n` and `atelier_tour` passed with inherited `LC_ALL=C LANGUAGE=en`, reproducing the locale conflict.
- `tour`, `guide_store`, `cli_core`, `lexer`, `native_gen`, `plugin_manifest`, `examples_status`, `ci_plan` passed through `tests/run --only`.
- The complete `examples_all` inventory passed after selecting projects with their declared engines.
- `notify_relay` passed headless against temporary notification/Focus databases and a simulated tablet. The original script also passed using the run's exact `build-macos-arm64` artifact, extracted under `/tmp`, with `ZINC_ROOT` pointing at this checkout. No real tablet or owner's relay process was touched.
- A forced failure of the actual notification harness verified exit status 1, database-count and log diagnostics, and no continuation into later assertions.
- Shell/Python/JSON checks passed; the lexical snapshot matches the tag byte for byte. No cross builds or full T2 repeat.

## Hosted confirmation

The owner pushed `e1161467` and dispatched [run 39952451514](https://github.com/Frulko/zinc/actions/runs/39952451514). It completed successfully: **520 passed, zero failed, 30 skipped**; `notify_relay` passed in 33 seconds. All six test shards, packaging, reproducibility, fuzz and benchmark jobs succeeded. Release, Pages and plugin publication jobs were skipped.

ZN-781 is complete on this evidence. The original notification stall is still unexplained; keep the first-failure diagnostics if it recurs. Later Pi display/deployment work is not part of this successful run and requires its own checks.


## Release-tag recurrence (ZN-786)

The subsequent [v0.6.3 tag run 39958820169](https://github.com/Frulko/zinc/actions/runs/39958820169), at the same e1161467 commit, failed `notify_relay` and `compat`. The release gate correctly stopped publication. Build, package/cross, reproducibility, benchmark and fuzz jobs succeeded. Evidence downloaded to `/tmp/zinc-ci-39958820169-report` was reviewed independently.

The initial compat failure had no diagnostic because its wrapper discarded everything except regression-summary lines. Its immediate traced rerun passed 2,749 cases on both engines with zero regressions. A first-use source-fetch failure is plausible, but its original error is lost. The wrapper now preserves complete output and the original exit code on failure; a stub-command native test covers startup failure, actual regression and successful-summary output.

The relay's initial and traced runs both stopped waiting for `mute sent`. Pairing and hello succeeded; the database held ten distinct UUIDs. Four or five notifications were delivered, then no second `news` batch was logged. This does not establish that WhatsApp image rendering was reached. A proposed TLS ticket-spin explanation was rejected as unproven: the link server has no ticket callback, and mbedTLS therefore skips ticket generation. No TLS or relay behavior was changed on that hypothesis.

A fresh native `notify_relay` run passed. Failure diagnostics now take bounded native stack samples of the fixture relay and receiver before terminating them. A native stub test confirms only valid fixture PIDs are sampled and failure status stays nonzero. No real notification or owner's relay process was sampled or stopped.

The exact ARM64 macOS artifact from the failing tag run also passes the complete relay scenario locally (`ZINC_ROOT` points at this checkout). A new `notify_capture` native regression isolates real SQLite/WAL and binary-plist polling across batches: history skipped, equal-date additions delivered once, identity image retained and a clock correction accepted. It passes without tray, discovery, transport or the real notification database. This narrows the investigation but does not establish the hosted stall's cause.

Failure sampling now retains refusal/error output as well as successful stacks; the diagnostic regression covers both. The mapping check (`ci_plan`) passes. Earlier Pi/bootstrap/updater, deployment and Music Tree checks were not repeated because their code did not change.

The owner requests targeted local checks before any further CI. No push, dispatch or publication has been performed. ZN-786 remains In Progress; the relay acceptance criterion is not checked. A later hosted failure with the new diagnostics may establish the blocking call. Release dry-run validates signing prerequisites and proposes v0.7.0 with the pending changelog; image construction and physical first boot remain separate required checks.
