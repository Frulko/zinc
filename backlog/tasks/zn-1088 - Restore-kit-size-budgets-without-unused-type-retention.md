---
id: ZN-1088
title: Restore kit size budgets without unused type retention
status: Done
assignee: []
created_date: '2026-11-09 14:36'
updated_date: '2026-11-09 16:34'
labels:
  - perf
  - ui
  - size-M
milestone: m-32
dependencies: []
type: bug
ordinal: 1010
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks integrated Inputs ZN-1078.06 and Navigation ZN-1078.09 size AC. After natural capability splits (plain Input vs PasswordField, basic Tabs vs rich NavigationTabs) and TDZ outlining c69f4e7a8, unchanged gates still fail. Inputs: unused132104 B >118784; used75262/component >65536. Navigation: unused132104 >122880; used66083 >65536. JS passes. No further UI trims or budget increases. Both progress branches are now integrated (0a8c0b141,3dde12a02); reproduce/attribute the combined source, not an old baseline.

Inputs current emit-only evidence .worktrees/1078-inputs/.logs/inputs-size-current/{one,ten}.{tsx,zbc,cpp,res}, provenance.json. Navigation /tmp/zn-navigation-size/{one,ten}.tsx and /tmp/zn-navigation-one.cpp contains unreachable NavigationProps/Item/SidebarGroup/etc and lambda names. src/ir/opt.cpp removeUnreachable drops dead functions/vtables but intentionally retains all class layouts; removeUnusedData prunes natives/string constants. D268 deferred metadata compaction until needed; investigate reachability/type retention with actual section/code counts before editing. Unused exported classes in artifacts are a lead, not proof they dominate every used-component cost. Choose the smallest measured engine fix.

Preserve live layouts, inheritance/interfaces/instanceof/reflection, generic signatures, native/runtime-created records/Dyn classes, worker registration, callbacks, exceptions, interpreter/AOT/QuickJS and verifier consistency. Hot/debug ABI IDs stay conservative. Do not blindly mark all entries of the untrimmed type table live, nor erase metadata observed by native/typed code. No library/UI source workaround. Proven primary guidance: https://llvm.org/docs/TypeMetadata.html and https://llvm.org/docs/Passes.html (GlobalDCE); these establish visibility/liveness constraints, not a Zinc algorithm. Build one target, exact narrow regression and unchanged gate only; no full suite or benchmarks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unchanged kit_size passes on combined integrated Inputs/Navigation source, with attributed retained-code/metadata evidence and no budget or UI behavior change
- [x] #2 A narrow regression protects retained live layouts/type tests/native or Dyn creation and removed unreachable metadata across interpreter AOT QuickJS; hot/debug ABI remains conservative
- [x] #3 Original kit gallery checks and bounded smoke pass, exact sizes/provenance/limits and proposed milestone tests recorded
<!-- AC:END -->

## Checkpoint — 2026-11-09, owner requested Astra handoff

Status is **Backlog**, not Done. The owner requested stopping after the active measurement and handing this work to a fresh Astra Fast agent. No1090 work started. Source, tests and task are committed together as a checkpoint; no additional build or gate was started after that instruction.

### Changes retained

- `removeUnusedLayouts` follows surviving instruction/signature/global types, parents, interfaces, live field types (including collections), and live class selectors. It does **not** seed every interned type. Error and the runtime-created Dyn variants stay roots. Unreachable class rows become empty abstract placeholders: class IDs stay stable, including the IDs embedded in typed-worker layout strings. No class/field offset, native signature or selector renumbering. Hot/debug builds keep every class declaration.
- The inliner now charges New/ArrNew half of its40-unit callee budget (20), because allocation also carries initialization/tracking/exception cleanup; ordinary arithmetic still costs1. This prevents tiny instruction-count helpers with expensive allocations from being cloned repeatedly. No kit-specific code, new option, component source change, budget increase, dependency or C++ runtime API change.
- A tested generic `newObject` noinline experiment gave no useful used-component delta saving and was removed completely. `src/rt/rt.h` has no diff. Do not resurrect it or duplicate c69f4e7a8 TDZ outlining.

### Attribution and retained artifacts

