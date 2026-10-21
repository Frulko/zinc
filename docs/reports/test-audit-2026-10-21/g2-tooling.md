# Audit g2: tooling T1 tests (CLI, toolchain, plugins, packaging, trust, agent, macOS, debugger, simulators)

Basis: v0.4.2 release run status in g2.txt; every script read at least by header and assertions. PASS means it passed, not that it proved something.

| test | verdict | target (dup/merge) | reason with file:line evidence |
|---|---|---|---|
| agent_apps | KEEP |  | Device-agent apps, logs, inspector, port forward, terminal on loopback (agent_apps.sh:1-5); t0/agent covers only pairing/shell/push |
| agent_deploy | KEEP |  | `device deploy` target choice + real macOS export/install/start (agent_deploy.sh:1-6); unique |
| agent_dev | KEEP |  | `zinc dev --device` save-to-device, asset reload, red box on device; unique |
| agent_inspect | KEEP |  | inspector/shot/monitor/top through the agent; unique |
| agent_ota | KEEP |  | signed .zapp update, rollback, engine package via agent; unique. Uses ZN_WAIT_SCALE |
| agents_chat | SHORTEN |  | 64 s, 204 lines: one app, three fake CLIs, ~10 features per run. Split flows into one long run plus short smoke runs for codex/opencode (AGENTS.md "one long proof") |
| agents_go | SHORTEN |  | 49 s: 8 headless runs of 30000 frames (agents_go.sh:60-68); the 5 refusal cases (revoked/expired/moved/unknown/nokey) can share one run with a lower frame count |
| agents_markdown | KEEP |  | 17 s, chips/markdown/copy/wrap goldens; unique |
| agents_memory | KEEP |  | Deterministic caps from AGENTS_STATS (items, nodes, objects); only the RSS cap (agents_memory.sh RSS_CAP_KB) is machine dependent, passed on CI at 42 s |
| agents_usage | KEEP |  | Activity line, tokens, plan limits; unique |
| aot_assets | KEEP |  | AOT asset lookup order and permission checks; unique |
| aot | KEEP |  | Builds and runs kernels + run goldens natively, split units, stack overflow parity; t0/aot only does -fsyntax-only of fib |
| app_rollback | KEEP |  | swap/trial/rollback of staged app versions; unique (app_update only verifies publish/refuse) |
| app_update_api | KEEP |  | zinc:system/update from inside the app; unique |
| app_update | KEEP |  | publish + signed manifest + older-version refusal; overlaps t0/update_sign only on signature check |
| asset_reload | KEEP |  | Asset hot reload (atlas swap) in game-2d; "within 1 s" is waited via waitfor, passed on CI |
| atelier_devices | KEEP |  | Atelier devices panel vs loopback agent; unique |
| atelier_ide | KEEP |  | Atelier IDE scripted sessions + selftest; unique |
| backend_sw | KEEP |  | Software backend hash equals live frame hash for 2 apps x 1/4 threads (backend_sw.sh:7-11) |
| chip_models | KEEP |  | Chip decode models vs golden bitmaps (c++ unit-style). hw_shim should be folded in |
| cli_tools | KEEP |  | capture/bench/tsconfig/infer/deploy --print/export checks with real output assertions |
| codesign | KEEP |  | macOS codesign/entitlements/verify with temp keychain; passed on CI (12 s). Same export as permissions_export but different assertions |
| debug_cdp | KEEP |  | CDP debugger session (node) end to end |
| debug_cli | KEEP |  | Recorded transcripts of `zinc debug`; unique |
| debug_dap | KEEP |  | DAP session via python; unique |
| debug_lldb | LOCAL-ONLY |  | Needs lldb launch rights; already SKIPs on CI via ZINC_CI (debug_lldb.sh:7). Runs nothing on CI: keep as local-only or move to a nightly with DevToolsSecurity |
| dev_mode | KEEP |  | zinc dev reload/red box/CDP/monitor; note hard 2 s wait (dev_mode.sh:30) can flake on a loaded runner |
| device_modules | KEEP |  | Early refusal of unsupported modules for esp32 device; real output asserts |
| display_drivers | KEEP |  | Emulator drivers with SDL dummy video + remote display pixel equality |
| export_esp32 | LOCAL-ONLY |  | Needs pinned qemu-xtensa (export_esp32.sh:7): SKIPs on CI (status SKIP). t2/esp32_qemu covers the same emulator; flash.sh/core.bin file checks could move to a T0 without QEMU |
| export_wasm | KEEP |  | 55 s; exports + headless Chrome run, passes on CI. Borderline length |
| fast_refresh | KEEP |  | Component Fast Refresh in desktop-app; unique vs hot_swap (module level) |
| first_run | KEEP |  | Beginner error goldens + bare zinc/help. Template-run loop (first_run.sh:8-20) duplicates templates_kickstart; the doc-quote grep (first_run.sh:~40) ties docs to real messages (acceptable) |
| gh_org_setup | DELETE-WEAK |  | Tests a one-shot GitHub org admin script (tools/gh-org-setup) against a hand-written fake gh (gh_org_setup.sh:6-15); no product behaviour on CI |
| guide_store | KEEP |  | Runs every sh block of the distribution guides; real end-to-end, 15 s |
| host_direct | KEEP |  | Direct host rows frame hash, interpreter and AOT, plus top-level width() regression |
| hot_swap | KEEP |  | Interpreter Fast Refresh (module level, Solid dispose); unique |
| hw_shim | MERGE | chip_models | Same shape (compile test_hw.cpp with c++ and grep "ok") as chip_models; its zig cross-compile branch runs only if build/tc-home has zig (hw_shim.sh:15-24), i.e. never on CI. Fold the 3 test_hw.cpp runs into chip_models |
| index_search | KEEP |  | `plugins search` over index built by tools/index-repo; unique (templates_index covers `new`) |
| install_nocompiler | SHORTEN |  | 123 s: builds the whole package archive in-test unless ZINC_DIST is set (install_nocompiler.sh:23). Have CI feed ZINC_DIST from the package job; keep the assertions |
| install_offline | KEEP |  | `zinc install --offline` from cache; 0 s, unique |
| installer_deb | SHORTEN |  | 171 s: two cross builds of arm64 .deb with zig for the determinism check (installer_deb.sh:11-14). Compare against pack of a tiny program or reuse the first export's object cache; keep the ar/tar assertions |
| installer_dmg | KEEP |  | hdiutil attach + codesign verify; passed on CI |
| launch_time | LOCAL-ONLY |  | Timing budget; SKIPs on CI via ZINC_CI (launch_time.sh:7). Move the deterministic otool -L / weak-def checks (launch_time.sh:12-16) to a T0 that runs on CI, keep the 5 ms budget local |
| link | KEEP |  | zinc:link pairing/reconnect over DNS-SD loopback; unique |
| loader | KEEP |  | Loader stage frames + golden; unique |
| lsp | KEEP |  | Drives `zinc lsp` via lsp_test.py; no duplicate elsewhere |
| macos_bundle | KEEP |  | Dev bundle + build --bundle plist keys. Drop the `< 50 ms` timing assertion (macos_bundle.sh:20) as flaky on shared runners; last ` |
| macos_deeplink | KEEP |  | Real LaunchServices cold/warm URL delivery; passed on CI |
| macos_dialog | MERGE | macos_menu | Byte-identical script to dock/popup/shortcut/tray modulo the name (macos_dialog.sh:1-11); one looped `macos_selftests` over tests/golden/macos/<n> keeps the goldens |
| macos_dock | MERGE | macos_menu | Same copy-pasted script as macos_dialog (macos_dock.sh:1-11); fold into one loop |
| macos_menu | KEEP |  | Menu dump golden + onClick-once assertion (macos_menu.sh:14); becomes the home of the merged loop |
| macos_popup | MERGE | macos_menu | Same copy-pasted script (macos_popup.sh:1-11) |
| macos_power | KEEP |  | pmset assertion + clipboard round trip; passed on CI. Overwrites the user's clipboard locally (saved/restored) |
| macos_shortcut | MERGE | macos_menu | Same copy-pasted script (macos_shortcut.sh:1-11) |
| macos_tray | MERGE | macos_menu | Same copy-pasted script (macos_tray.sh:1-11) |
| macos_vibrancy | KEEP |  | AppKit checks run; the alpha pixel check silently skips without Screen Recording permission (macos_vibrancy.sh:17 WARN). Partly unproven on CI |
| macos_window | KEEP |  | Window readback with native-id normalisation (own python step); keep separate |
| map_rows | KEEP |  | Map/Set rows interpreter vs AOT vs expected |
| map | KEEP |  | Pixel golden of zinc:map; not in examples_pixels |
| mapper | LOCAL-ONLY |  | Needs a GL window (mapper.sh:11 exit 77 "no GL window"): SKIPs on CI, so its companion server check (mapper.sh:18-27) never runs either. Split the node companion check out so it runs without GL |
| microphone | KEEP |  | Fake microphone on 4 engines; t0/microphone_sim covers the sim stand-in only |
| midi | KEEP |  | Virtual ports; self-skips if no MIDI system (passed on CI) |
| mirrors | KEEP |  | ZINC_MIRRORS/proxy refusal of modified archives; unique |
| model | KEEP |  | gltfpack pipeline + frame compare; unique |
| music_notify | KEEP |  | Goldens of notification overlay; unique (link.sh covers the transport) |
| native_lazy | KEEP |  | Lazy native plugin load and compile-time signature mismatch; unique |
| native_plugins | KEEP |  | Native ABI for sqlite/process/socket against frozen outputs |
| notify_relay | KEEP |  | Relay against Notification Center fixtures; 38 assertions, 30 s |
| osc_full | KEEP |  | OSC in Zinc on zinc:socket; t0/osc is the native zinc:osc, different plugin |
| permissions_export | KEEP |  | enforce.out + Info.plist; shares the export of tests/golden/permissions with codesign but asserts other things |
| plugin_add | KEEP |  | git/archive pinning and offline reinstall; plugin_lock repeats the second-checkout step only |
| plugin_build | KEEP |  | Native cache, rebuild, missing system library message |
| plugin_cli | KEEP |  | search/add/update/remove/frozen/revocation messages over a local index; revocation.sh overlaps only on the "is revoked" line (plugin_cli.sh revoked vs revocation.sh:30) |
| plugin_community | KEEP |  | Community tier key pinning and `zinc trust` |
| plugin_fallback | KEEP |  | ZN-720 simulation fallback + Z5011; JSON-log block duplicates verbose_log (plugin_fallback.sh last lines), could drop |
| plugin_fetch | KEEP |  | Published binary fetch, tamper, transparency; shares the zig wrapper fixture with plugin_tiers/trust_policy |
| plugin_key | KEEP |  | Cache key independence from path/home; unique |
| plugin_lock | KEEP |  | Capability grants, --frozen, legacy lock migration; unique |
| plugin_prebuilt | KEEP |  | Prebuilt libs with no compiler (CXX=false); unique |
| plugin_relative | KEEP |  | ./ and ../ paths in manifest build flags; regression |
| plugin_repro | KEEP |  | Byte-identical plugin libraries/packs from two dirs; unique |
| plugin_sign | KEEP |  | `zinc sign`/`add --key` checks; unique |
| plugin_split | KEEP |  | tools/plugin-split determinism; real logic, git only |
| plugin_stamp | KEEP |  | Fast-path stamp, pkg-config shim; unique |
| plugin_starter | KEEP |  | `zinc new plugin` + reusable workflow steps; 124 lines, skips without zig/PyYAML (CI installs pyyaml, workflows:229) |
| plugin_tiers | MERGE | trust_policy | Same publisher/zig-wrapper/index fixture as trust_policy; its "2 matching rebuilds counts" (plugin_tiers.sh:55) = trust_policy `rb-default` (trust_policy.sh:49). Keep the tier-printing and wildcard delegation assertions in the merged test |
| profile | KEEP |  | Target profile f32/fx12/heap budget outputs vs conformance goldens |
| qjs_profile | DELETE-WEAK |  | On CI only checks that a default build refuses (qjs_profile.sh:8-10); the profiler assertions need build-prof/zinc and otherwise print "note:" and pass (qjs_profile.sh:15). Put it in a nightly with the ZN_QJS_PROFILE build or drop |
| rc | KEEP |  | Leak check over the corpus + destruction order; 9 s |
| reach_callbacks | KEEP |  | Reachability: interpreter, AOT, and dropped-class count |
| requires | KEEP |  | Capability "requires" diagnostics; real messages |
| revocation | KEEP |  | Revoked version/key via signed revocations.json; unique |
| rmpp_sim | KEEP |  | Panel model trace + glass image vs goldens |
| run_app_name | KEEP |  | Window/process name resolution; unique |
| run_cache | KEEP |  | Compiled run cache hit/miss with imports and assets; absorbs run_compiled |
| run_compiled | MERGE | run_cache | "second run reuses it" and "changed source rebuilds" (run_compiled.sh:12-14, 21) are run_cache's cache-hit/edit steps (run_cache.sh step calls). Move to run_cache: args passthrough, interp-vs-native frame hash equality, and "ZINC_DETERMINISTIC does not compile" |
| sbom | KEEP |  | SPDX schema + licence completeness + reproducibility. Currently SKIPs on CI: jsonschema is not installed (sbom.sh:6; workflow installs only pyyaml). Add `pip install jsonschema` to CI |
| script | KEEP |  | zinc:script on QuickJS, interpreted and AOT vs frozen outputs |
| self_update | KEEP |  | Self-update install/rollback/notice rules; unique (t0/update_sign only checks signatures) |
| serial | KEEP |  | pty-based serial plugin + stand-in |
| sim_compare | KEEP |  | zinc sim image compare/goldens; real CLI asserts |
| sim_program | KEEP |  | zinc sim scenarios; t0/sim_scenario is the unit-level runner |
| sim_replay | KEEP |  | Trace replay and divergence; unique |
| splash | KEEP |  | Splash entry in pack + wasm page; chrome leg self-skips |
| steps | KEEP |  | Step output on build/run/QuickJS/pipe/-q; its JSON-log block (steps.sh end) duplicates verbose_log and can go |
| sys_launch | KEEP |  | launchDir/locale; unique |
| system_instance | KEEP |  | Single instance + autostart with real processes; 27 s |
| system_manifest | KEEP |  | Manifest diagnostics Z5006 etc; unique |
| system_sim | KEEP |  | Recording simulator goldens interp vs AOT; 40 s, loops over all cases |
| templates_index | KEEP |  | `new` via index with tier policy; unique |
| templates_kickstart | KEEP |  | Every template check/test/sim + frame hash; absorbs first_run's template-run loop |
| tlog | KEEP |  | Transparency log inclusion/consistency proofs; unique |
| trust_policy | MERGE | plugin_tiers | See plugin_tiers: merge the two into one test with one publisher build (saves two zig builds). Unique here: policy keys, system-policy precedence, mirrors-by-policy, doctor output |
| tuf_index | KEEP |  | Pure TUF attack matrix; t0/tuf_canonical is canonical-JSON signing only |
| tuf_interop | LOCAL-ONLY |  | SKIPs on CI: python-tuf not installed (tuf_interop.sh:8). Meaningful and deterministic, so fix by `pip install tuf securesystemslib cryptography` in CI then KEEP; today it proves nothing there |
| verbose_log | KEEP |  | -v phases, plugin cache decisions, ZINC_LOG=ui, JSON log (canonical copy of the JSON check) |
| windows | KEEP |  | Multi-window goldens interp/native/QuickJS |
| zbc_cache | KEEP |  | ZBC cache invalidation matrix; unique |
| zinc_go_home | KEEP |  | QR scan with fake camera; unique |
| zinc_go | KEEP |  | Player + zinc dev --lan refresh; unique |
| zinc_test_runners | KEEP |  | Runner modes; two assertions only check "not built yet" placeholder strings (zinc_test_runners.sh devicesim line) |
| zinc_test | KEEP |  | Profile-golden selection and skip reasons; unique |

## Counts

- DELETE-WEAK: 2
- KEEP: 103
- LOCAL-ONLY: 5
- MERGE: 9
- SHORTEN: 4

## CI actions (tests that SKIP on the runner today and could be made to run)

- sbom: add `pip install jsonschema` (workflow zinc-next.yml:229 installs only pyyaml).
- tuf_interop: add `pip install tuf securesystemslib cryptography`; then KEEP.
- mapper: needs GL; split the node companion check so it runs headless.
- launch_time: keep the link-structure assertions on CI (otool -L, weak defs), drop only the timing budget.

## Cross-group duplicates noticed

- tests/t2/desktop.sh is a pure wrapper that re-invokes t1 macos_bundle/menu/dock/tray/window/shortcut/dialog/power/deeplink through `tests/run --only` (t2/desktop.sh loop): DELETE-DUP of this group's tests, and it adds one `[ -s statusitem.png ]` check only.
- t0/package.sh vs t1 self_update / t0/update_sign: `zinc update --check` is exercised in all three; t0/update_sign covers signature verification, self_update the install flow, t0/package the refusal from a build tree. Keep one assertion each.
- t0/microphone_sim and t0/webcam_sim share the pattern of the t1 microphone/webcam goldens (same .out files across engines): intended, not duplicate.
- t1/first_run template loop vs t1/templates_kickstart (this group), also t1/install_nocompiler runs `new game`/`run`/`dev` on an installed archive: partial overlap with first_run and dev_mode, but under a compiler-free PATH, so keep.
- Three JSON-log format checks: verbose_log (canonical), steps, plugin_fallback. Keep one.
- t2/esp32_qemu vs t1/export_esp32 (same emulator; only the t1 one also checks export artefacts).
- t2/zinc_go_phones vs t1/zinc_go: different (phones vs desktop player).
