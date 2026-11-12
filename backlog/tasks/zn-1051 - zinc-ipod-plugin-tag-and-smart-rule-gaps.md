---
id: ZN-1051
title: 'zinc:ipod plugin: tag and smart-rule gaps'
status: Backlog
assignee: []
created_date: '2026-11-07 16:40'
labels:
  - ipod
  - plugin
  - size-M
  - demo
milestone: m-9
dependencies: []
ordinal: 18700
updated_date: '2026-11-12 06:25'
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The native plugin loses data or logs assertions for some iPods and playlists.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- zinc:ipod: ensureSysInfoExtended built from SysInfo never writes the SQLiteDB key; a Nano 5G-7G set up that way would get a plain iTunesDB and lose its SQLite database. Write the key for those generations.
- zinc:ipod: libgpod logs g_utf8_casefold assertions when a text smart rule meets a track without that tag; patch the vendored itdb_splr_eval.
- iPod Genius batch B: setSmartRules cannot write back a rule it has no name for (album rating, loved); the editor keeps those playlists read-only or keeps the raw rule.
- zinc:ipod: expose Track.checked, grouping and compilation so smart previews cover those fields.
- zinc:ipod: Track lacks file kind, grouping, compilation and modified, so smart previews and the editor skip those fields.
- zinc:ipod: the smart preview maps mediaType to a single libgpod bit; a track with several media bits could differ from libgpod.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 SQLiteDB key written by ensureSysInfoExtended for Nano 5G-7G
- [x] #2 libgpod g_utf8_casefold assertion fixed in the vendored itdb_splr_eval
- [x] #3 Track exposes checked, grouping, compilation, file kind, modified; smart preview maps every media bit
- [x] #4 setSmartRules keeps or round-trips a rule it has no name for; a test per fix
<!-- AC:END -->


## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-12, isolated work/1051-ipod-rules, base bdaeaaeb4. AC2/3/4 proven; AC1 stays OPEN and status Backlog because the vendored libgpod model/enum table identifies Nano5/6 but not Nano7. No inferred generation strings or invented Nano7 capability were added. Next step for AC1: research authoritative Nano7 model/capability data and extend the existing model path, then prove a generated fallback for that model; an actual device's existing/USB SysInfoExtended remains untouched.

Scope/callers read: sysInfoExtendedPlist/ensureSysInfoExtended and C capability helper; the sole native toTrack adapter and generated record spec; every Track object literal (sim, existing TrackTable empty row, genius/foryou fixtures); TypeScript ruleMatches/evaluateSmart; native toRules/setRules/refillSmart and Library wrappers (backup-before-write left intact); app smart editor callers remain read-only for opaque rules. The ipod section of implicit-state-machines.md was read. No Library open/close/photosRead_/backedUp_ lifecycle, engine, runtime, HAL, host or UI implementation changed. The one app edit only initializes two newly required Track fields.

