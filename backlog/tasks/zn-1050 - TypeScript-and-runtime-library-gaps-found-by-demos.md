---
id: ZN-1050
title: TypeScript and runtime library gaps found by demos
status: Done
assignee:
  - '@parallel'
created_date: '2026-11-07 16:39'
updated_date: '2026-11-08 20:39'
labels:
  - typescript
  - size-M
milestone: m-13
dependencies: []
ordinal: 3100
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Engine gaps (fixed, not worked around): Number.prototype.toLocaleString, JSON.stringify with a replacer and Dyn key order, QuickJS UTF-8 bytes and clock resolution, a zip/inflate API.

From backlog/later.md, promoted by the review of 2026-11-07 (docs/reports/backlog-review-2026-11-07.md). The lines it carries:

- QuickJS: strings of raw bytes (Response.bytes(), an event's rawBody) turn UTF-8 bytes into U+FFFD; the same gap as the zinc:subtle one fixed on 2026-10-29.
- QuickJS: sys.clock() read 0 ms around a sub-millisecond loop; check its resolution.
- TypeScript: Number.prototype.toLocaleString is missing; the iPod Settings shows plain numbers.
- TypeScript: a Dyn JSON.stringify writes integer-like keys in insertion order; JavaScript writes them first, ascending.
- TypeScript: JSON.stringify with a replacer function is refused.
- Mapper: a value of type `any` is refused as a ternary's condition (Z0103 any to boolean) where TypeScript takes it; hit in the sync card, typed the state instead.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 toLocaleString on number compiles and formats in the interpreter, AOT and QuickJS
- [x] #2 JSON.stringify accepts a replacer function; integer-like keys come first, ascending
- [x] #3 QuickJS raw-byte strings keep UTF-8 bytes; sys.clock() resolves sub-millisecond
- [x] #4 A test per item on every engine
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research: ECMA-402 Number.prototype.toLocaleString / Intl.NumberFormat defaults (min 0, max max(min,3) fraction digits, grouping on: https://tc39.es/ecma402/#sec-intl-numberformat-constructor, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString); ECMA-262 SerializeJSONProperty calls the replacer top-down with the holder, undefined drops an object key and is null in an array (https://tc39.es/ecma262/#sec-serializejsonproperty); OrdinaryOwnPropertyKeys lists array-index keys first, ascending, then strings in insertion order (https://tc39.es/ecma262/#sec-ordinaryownpropertykeys).

Done:
- toLocaleString on a number: a checker rewrite to a generated helper (check.cpp numToLocale: en-US grouping, minimumFractionDigits/maximumFractionDigits/useGrouping from an object literal, NaN, ∞); QuickJS (no Intl) gets the same function on Number.prototype in src/qjs/prelude.cpp, only when the engine formats 1234.5 without a comma (JSC/V8/Hermes keep Intl).
- JSON.stringify(v, replacer[, indent]): the value is read back as a JSON tree and dyn.cpp __jsonApply applies the replacer per key; integer-like keys first, ascending, in rtcalls.cpp jsonOut and in dyn.cpp (__dynKeys).
- any as an if/?: condition: truthiness() rewrites it to __dynTruthy. Found on the way: c ? v * 10 : v with v any joined to number and threw on an object; a ?: with one any branch is now any (not for an undefined branch: c ? m.get(k) : undefined keeps m's type).
- sys.clock(): __clockMs() in both preludes (Date.now's clock, not floored); it read whole milliseconds on every engine, not only QuickJS.
- QuickJS raw-byte strings (Response.bytes(), Request.rawBody): already fixed by a067a69fd and 858427069 (2026-11-01), covered by tests/t0/net_raw_bytes.sh and net_fetch_bytes.sh on the three engines; not re-run here (fixed ports: after integration).
- Test: tests/t0/ts_lib_gaps.sh (Node output, interpreter, AOT, QuickJS; clock on the three). Regression: checker, dyn_*, json_typed_shape, map_any_value, forof_dyn_conditional, clock_tick, console_clock, async_infer, jsx_gaps pass; zinc check over app/, examples/, templates/ unchanged.

Not done (not in the criteria): the zip/inflate API of the description; later.md line proposed.
Ceilings (ponytail): every locale formats as en-US; digits come from toFixed (exact binary: (1.005).toLocaleString(undefined,{maximumFractionDigits:2}) is 1.00, V8 says 1.01); >= 1e21 keeps the exponent; other options (style, currency) are ignored.

Proposed tests (after integration): net_raw_bytes, net_fetch_bytes, clock_real, timers_wall_clock; T1 runs of examples using clock() (pinball, platformer).
<!-- SECTION:NOTES:END -->