- Baseline on integrated414861c46, absolute source paths matching the unchanged gate: direct Button5,440,408B; barrel Button5,589,008B (+148,600B against122,880B unused-family budget); ten6,315,936B (+80,769B/component against65,536B). Resources match at163,760B when inputs are absolute. A first relative-path scratch direct import baked extra fonts because its resolved library path lacked a leading slash; those direct artifacts were overwritten by the correct absolute-input baseline. This unrelated path-classification issue is not changed here.
- `.logs/1088-before/` retains direct/one/ten source, executables, ZBC, generated C++ parts/resources, build logs, one/ten symbol binaries and nm output. `provenance.json` records source hashes/root/base and final current engine hash; `attribute.py`/`attribution.json` retain the byte-section analysis. Do not remove this tree/artifact directory before handoff.
- Raw class tables: direct300classes/16,840B; barrel1,992/153,533B; ten1,996/154,545B. Packed AOT module tables50,357/187,249/203,510B. This explains unused-family retention, but the one→ten class-table delta is only1,012B. Native __text grows698,640B; generated function symbol ranges grow1,007,268→1,705,908B. Largest additional Slider thunk is46,532B native/164,947B generated C++, with66New sites and116unwind checks. Metadata alone cannot fix the used gate.
- First metadata-only/effectively unchanged inlining gate failed: `.logs/20261109-160205.log`, AOT direct5,423,896B, barrel5,473,424B (+49,528), ten6,200,352B (+80,769/component). Bundle228,288/230,096/252,079B (unused1,808, per-component2,442). This passes unused budgets but still fails used AOT. The generic allocation outlining experiment was present then and later removed as noted above.
- **Final active measurement PASSED the unchanged `tests/run --only kit_size` after allocation cost20.** Important limit: tests/run deletes raw logs on success, so only PASS/exit0 was retained in the tool transcript; exact final byte sizes and after binaries were not retained. Owner instructed no further gate/build after this measurement, so do not mistake the earlier failing log for the final result. AC1 stays open until final exact after sizes/provenance and review are retained.

### Proof completed

- `tools/build zinc` passed (latest `.logs/1088-build-3.log`); modified optimizer compiles without warnings. Builds only targeted zinc, serialized/bounded via work-run.
- Exact `tests/run --only layout_reachability` passed on final code: ZBC verifier, unreachable class-name removal, live inheritance/fields/interface callbacks/instanceof/downcast/constructor-name reflection, Dyn view writes, JSON runtime-created Dyn objects, exception handling and native-decoded typed-worker records on interpreter/AOT/QuickJS. Hot ZBC and debug native builds retain the unused declaration. AC2 checked on this proof.
- `git diff --check` passes. No tests suite, full benchmark, conformance, cross run or process left behind. Final original-gallery smoke after these C++ changes is still pending (AC3 open);1092's gallery captures/proof predate this optimizer change.

### Next commands / remaining work

1. Review retained liveness roots/stable-ID placeholders and the20-unit inlining heuristic. Add an explicit emitted-code assertion for allocation-helper sharing if warranted; current regression protects observable semantics and metadata.
2. Capture exact final numbers by invoking the **unchanged** `sh tests/t0/kit_size.sh` through tools/work-run, redirecting its raw output to a retained after log rather than the success-deleting tests/run wrapper. Retain corresponding emit-only/binary attribution as needed; do not change thresholds or UI source.
3. Run the bounded original kit gallery check/smoke with this engine and final integrated library source. Keep the corrected outer-vertical scroller selection in the gallery proof; do not skip bottom assertions. TickAC1/3 only when those facts are retained.
4. Coordinator integrates this completed task only when its remaining criteria are proven, then supplies a clean reset before1090.

### Proposed tests / later lines

- At an owner-chosen milestone: quiet-machine allocation/call-heavy performance comparisons for the revised generic inlining cost; hot_recompile/fast_refresh, class_runtime, native_reachability, worker_wire/worker_typed and the UI feature sessions. Additional call overhead of shared allocation-heavy helpers remains unmeasured; no broad performance claim is made.
- Proposed later line: ZN-1088: classify relative `lib/std/...` imports as engine files consistently with absolute imports; the missing leading slash currently changes font baking for the same physical library module.


## Astra checkpoint — 2026-11-09 (owner requested model handoff)

Task remains **Backlog**: AC1 and AC3 are not proven. No 1090 edits or work started. Stop after the already-running gate and preserve the complete checkpoint for the next worker; no subsequent experiment, build, test or gallery run.