Implementation:
- The existing C SysInfoExtended helper asks libgpod for SQLite capability BEFORE a generated plist exists, and carries SQLiteDB=true alongside its artwork keys. Fake Nano5 C027 and Nano6 C525 keep SQLite enabled after the generated plist is loaded; Classic B029 does not gain it. No iTunes database or real-device/USB write was performed.
- Ten nullable native text tags are checked before g_utf8_casefold, preserving missing-tag matches-nothing semantics, including negated rules. The vendor PIN records the small existing-libgpod patch; no new dependency or licence change.
- Track adds checked (inverse of libgpod's checked flag) and numeric mediaBits (all32 bits, preserving the existing mediaType name). Existing grouping/kind/compilation/modified data now participates in the TS preview, checkedOnly filters before rules/limits, and videoKind uses the whole mask. Native, spec, stand-in and all record constructors are in step.
- setRules copies the COMPLETE existing native opaque rule only when its exposed view is unchanged at the SAME POSITION. String ownership is copied as in upstream splr_duplicate; from/to64-bit values, dates/units, unknown/reserved fields stay intact. New, edited, inserted or moved unknown rules are refused before mutation. An unchanged opaque limit is retained. Nonrefreshable playlists keep their members; setRules never invokes libgpod evaluation for them. No raw-write API or permissive parser was introduced.

Dedicated primary research supplied by the coordinator is copied in .logs/research-1051.txt. Existing libgpod is the correct dependency: https://github.com/gtkpod/libgpod ; https://raw.githubusercontent.com/gtkpod/libgpod/master/src/itdb_device.c ; https://raw.githubusercontent.com/gtkpod/libgpod/master/src/itdb_playlist.c ; https://raw.githubusercontent.com/gtkpod/libgpod/master/src/itdb.h ; GLib nullable-string contract https://docs.gtk.org/glib/func.utf8_casefold.html .

Proof (all heavy commands serialized/bounded by MAIN tools/work-run, no engine build):
- Exact T0 ipod_rules PASS (.logs/t0-strict-final.log). The small serial native fixture compiles only needed libgpod units plus dead-stripped core functions, writes only mktemp fake folders, forces NO_USB and fatal GLib criticals. It checks Nano5/6/classic generated capability, 80 missing-text field/action combinations, native checked/full32bit/tag output, whole-struct opaque field/action retention, member/limit retention and rejected edit/insertion/reorder/limit mutation. No broad ipod.sh or suite was run.
- Pure smart fixture AND actual ipod.sim.ts on interpreter/AOT/QuickJS PASS (.logs/smart-proof-2.log and per-fixture outputs). Checked filtering, grouping/kind/compilation/modified and composite/high media bits agree. The in-memory stand-in makes no physical filesystem/USB call.
- Original app native TYPECHECK PASS (103 files), with native iPod/wrappers rebuilt and linked (.logs/app-native-check.log); no application execution/detection/device write. Strict own-source C/C++17/no-exceptions/no-rtti syntax with warnings-as-errors passes (.logs/strict-syntax-2.log), STB marked system header for its existing warnings. No global dependency/toolchain installed.
- Initial native link missed two vendor dependencies; fixed by including their real source units, not stubs. Full failed log .logs/native-proof-1.log and first script retained; the first fixture source is explicitly labelled reconstructed (later unknown-action/reorder assertions removed). An attempted app stand-in check hit unchanged SQLite node:module profile refusal Z0119; no SQLite/app workaround. Native check passes. Initial strict Werror exposed nine unchanged STB missing-initializer/deprecated-sprintf diagnostics; retained, then checked own source with STB as a system header. All failed logs and relevant scripts/artifacts are retained.

Limits: no actual iPod/USB/mount/restore or database save/reload campaign, full app run, Linux native build, suite or performance/memory claim. Native rule retention is proven on the actual in-memory Itdb_SPLRule before unchanged serialization, not a physical-device round-trip. Native plugin/wrapper compilation is proven, not a new native ABI teardown/reload guarantee. Usage: n/a (tools/usage).

Proposed decision (no D number): retain immutable opaque rules through the existing database object at matching positions, rather than adding a raw binary public API or converting64-bit payloads through floating point. The UI may stay read-only; validated programmatic round-trips preserve the native data and never guess membership. Preserve SQLite from the same existing capability source used before plist generation; unknown hardware remains unknown.

Proposed later line: ZN-1051: add authoritative Nano7 model/capability support to the existing libgpod fallback and prove its generated SQLiteDB key; test actual device/database save-reload and Linux native packaging at the selected milestone.

Proposed tests:
- Owner-selected existing fake-database save/reload plus opaque rules on a prepared fixture (short bounded run, ~10–20s after build, memory unmeasured); no physical device or backup restore in this task.
- Existing ipod_plugin/ipod_smart/app sessions and real-device backup/restore only at an owner-selected milestone; retain the original safety gates.
- Linux focused ipod_rules with existing pkg-config dependencies (bounded120s including build, memory unmeasured); no dependency installation performed here.
<!-- SECTION:NOTES:END -->
