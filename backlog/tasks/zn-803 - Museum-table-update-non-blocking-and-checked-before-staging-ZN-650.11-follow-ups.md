---
id: ZN-803
title: >-
  Museum table update: non-blocking and checked before staging (ZN-650.11
  follow-ups)
status: Done
assignee:
  - '@parallel'
created_date: '2026-10-24 23:55'
updated_date: '2026-11-10 06:27'
labels:
  - size-M
milestone: m-27
dependencies: []
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
From backlog/later.md, promoted by the review of 2026-10-25 (docs/reports/backlog-review-2026-10-25.md). The lines it carries:

- ZN-650.11: a fused or exported table has no `zinc update-app` command, so it never updates; check and download should be a background operation of `zinc:system/update` (today they block the frame on curl with no timeout).
- ZN-650.11: a published project that does not parse is accepted (signature and hash only), then shows an empty table; check the project before staging.
- ZN-650.11: `zinc:process` promises are not awaited in deterministic runs, so `museum_update` races frames against the download (fails under heavy load).
- ZN-650.11: the update period (one hour) is a constant in `src/update.ts`; the storyboard editor has no "publish" step.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Check and download run off the frame (no blocking curl without timeout) in zinc:system/update
- [x] #2 A published project that does not parse is refused before staging
- [x] #3 zinc:process promises are awaited in deterministic runs so museum_update no longer races
- [x] #4 zinc update-app works on a fused or exported table
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10, work/803 (clean worker based on 58ee758c8; includes the integrated process-family and QuickJS scheduling work). All four criteria are proved on the development Mac; no publication, service installation or external message.

Research and reuse
- Electron separates checking, downloading and update-downloaded/activation, and warns about duplicate checks: https://www.electronjs.org/docs/latest/api/auto-updater . Keep a single explicit Idle/Running/Prepared job and retain idle-only Museum activation.
- curl documents separate connection/whole-operation limits: https://curl.se/docs/manpage.html and https://ec.haxx.se/usingcurl/timeouts.html . Existing curl calls now have a 5 s connection limit, 15 s manifest limit (1 MiB maximum) and 120 s package limit, with partial-file cleanup and unique partial names. No new dependency.
- Need → provider → gap: signed channel/download → tc::fetchManifest/downloadUpdate; package/cache/trial → unpackZapp/chooseAppVersion; async lifetime → the existing std::async/future pattern in main.cpp freeLater; process events → zinc:process and zinc:sys.poll; export → existing pack/fuse and BundleSpec. Only preparation, app validation, atomic commit and scheduling were missing.

Implementation
- zinc:system/update check/download are promises, with optional URL override. Network, hash checks, unpacking, app id/version/key checks and ZBC verification run on one worker. A monotonic operation token refuses stale calls; a mutex protects worker-thread callers. Prepared candidates live under their SHA-256, so a refused package with the same basename cannot overwrite a previously staged package. Staging takes a nonblocking flock and atomically renames the marker.
- download(url, validate) runs the caller's synchronous validator before staging; a throw discards the prepared operation and permits retry. Museum calls its unchanged parseProject on the prepared assets/project.json. Its updater now has one enum/transition function and uses the system service, then restarts only while quiet. Generic direct update-app validates package/program/identity trust; it does not know arbitrary app content schemas. AC2 is Museum's actual automatic path, not a claim that generic CLI parses Museum content.
- Deterministic zinc:process.run settles short-command events through the existing sys.poll before frames advance. Real runs remain asynchronous. All existing API consumers, generated ops, unsupported-target stub and docs are migrated together; existing app_update_api and museum_update milestone callers are maintained but not run.
- Fused executables expose update-app using their embedded project. Hosted source runs declaring update.publicKey remain in the hosted engine when a native cache exists, preserving the service. Raw zinc build AOT executables still report the unsupported updater with export/fuse guidance.
- Host desktop update-enabled exports reuse pack/fuse, retain assets, native plugins, signing, permissions and SBOM/licences. macOS .app uses a signable engine executable with a sealed Contents/Resources/app.zapp; appending an archive to Mach-O fails strict codesign, as the initial feature proof found. Shared BundleSpec construction preserves the same bundle metadata/keychain/entitlements. Fused apps enforce declared permissions. Ordinary exports retain the AOT path; unsupported cross targets and --no-embed with updates are diagnosed before output is replaced.
- Proposed decision (no id allocated): reuse the engine-carrying export rather than build a second raw-AOT updater/VM bridge. Weighted fit/performance/footprint/maintenance/licence/portability/effort scores: existing engine 5/3/2/5/5/3/5 = 56, new raw-AOT bridge 4/5/3/1/5/2/1 = 48. These are engineering tradeoffs, not benchmark measurements; engine-carrying exports are larger and have different startup behavior.