### Current change and review

- Restored previous checkpoint on clean base `9608e0aea` (including Feedback `b088d2952`). The only merge conflict was the first `tests/affected.json` entry; both independent mappings are retained.
- Reviewed layout roots against IR types, ZBC emission, RC exception construction and vtable analysis, runtime Dyn resolution, worker wire decoding and native ABI signatures. Stable empty abstract rows preserve class IDs used by worker schemas; no seed of all interned types. Existing exact layout regression passed on this base with allocation cost20, including all three engines, verifier, hot/debug. Added emitted-code assertion: twice-called `makePair` has exactly two `New ..., Child` instructions in one shared body. The initial assertion also matched `Child[]`/`DynRefT<Child>` and was corrected; corrected test passed. Cost40 has not yet rerun this regression.
- Current allocation cost is **40**, the entire existing callee budget, rather than checkpoint20. A function that allocates plus returns stays shared. Retain this as the measured candidate, not a completed proof: runtime call/inlining performance is unmeasured.
- The newly integrated Feedback source legitimately uses native SVG. `buildNative` previously selected the full system host for **any** plugin; emitted ten-component ZBC contains zero network/crypto/pack runtime rows, yet Mbed TLS, llhttp and compressors were linked. This explains the new gate jump; no UI trim or budget change is made.
- Added generic `native.systemHost: "lite" | "full"` in plugin manifests, default **full**. Audited SVG native implementations use the raster/C standard library, not system-host network/crypto/pack rows or indirect runtime dispatch; SVG opts into lite. Unknown plugins, old stamp records and unknown stamp values stay full. The requirement is assigned before all slow-build/prebuilt/fetched exits, stored/read in plugin stamps, copied in the synthetic cross export record, and checked in both native and cross link predicates. `savePlugins`/`loadPlugins` carry display names/fallbacks/info only, not PluginLib/link decisions, so their format is unchanged. QuickJS native guard remains in the native link predicate. No new dependency or kit-specific compiler rule.
- Existing `requires` only describes target capabilities and cannot safely imply absent native host calls. Explicit conservative metadata was chosen over source/nm guesses. Docs describe the declaration as an obligation for every native implementation and linked dependency, not a permission grant.

### Retained numbers and provenance

Artifacts are in this worktree `.logs/1088-final/`; prior baseline remains read-only in `.worktrees/1089-core/.logs/1088-before/`. Current root and source/engine SHA256 values are in `provenance.json`. All gates invoked the unchanged `sh tests/t0/kit_size.sh` directly with own `build/zinc` and `ZINC_ROOT=$PWD`, under shared `tools/work-run`; stdout retained.

| Candidate on combined Feedback base | AOT direct | AOT barrel | AOT ten | Unused bytes | Used bytes/component |
| --- | ---: | ---: | ---: | ---: | ---: |
| Metadata + allocation20, old full-host rule | 5390904 | 5440432 | 7301200 | 49528 | 206752 |
| Metadata + allocation40 + explicit SVG lite host | 5390968 | 5423984 | 6074800 | 33016 | 72312 |

Final unchanged thresholds: 126976 unused bytes (31 families) and 65536 bytes/component. **Unused passes; used still fails by 6776 bytes/component (60992 total bytes beyond the nine-component allowance).** Bundle unchanged at direct228288 / barrel230375 / ten260321, unused2087 <=7936 and used3327 <=4096. Final gate exit1: `kit-size-host40.log`; first gate `kit-size.log`.

Attribution retained: cost20 ten executable, generated C++ parts, ZBC, native-symbol executable/nm, debug link log and `attribute.py`/`attribution.json`. Its raw class metadata74293B, packed module107648B, generated native code1584660B (less than prior pre-Feedback ten1705908B), __text5823756B. Largest generated functions main83268B, applyToken70780B, Slider thumb23512B, Progress callback19328B. Manual same-object relink inserting existing lite host ahead of host_gfx (all other libraries still supplied) reduced ten7301200→6173784, saving1127416B. Cost40 same-object lite relink6074808 saved another98976B; final production gate6074800 differs by8B of output provenance. These relinks were attribution experiments only; production now uses explicit metadata. `relink.py`, `relink40.py`, corresponding logs and binaries retained. No artifact is a runtime-speed measurement.

