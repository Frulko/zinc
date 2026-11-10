---
id: ZN-1066
title: 'Hermes and V8 projects: export, pack, bytecode'
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-07 16:43'
updated_date: '2026-11-10 10:33'
labels:
  - engine
  - size-M
milestone: m-20
dependencies: []
ordinal: 16700
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Alternative JS engine projects cannot yet be exported or packed like the default.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- ZN-773.04: `zinc export --dmg`, `--key` signatures and the SBOM for jsc/v8 projects (the engine-app export returns before those steps).
- ZN-773.04: `zinc pack` and `zinc fuse` of jsc/v8 projects: a .zapp carries typed .zbc only today.
- ZN-773.07: Hermes's CDP inspector (API/hermes/cdp) behind src/dbg/ws.cpp, as V8's, for --engine hermes --inspect.
- ZN-773.07: precompile .hbc at zinc build --engine hermes through hermes_run_bytecode; optimising at run time costs 1.2 s on hero's bundle.
- ZN-773.07: the Hermes adapter keeps one handle scope open for the whole run (its Node-API roots values only inside a scope): check long programs do not grow.
- ZN-773.08: measure hero CPU on Hermes built with and without its debugger on a quiet machine; if the debugger costs, ship two libhermesvm builds and load the debugger one only for --inspect.
- ZN-773.08: Hermes's DevTools agent does not report which breakpoint was hit and lists possible breakpoints as empty: check Chrome DevTools' breakpoint UI on Hermes.
- ZN-773.08: zinc export of a Hermes or V8 project should prefer the downloaded pack over the module beside a source-built zinc, whose library points at the local SDK.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 zinc export (--dmg, --key, SBOM) and zinc pack/fuse accept jsc, v8 and hermes projects
- [x] #2 zinc build --engine hermes precompiles .hbc
- [ ] #3 Export prefers the downloaded pack to the source-built module; Hermes handle scope growth checked on a long program
- [ ] #4 Hermes DevTools reports hit breakpoints
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-10 worker checkpoint (work/1066, rebased onto 903f17ed4).

Implemented: JavaScriptCore/V8/Hermes macOS exports join the existing common DMG, Ed25519 and SBOM finalization. --key without --dmg writes/signs <output-parent>/<name>-<version>.zip; --key --dmg signs the DMG without a redundant ZIP. The ZIP/DMG contains the sealed .app; SBOM and combined licence report remain beside the .app, outside the signed archive. External engine pack licences remain inside the .app as well. Export carries a relocated zinc.json, assets and enforced declared permissions, and avoids relaunching its own exported app as a development bundle. V8/Hermes exports require an installed/downloaded relocatable signed-index pack, ignoring SDK overrides; missing/offline packs fail clearly. Existing native and signed-update export branches remain on their original paths.

zinc build --engine hermes now selects the existing bytecode compiler for a literal file or a project override. Missing, invalid, repeated --engine and unsupported --target combinations fail before output replacement/download. The effective engine reaches the bundle metadata and bootstrap. Missing Hermes compiler entry points no longer claim a nonexistent HBC output. Unsigned .zapp/fused source execution explicitly disables the adjacent-HBC loader; locally built trusted HBC and exported sealed-app HBC remain enabled. No engine ABI, .zapp format or native engine loader was added. Existing pack/fuse source support was verified rather than rewritten; fused alternative-engine programs still require a local engine pack.

Research/caller audit: inspected main dispatch/build/export/unpack/fuse, shared SBOM/signing, tc/engines resolution and signed TUF installation, Hermes adapter/driver, tools/engine-pack and pinned Hermes CDP source. Primary references: https://v8.dev/blog/code-caching (cache compilation results alongside source); https://github.com/meta/hermes/blob/main/README.md and https://reactnative.dev/docs/hermes (precompiled bytecode and matching engine version); https://developer.apple.com/documentation/javascriptcore. Existing Hermes precompile/CDP bridges were already present; no dependency or SDK rebuild was needed. The pinned upstream CDP DebuggerDomainAgent still omits hitBreakpoints; changing/rebuilding that SDK was kept out of this packaging checkpoint.

Proof: tools/build zinc completed on 903f17ed4 plus this change. Final binary SHA256 9287524a2e89357bcf6ee6ba5e639eff251cc75644787b582f8f5af9982b0d87; Hermes module SHA256 12f3265d6d962bf7e1438c6e1556b3102243ca194f2a11c3f0410eb5eec8becd. Final exact T0 engine_export PASS: signed JSC ZIP, codesign --verify --deep --strict after finalization, SBOM/licences, deleted source project, relocated custom assets, permission refusal, literal Hermes HBC build/run, engine override, malformed/repeated/target errors, offline SDK fallback refusal, and an archive with unrelated valid HBC that executes SAFE_SOURCE instead of UNTRUSTED_HBC. Final all3 zinc check/source/.zapp runs PASS. Private locally signed file:// index, isolated ZINC_HOME and existing tools/engine-pack supplied V8/Hermes packs; no global toolchain/cache mutation or publication. Final all3 actual exports/relocated runs PASS; JSC DMG and V8/Hermes ZIP signatures verify, all bundles remain sealed. Fresh runtime homes, nonexistent source root/index and cleared development overrides still run correctly; recursive otool -L/-l and DYLD_PRINT_LIBRARIES show no developer-SDK paths. Earlier source f0f430762312a709e09b4e609b505844eee39cc72805055d6adf413ba40e797b also passed actual all3 fuse creation/execution. Logs: .logs/build-1066-rebased.log, .logs/final-1066.log and .logs/feature-1066/final-*.log in this worker tree. Builds reported pre-existing third-party nanosvg sign-compare warning (the first fresh build also reported existing V8 SDK unused-parameter and agent/dev initializer warnings); no new changed-code warnings. No process remains.

AC1 and AC2 checked. AC3 remains open: portable pack preference is proven, long-program Hermes handle-scope growth is not. AC4 remains open: upstream CDP breakpoint hit reporting needs its native fix and a debugger proof. Status Backlog because implementation work remains, not Done/Review by assumption. Next: add actual breakpoint ID reporting in the pinned Hermes bridge/SDK, then owner-selected debugger and quiet long-program proofs. No SDK rebuild, browser debugger, long run, suite, benchmark or CI was started.

Proposed decisions (coordinator, no number allocated): keep portable exports on verified relocatable packs and fail offline rather than carrying developer SDK dependencies; sign an external bundle ZIP/DMG to preserve the .app code seal and existing zinc verify interface; retain verified source for unsigned packages with no new opaque engine-bytecode loader.

Proposed later lines: ZN-1066: a truly standalone fused alternative-engine app needs a trusted engine descriptor anchored to the signed toolchain index, not archive-controlled native entries; current fuse intentionally requires an installed engine. ZN-1066: run the existing signed-update export proof with alternative engines before claiming portable self-updating V8/Hermes exports.

Proposed tests: tests/run --only engine_export (exact regression, about 5 s, under 200 MiB); tests/run --only engine_pack (signed-index install/update/ABI/tamper and package portability, about 30 s, under 300 MiB); strict Hermes hitBreakpoints DevTools proof after its native SDK fix (about 30 s, under 300 MiB); owner-selected bounded long Hermes frame/host-call program plus quiet debugger-on/off CPU comparison (10 min, stop at a few GiB if growing). These longer checks were not run. Usage: n/a.
<!-- SECTION:NOTES:END -->