Proof
- Binary: /Users/mowmow/Lab/zinc/.worktrees/803/build/zinc, SHA-256 8018232424225cfeae1933073c52c90ac29f753ce5b56c938d9477490177266a. tools/build zinc, always through tools/work-run, passed. Initial clean build had the unchanged agent/dev.cpp:155 missing-field and vendored nanosvg sign-compare warnings; touched updater code is warning-free; the final CLI rebuild has only the existing vendored nanosvg warning. The final CPU/OS eligibility guard was rebuilt and all final evidence below uses this hash.
- Final batch: tools/work-run 120 python3 .logs/803-proof/final-checks.py repeats only this exact T0, source check, cold/warm source, QuickJS source/packed/fused proof, and rejection of wrong-CPU/--no-embed exports without replacing existing output; all PASS. No cross build starts.
- Exact T0: tools/work-run 60 env ZINC_ROOT=$PWD ZINC=$PWD/build/zinc tests/run --tier t0 --only app_update_async: PASS. Checks signature/identity refusal, invalid content before staging, failed-validation→valid retry, immutable staged bytes after a refused same-name candidate, discard→retry, stale prepared token, deterministic process result in frame 1, a loopback response gated on frame 2 (nonblocking without a speed threshold), and normal quit with a pending check joined before the server response is left behind.
- Real Museum proof: tools/work-run 240 python3 .logs/803-proof/feature.py: PASS. It copies the exact current src/ (diff -qr passes) and all assets, changing only fixture id/version/channel/project content; no source workaround or missing-media fixture. Malformed project version99 is refused with no staging and the original ukiyo-e sequence continues. The valid signed 1.1.0 package is downloaded, then fused and exported players restart while quiet into wave, find themselves up to date and promote current/remove trial. The real .app binary repeats that path; codesign --verify --deep --strict passes, and bundle metadata/SBOM/licence output exist.
- Hosted cold/warm source plus forced-native request and QuickJS check: tools/work-run 90 python3 .logs/803-proof/warm.py: PASS. Both source launches report interpreter/hosted service; QuickJS uses the same asynchronous service.
- QuickJS packed and fused download/restart/trial promotion: tools/work-run 90 python3 .logs/803-proof/quickjs-update.py: PASS. Unsigned-pack warnings explicitly show retained source is executed; no unchecked bytecode path was enabled, and src/qjs is untouched.
- Final tools/work-run 60 env ZINC_ROOT=$PWD ZINC_HEADLESS=1 ZINC_STEPS=0 build/zinc check examples/museum-table: PASS (21 files). tools/system-ops --check, shell syntax checks and git diff --check pass. Logs, scripts and fixture outputs: .logs/803-proof/. All commands are bounded/headless; fixture HTTP server is trap-cleaned. No app/curl/server process from these proofs remains. No suite, T1/T2/demo run, benchmark, pixel comparison, CI or cross build.

Lifecycle and limits
- Hosted main owns one VM and one gUpdProject per process. hot.cpp:231 retains the same Machine; hot_swap.cpp:137/224 preserves callbacks or refuses stale closures and requests a full child restart/_Exit. Museum's top-level instance/onFrame has no disposal hook, so an entry edit restarts the child. In-flight Promise timers retain the waiter; Prepared exists only before the synchronous validator/commit. No second project/VM is assigned while an old job survives in this main. A failed VM ends the process; the worker holds only C++ values, not VM callbacks. Normal exit joins the future (the exact pending-quit case is proved). Abrupt host termination relies on its existing process-family cleanup, not a new updater cancellation protocol.
- Normal quit can wait for the bounded network operation (15 s manifest + up to 120 s package, plus local checks). Full timeout/cancellation, long-running churn, quiet-machine size/startup and physical/UI/cross-platform behavior are not claimed. No RSS/performance number was measured.
- Raw AOT updater bridge and generic CLI application-content validation remain outside the shipped contract; one-hour scheduling and the editor's publish UI were not among the four acceptance criteria and are unchanged.
- Proposed later lines: ZN-803: consider cancellable background transfers on early quit; ZN-803: raw zinc build updater bridge if needed; ZN-803: prove host-native Linux/Pi export update/signing on the actual target, since a Mac engine is never cross-shipped; ZN-803: a declared CLI content-validator entry only if generic CLI app schemas are required.
- Usage: n/a (tools/usage).

Proposed tests
- tests/run --tier t1 --only app_update_api: maintained Promise caller, signed download/restart/healthy lifecycle, ~5–15 s, RSS not measured.
- tests/run --tier demo --only museum_update: maintained short deterministic visitor/idle ordering, bad signature/truncated package/real content update, ~15–30 s, RSS not measured; owner selects before running.
- AOT process-promise fixture and QuickJS exported .app update: ~5–15 s each, validates the remaining execution/packaging combinations; RSS not measured.
- Isolated slow-transfer early-quit/full-timeout and Fast Refresh churn: up to 135 s network plus local checks, validates cancellation/teardown bounds; no benchmark or energy claim.
<!-- SECTION:NOTES:END -->