### Completed proof and remaining commands

- Own `tools/build zinc` passed for checkpoint, cost40, and manifest/host-link changes, serialized and bounded. `opt.cpp` and new host/manifest code compile without warnings. Fresh base build exposed existing warnings in V8 SDK headers, vendored nanosvg/rg_etc1, assets/assets.cpp, assets/cook.cpp and agent/dev.cpp; latest build-host.log has only the existing nanosvg signedness warning. Do not call the complete fresh build warning-free or edit unrelated owners' code.
- `layout_reachability.sh` passed on cost20 before host changes (`layout.log`, exit0); its assertions include allocator sharing, all three engines and hot/debug preservation.
- New exact `plugin_system_host.sh` passed on cost40 + production host change (`plugin-host.log`, exit0): lite fixture returns42; cached build retains lite; omitted declaration retains full; reached fetch retains full; invalid enum rejected. Afterwards added one assertion simulating an old stamp with no field, restricted to this test's own temporary plugin. **That added legacy-stamp assertion is written but not run** due owner handoff. No live network request occurs: network case is compiled only.
- `git diff --check` passed. `native_reachability` and `res_library` were read but not run; original kit/gallery check/smoke still pending. No broad suite, benchmark, T1/T2/demo/pixel/cross run. No started process remains.
- Next worker: read this exact failed gate and attribution before any change. Keep UI source, thresholds and safe host-cap default unchanged. About61KB of further relative ten-vs-one native savings is needed. No next optimization has been written. Then rerun changed exact tests, final retained direct gate and bounded unchanged gallery check/smoke; only then mark all criteria Done. AC2 is reopened: its cost20 proof passed, but the final candidate needs revalidation.

### Proposed tests / limitations

- At owner-chosen milestone: allocation/call-heavy runtime performance on interpreter/AOT; no speed claim for cost40. Existing class_runtime, worker_wire/worker_typed, hot_recompile/fast_refresh and UI sessions remain proposed.
- Cross linkage has the same conservative requirement predicate but has not been built or run here. Plugin cache fallback, fixture network compatibility and final gallery still need the commands above; no platform validation is implied.

## Resume checkpoint — 2026-11-09 (shared queue parked)

Task is **Backlog**, all AC stay open. The coordinator authorized parking this complete source unit on the private branch while another owner session runs Mapper under the shared heavy-command lock. No integration or Done claim. Work continues with ZN-1093, then ZN-1094 and ZN-1090; final exact proofs and criteria updates are folded into their task commits before integration.

- Restored e020951cc with `git cherry-pick -n` on ae6ce2811; no second replay of 1c3e51d8c. Kit source and unchanged kit_size hashes exactly match that checkpoint, including Inputs, Navigation and Feedback. `src/rt/rt.h` has no diff.
- Fixed the remaining inlining-model omission by using existing `effects(m, i) & kAllocs`, not just New/ArrNew. String concatenation/conversion, array growth and opaque runtime/native allocation effects now consume the same existing 40-unit allocation budget. Numeric helpers keep the prior policy. No UI trim, threshold increase, dependency or speed claim.
- Read-only reviewer corrected the old attribution: cost40 has 763 functions, not the 710 in the saved cost20 attribution.json. Dominant cost40 functions include applyToken 69,796 native bytes; Slider thumb 20,672; Progress 17,792; buildTextField 14,520. Slider has 12 New sites, 68 calls, 52 catches and 300 releases in 78,578 generated C++ bytes. Repeated cleanup is a secondary lead, not an additional implemented optimization or proven native saving.
- Extended exact layout regression with twice-called string-allocating joinOwned (shared), an arithmetic-only inlineNumber (still inlined), and the existing exactly-two Child New assertion. Own `tools/build zinc` PASSED after the effects change; exact `layout_reachability.sh` PASSED exit0 on that binary, including interpreter/AOT/QuickJS, verifier, Dyn/native worker records, hot/debug preservation. Raw logs/provenance are under this tree `.logs/1088-final/`. The fresh build has existing vendored warnings (including nanosvg); no complete-build warning-free claim.
- Reviewed conservative host requirements across native/cross. Both keep full host for reached QuickJS/QuickJSFast, using recursive usesNative so worker scripts are included. Unknown plugins/stamps remain full; audited SVG remains lite.
- Exact plugin test reached and passed its lite/cache/default-full/legacy-field-absence/network checks, then the newly added real Script case exposed an existing manual AOT link omission: script_native references imagesLive/kImageShims from the shared QuickJS image environment, whose archive was absent. Added zn_qjs after zn_script to native/cross links, its CMake dependency for embedders, cross build target and its Canvas 2D text archive dependencies. The Script regression uses ZINC_TEXT=simple, verifies full-host component retention, evaluates 6*7 and disposes. These latest link/dependency changes are **not built or proven yet**.
- Canceled only own queued build PID28529 (it had not begun); the other owner's Mapper is untouched. No process started by this worker remains. Latest existing build/zinc predates the script dependency correction, and provenance marks that mismatch explicitly. Static diff and shell syntax checks pass.

