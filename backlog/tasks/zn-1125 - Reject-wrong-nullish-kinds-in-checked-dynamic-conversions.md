---
id: ZN-1125
title: Reject wrong nullish kinds in checked dynamic conversions
status: Backlog
assignee:
  - '@parallel'
created_date: '2026-11-12 09:46'
labels:
  - language
  - frontend
  - size-S
milestone: m-7
dependencies: []
ordinal: 17502
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Blocks ZN-1037 older-daemon wire validation: interface Reply { value?: number; }; JSON.parse of {"value":null} silently accepts null as undefined on current interpreter. Preserve optional absence, explicit false/zero/empty and correct nullable values, but reject a wrong Dyn nullish kind before typed storage erases its distinction. D18 shared static representation is unchanged. Source seams frontend/dyn.cpp Union converter and QuickJS typed schema nullish converters; no runtime/IR/ABI/caller changes. Original mini and full production wire failures retained under .worktrees/1037-remote-wire/.logs/remote1037/optional-null.ts, optional-null-interp.log, wire.ts and wire-no-null.ts. Primary/source diagnosis .logs/research-next-l.txt.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Checked optional typed fields and values accept absence/undefined and reject explicit null, while nullable types accept null and reject undefined, on interpreter, AOT and QuickJS.
- [x] #2 Focused nested record, array, primitive, callback/result and optional Dyn controls preserve legitimate values, explicit zero/false/empty, unknown additions and TypeError behavior without runtime storage changes.
- [ ] #3 Original ZN-1037 production decoder fixture rejects explicit optional mediaBits:null and rules:null, while older omissions and same-version payloads still pass on all three engines without caller workaround.
<!-- AC:END -->


## Implementation Notes

2026-11-12: own true base d81310863944332d2db392370c4c18aaf4150f08; follows1124 repair2b602f2e4. Checked Dyn unions now admit the exact nullish tag; frontend `bothNullish` metadata preserves optional nullable direct/aliased declarations and Partial. Type identity/hash and union propagation include that metadata; ordinary undefined-producing unions do not gain null admission. No runtime/IR/value ABI or storage change. Optional unknown retains real dynamic null/undefined. QuickJS checked schemas distinguish `~` and `?` and compose them for both; native-wire `tilde=false` output is unchanged.

Proof: own relative tools/build zinc stage1/stage2 both exit0, logs retained. Exact checked_nullish stage2 passes schema assertions and real interpreter/native AOT/QuickJS runtime, including direct/alias/Partial optional nullable valid absence/null, ten malformed cases, required nullable missing rejection, optional unknown and explicit false/zero/empty. Samechecker exact try_flow recheck passes all3 and28 negatives. Old common frontend schema harness and new literal assertion agree byte-for-byte: `{n:?d,alias:??d,u:?d,nill:?d,both:?d}`; checked schema is `@P{n:~d,alias:~?d,u:~d,nill:?d,both:~?d}`. Native runtime artifact hashes and original baseline are retained under .logs/aot-artifacts and .logs/nullish-baseline. Actual original old1124 CLI baseline confirmed optionalnullable accepted on VM/AOT/QJS; explicit required T|undefined missing incorrectly became null only on QuickJS, now fixed by schema discriminator. The first baseline used a four-file copied CLI lacking adjacent native archives and --native fell back to VM; retained/labeled, not counted as AOT. Actual adjacent-build AOT rerun compiled/linked/ran native and its executable is preserved. Existing NanoSVG/duplicate-library warnings only.

Acceptance3 remains open: the actual1037 production wire interpreter now passes the full null/malformed/default matrix. QuickJS passes track cases but accepts a missing required playlist id: strip.cpp declarations follows relative imports only, ignores zinc:ipod, and Records cannot resolve namespaced ipod.SmartRules, so the whole PlaylistsReply schema becomes empty and the checked copy is skipped. This is a pre-existing schema acquisition gap, not caller policy; no duplicated app type or catch-empty workaround is permitted. Coordinator owns the next engine boundary repair; original failed QJS stage and sources remain in remote1037 .logs/remote1037/stage-1125-production. No production all-three completion claimed. No suite/T1/T2/device/daemon/network/OS action or speed claim.

Proposed decision: validate dynamic nullish tags before shared typed storage; keep a declaration-only both-tag admission bit and existing static printing/storage semantics. Restrict new marker semantics to checked schemas so native record wire bytes remain compatible.
Proposed later line: D18 mixed null/undefined history in typed storage remains unchanged; QuickJS checked-copy unsupported schemas/non-JSON conversion sites remain explicit, not generally validated by this repair.

### Proposed tests

- Owner-selected broader json_typed_shape, optional_unknown_undef, typed worker/native record and callback conversion regressions (seconds to a minute, memory unmeasured). Exact checked_nullish/try_flow already pass; actual iPod production all3 waits for the schema-resolution engine repair.

2026-11-12 follow-up before1126: one bounded exact probe found an introduced strict-admission regression for `type Missing = undefined; value: number | Missing`: old1124 VM accepted missing; new VM/actualAOT refused missing because the standalone alias had already become fixed tNull. All before logs and source are retained under .logs/undefined-alias, with real native compile/run in the current probe. Shared checker now follows non-generic alias RHS in its stored declaration scope when determining a union's admitted undefined tag. Checked schema generation follows nullish aliases only with tilde=true; the native-wire unsupported alias form remains empty, asserted. Exact checked_nullish alias-stage1 passes schema assertions and actual interpreter/native/QuickJS with11 malformed cases plus aliased undefined absence; original f8dd62be2 history is retained. Build .logs/build-1125-alias-stage1.log exit0; test .logs/checked-nullish-alias-stage1.log PASS. No1126 source change is included. AC3 remains open for the separately claimed1126 namespace schema gap.
