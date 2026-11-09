---
id: ZN-1090
title: Collect reached library default icons without caller declarations
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-09 14:36'
labels:
  - ui
  - frontend
  - size-M
milestone: m-32
dependencies: []
type: bug
ordinal: 1011
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks Feedback defaults ZN-1078.11 and shared kit usage: .worktrees/1078-overlays-resume/.logs/feedback-icons-repro/main.tsx imports only Alert and Spinner from kit with no icons manifest; U0001 warns info and loader-circle, both render blank. Existing Selection check/minus defaults and PasswordField eye have the same library-owned asset boundary. Explicit icons lists in gallery fixtures are not a generic component fix. Do not copy SVG/glyphs or require every application to know internal kit icon names.

src/frontend/modules.cpp lucideModuleSource/iconModule scans only project roots before loading the generated icon data; inspect actual flow. Collect literal/default icons from reached library code, including real helper defaults, while preserving per-component shaking. Never bundle all standard-library or barrel-family icons to mask missing discovery. Keep dynamic application icon declarations/diagnostics and minified bundle/AOT behavior coherent. Existing lib/std/icons.tsx and pinned third_party/lucide are the provider, no new dependency or kit-specific compiler registry.

Primary research: Flutter IconData/staticIconProvider https://api.flutter.dev/flutter/widgets/IconData-class.html and https://api.flutter.dev/flutter/cupertino/staticIconProvider-constant.html illustrate static asset roots + icon shaking. These are alternatives to inspect, not a mandate to adopt font icons. Read existing Zinc source/reachability/resource baking and apply smallest general solution. Notes must identify what is proven for literal/default versus truly dynamic names. All heavy commands bounded, one target/exact regressions/short original scene, no broad suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Default icons of reached library components render without caller icons manifest on interpreter AOT QuickJS, including unchanged Alert/Spinner reproducer
- [x] #2 Unused family icons are absent; dynamic caller declarations and unknown-name diagnostics remain compatible; unchanged kit_size budgets do not regress
- [x] #3 Small exact asset regression plus original Feedback/default scene and relevant kit caller smoke pass, ownership/provenance/limits documented
<!-- AC:END -->

## Implementation plan — 2026-11-09