### Remaining exact proof

1. `tools/work-run 180 tools/build zinc`, then exact layout_reachability and plugin_system_host (including legacy and simple-text Script) with own final binary, ZINC_ROOT and bounded headless runs.
2. Direct **unchanged** `sh tests/t0/kit_size.sh` through work-run with stdout retained. No final gate has run for the effects-based candidate: the last actual cost40 gate remains 5,390,968 / 5,423,984 / 6,074,800 bytes, used 72,312 bytes/component and FAILED. Do not report those as after numbers or mark AC1 from static reasoning.
3. Original kit gallery check and short headless smoke with final integrated library source. Capture exact final sizes, hashes and attributable generated code/metadata before ticking criteria.

### Proposed tests and limits

- Owner-chosen milestone: allocation/call-heavy interpreter/AOT performance; no runtime speed measurement was made.
- Nested-worker embedded Script, cross/ELF archive linkage, app embedder linkage, hot/fast refresh, class_runtime, native_reachability and worker_wire/worker_typed remain proposed. No cross build, broad suite, benchmark, pixel compare, T1/T2/demo or conformance run.

## Final bounded proof — 2026-11-09

- Own warm `tools/build zinc` PASS including Script archive dependency repairs. Exact `layout_reachability` PASS (verifier, both makePair calls exactly two Child New, allocating string helper shared/arithmetic control inlined, reflection/inheritance/interface/Dyn/native-worker records and hot/debug preservation). Exact `plugin_system_host` PASS (lite42, cache, full default, absent legacy stamp field, reached networking, reached embedded Script eval42 with simple text, invalid enum). Logs retained in `.logs/core-proof/`. No rt.h change, UI trim, removed requested icon/library or threshold change.
- Direct unchanged `sh tests/t0/kit_size.sh` PASS, raw output `.logs/core-proof/kit_size.log`: AOT direct **5,308,712 B**, index **5,358,240 B**, ten **5,877,008 B**; unused 31 families **49,528 B** below 126,976 and additional component **57,640 B** below 65,536. Bundle direct **231,480 B**, index **233,567 B**, ten **263,389 B**; unused **2,087 B** below 7,936 and component **3,313 B** below 4,096. Current source includes the independently proven canonical neutral-helper bridge1095; these are final combined-source sizes, not an isolated native saving for effects alone.
- Attribution: dead-layout liveness had already isolated unused retention 148,600→33,016 B in the earlier checkpoint; raw class-table data was only ~968 B. Generic existing kAllocs effects now charge allocation/tracking/cleanup work against the unchanged40budget instead of treating StrConcat/ToStr/ArrPush/native/Rt allocations like arithmetic. Exact shared allocating-helper and arithmetic-control assertions prove that root behavior. Final generated-code sizes also include current1095 helper ownership; no runtime inline-performance measurement or isolated per-change native delta is claimed.
- Original `check examples/ui/kit-gallery` PASS and bounded headless three-frame interpreter smoke PASS with no own process left. Existing exact kit_inputs/kit_overlays also PASS for the changed helper callers. Earlier wrong examples/kit-gallery path produced only a missing-module diagnostic, corrected to the tracked path.
- Full kit source SHA256 **25b5131c4db2244759b6b2ccfd35ed64505efd8c79e760f50e83a499642793bd**, 34 files. `.logs/core-proof/provenance.json` records file hashes, unchanged size test hash and current binary/source agreement. Build has pre-existing vendored warnings; no complete fresh warning-free claim.
- All1088 criteria now checked/Done. No broad suite, T1/T2/demo, pixel, cross, benchmark or performance speed claim. Proposed milestone checks remain the list above: nested-worker Script/cross/embedding linkage and runtime allocation/call-heavy performance, class/native/worker/fast-refresh coverage.

### Real Linux cross proof and shared decoder repair

- Coordinator required a real cross-link/run for the modified manual archive path. Normal SSH was blocked waiting for its configured identity agent; direct noninteractive SSH reached the machine but authentication failed. Existing paired `zinc device zinc-player shell uname -m` succeeded (`aarch64`), so no pairing/key changes were made.
- Own cached-toolchain `build --target aarch64-linux` exposed actual missing i18n and shared image decoder references. Added the diagnostic archive and Linux dl linkage in dependency order. Added two small runtime codec wrappers, with proper CMake transitive dependency, and routed the shared web image environment through them. The runtime decoder keeps PNG/JPEG/BMP/GIF/WebP/fast image support and reuses the established length/dimension/pixel-capped decoder; no resource/font baker is linked into an app just to decode images. The existing CLI decoder, texture/sprite baker64MP limit and engine callback ABI/forwarders remain unchanged.
- Own warm zinc and enabled engine-module builds PASS. Exact codec_test PASS including existing format/header/round-trip checks plus tiny recognized oversized PNG/WebP/fast headers rejected before pixel allocation. Exact plugin_system_host and script_images PASS after the move.
- Final tiny Script+audited-lite SVG cross build PASS, **10,391,328 B**. Components record includes Script, network/full host and SVG; native host-contract regression separately isolates Script's full-host requirement (the cross default display is also conservative). Pushed only `zn/core-1088/probe` through the paired device route and ran `ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 15 ~/zn/core-1088/probe`; output **42**, exit0. Remote pgrep returned no remaining proof process. Logs `.logs/core-proof/{pi-cross-build,pi-push,pi-run,pi-processes,codec-final,plugin_system_host-final,script_images-final}.log`; fixture and replay scripts retained under the same directory.
- AC3 is temporarily reopened only for the final combined-source gate/gallery after the later1095/1090 changes. Earlier exact sizes/hash above are a historical tested snapshot, not the new final combined-source numbers. No broad suite or benchmark was run.

Runtime boundary correction is proven by exact codec assertions: existing baker format pixels still match; new runtime wrappers match PNG/BMP/GIF/JPEG pixels and WebP dimensions; recognized oversized PNG/WebP/fast headers are rejected before decoding. The baker keeps its separate64MP importer policy. Final codec/script/Pi replay PASS after this distinction; no large image allocation, importer rewrite or engine callback ABI change.

### Final combined-source closure (supersedes historical checkpoint numbers)

- After1095 ownership and1090 library-default asset discovery/serialization, final unchanged direct kit_size PASS: AOT direct5325320 B / index5374848 B / ten5910096 B; unused49528 B <=126976 and59472 B per component <=65536. JavaScript direct233514 B / index235601 B / ten272216 B; unused2087 B <=7936 and4068 B per component <=4096, exactly249 B of total nine-component headroom. No budget/UI trim or requested-icon removal. This is a combined-source snapshot, with no isolated effects-only saving or runtime speed claim.
- Current-source real Pi replay PASS: cached aarch64-linux Script+SVG probe10391584 B, paired-device output42/exit0; remote process check empty. This supersedes the historical cross artifact size above. No SSH credentials/pairing changed, no proof process remains.
- Current-source exact kit_inputs, kit_navigation and kit_overlays PASS. Original examples/ui/kit-gallery check PASS, bounded three-frame interpreter smoke PASS, and original Feedback scene three-frame QuickJS smoke PASS. Logs .logs/core-proof/*-final.log and pi-*.log. The final unchanged gate stdout and generated native artifacts are retained.
- All1088 criteria checked/Done. Final kit SHA256 7e76eea73be613e76cc497293bfa8a4790089a79b0b2390c12f5867409346a46 (sorted relative .ts/.tsx path, NUL, contents, NUL;34 files), final-provenance.json records hashes/source trees. No external Mapper/runtime WIP copied. Fresh Picker/Data source is not included and must rerun the unchanged gate after integration. Broader allocation/inlining performance, class/native/worker/hot/embedding and platform coverage remain proposed milestone checks; no suite, benchmark or speed claim.