Primary search refreshed: esbuild API tree shaking (https://esbuild.github.io/api/#tree-shaking) conservatively removes unused declarations; Flutter staticIconProvider (https://api.flutter.dev/flutter/cupertino/staticIconProvider-constant.html) explicitly separates provider catalog declarations from asset roots. Zinc will use its existing typed RTA before inlining with an opaque provider, then union retained known Lucide names/aliases with existing explicit/project selections. The provider must not infer its own catalog. Known-name string inference may conservatively retain an unrelated matching literal, especially top-level library initialization; no callsite-perfect claim.

Coordinator accepted minimal optional typed discovery for valid Zinc programs on all three engines (including offline direct QuickJS and unbundled browser staging). Unsupported arbitrary JavaScript keeps its existing explicit/project declarations when the typed probe fails; it must not acquire a mandatory checker/esbuild requirement. The Proxy+kit-default limitation will be an explicit fixture/documented boundary, not reported solved. No untyped shaker/framework solely to erase that limit, full library icon catalog or manifest workaround.

## Implemented checkpoint and exact proof

- Per-load Lucide options keep the generated provider opaque during discovery. Existing typed RTA/data liveness runs before inlining and collects retained string constants, then the generator intersects them with pinned names/aliases and unions explicit/project selections. Native compilation reloads the final provider once; no asset catalog feeds its own inference. No UI registry, copied SVG/glyph, dependency or all-library selection.
- QuickJS discovery is lazy in the Lucide module loader. Vendored QuickJS resolves an already loaded module before calling the loader (quickjs.c js_host_resolve_imported_module), so existing module lifecycle deduplication supplies one discovery/result per provider load without a second cache/flag abstraction. Programs without a Lucide import do no typed probe. Collect/bundling/browser staging use that same module loader. Workers use their own entry when only the worker imports the provider; they never read/copy a mutable main-engine asset set.
- A shared mutex serializes optional typed probes. Discovery trusts validated native Specs without building/registering a plugin, allowing web staging/offline bundling; its read-only loader mode does not change process profile/number alias or direct-layout state. Generator warning deduplication is locked. Unsupported arbitrary JS falls back to unchanged explicit/project selection, with no new checker/esbuild requirement; the Proxy+kit-defaults limitation remains explicit.
- Own warm zinc build PASS. Exact `tests/t0/library_icons.sh` PASS: unchanged Alert/Spinner default scene and Selection/Password defaults on interpreter/AOT/QuickJS without caller icons; a reached helper default outside the project scanner; an unused apple helper absent; explicit dynamic heart union; unknown diagnostic; offline direct QuickJS; browser stage and cached minified esbuild bundle; a worker-only library default on all three engines; plain Proxy JavaScript and the documented unsupported-JS default-icon fallback. Retained `.logs/core-proof/library_icons-final.log` says pass.
- Precision is conservative: retained ordinary UI strings matching known names (for example bold/view/keyboard) may retain extra assets, and module initializer provenance can be lost in @main. The regression proves unused function-owned icon data absent, not callsite-perfect string flow. Requested default icons are rendered and named; no full catalog is inferred.
- AC1 proven; AC2 unchanged size gate and AC3 final original gallery/relevant kit smoke are pending in the final combined-source proof. No speed claim, broad suite, pixel comparison, benchmark, T1/T2/demo or new cross feature.

### Proposed tests and limits

- Owner-chosen milestone: broader hot/worker/module-cache and arbitrary-JS bundler asset inference. Arbitrary unsupported JS continues to require existing caller declarations; no claim that Proxy+kit defaults are automatically inferred. Dynamic names constructed only at run time retain the existing manifest policy.

### Pipeline review corrections

- Preserved warning eligibility for every syntactically selected icon name, including explicit dynamic JSX alternatives such as trash-2. A snapshot before inferred roots are added separates authored aliases from conservative matching ordinary strings; exact alias warning proof passes interpreter/QuickJS plus the same native case.
- Worker discovery explicitly omits the main program's immutable loader stage through a per-load option, while main discovery retains it. A worker-only default remains present and the unrelated sailboat loading-screen default remains absent, both with a valid typed main screen and a valid-JS Proxy main screen that the typed probe rejects. The global stage is never cleared or changed by worker discovery. Expanded exact library_icons PASS; no no-icon eager probe or second cache abstraction.
- Rebased/autosquashed onto coordinator develop; only task-file add/add claims required resolution, preserving all coordinator descriptions/assignees. Core source tree IDs matched before and after the rebase. No external mapper/runtime WIP was copied. Final gate/smokes now follow this reviewed source.

### Final asset serialization and unchanged size proof

- The reached ten-component provider legitimately selects41 canonical SVG documents (45 accepted spellings); aliases already share each body. The previous provider repeated181-byte headers and6-byte footers,7667 bytes in total. The generator now stores the same geometry once per selected icon and shares the identical header/footer in lucide(). Empty/unknown names still return an empty string. No name, glyph, family or explicit selection was removed; no inference-policy rewrite or threshold change.
- Actual minified JavaScript saving is7409 bytes (7480 bytes of gross wrapper sharing less71 bytes of helper overhead). Existing icon caching remains unchanged; two concatenations occur when a selected icon is first materialized. Runtime cost is unmeasured, with no speed claim. Expanded exact library_icons passes on all three engines and parses every selected SVG, checking ok and nonempty items.
- Final direct unchanged kit_size PASS: bundle direct233514 B / index235601 B / ten272216 B, unused2087 B <=7936 and4068 B per additional component <=4096. The nine-component allowance has exactly249 B of total headroom (36615 B used of36864 B). AOT direct5325320 B / index5374848 B / ten5910096 B, unused49528 B <=126976 and59472 B/component <=65536. AOT file sizes did not change from sharing the SVG wrappers. Raw output: .logs/core-proof/kit_size-final.log; binaries/generated C++ retained under kit-final.
- Fresh Picker/Data family changes must run the unchanged gate again after integration, since their legitimate Card/Slider extensions change the ten-component source. These sizes describe this source snapshot, not those unintegrated additions.

### Final caller proof and closure

- Final exact kit_inputs, kit_navigation and kit_overlays PASS. Original kit-gallery check and bounded three-frame interpreter smoke PASS; original Feedback scene bounded three-frame QuickJS smoke PASS, with no caller icon-manifest workaround. Real Pi Script+SVG replay also PASS on the current source. All1090 criteria checked/Done.
- Final kit source SHA256 7e76eea73be613e76cc497293bfa8a4790089a79b0b2390c12f5867409346a46 (34 files; final-provenance.json). Every selected SVG is parsed by the exact regression; unsupported arbitrary JavaScript + kit defaults remains the explicit caller-declaration boundary described above. No runtime timing or broader suite was run, and no started process remains.
