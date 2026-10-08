# Zinc Next: fuzzing

ZN-147. Four libFuzzer targets (`tests/fuzz`), built with AddressSanitizer and UndefinedBehaviorSanitizer in their own build tree (`build-fuzz`).

| Target | What it feeds | What must hold |
|---|---|---|
| `fuzz_parse` | arbitrary bytes to the lexer and parser | no crash, hang or stack overflow; diagnostics are the only refusal |
| `fuzz_check` | arbitrary text as `main.ts` through loading, checker, lowering, optimizer, reference counting, the IR verifier, ZBC emission and its verifier | no crash or hang; a program the checker accepts lowers to IR and ZBC that verify (a failed verify aborts the run) |
| `fuzz_zbc` | arbitrary bytes to `zbc::decode` and `zbc::verify` | no crash; a file that decodes and verifies encodes back to the same bytes (one spelling per module) |
| `fuzz_native` | an export signature (first line) and argument bytes | the signature parser refuses what it does not know, the registry refuses a malformed export, a registered export is called with arguments decoded from the bytes |

## Running

```
tools/fuzz <parse|check|zbc|native|all> [seconds=60]
```

The tool configures `build-fuzz` with Homebrew's clang (`brew install llvm`; Apple's clang ships no libFuzzer; set `LLVM=<prefix>` to use another), builds the targets, seeds `build-fuzz/corpus/<target>` from `tests/golden`, the checker's programs, `tests/conformance` and the compatibility ZBC files, and runs the target. New corpus entries stay in `build-fuzz/corpus`. The T2 gate `tests/t2/fuzz.sh` runs 60 seconds per target and is skipped without a libFuzzer clang.

Long run: `tools/fuzz all 3600` (or one target for a night with `tools/fuzz check 28800`; `-- -jobs=4 -workers=4` after the seconds runs several processes). A crash leaves `tests/fuzz/crashes/<target>-<kind>-<hash>`.

## When a crash is found

1. Reproduce: `build-fuzz/fuzz_<target> tests/fuzz/crashes/<file>` (the report names the frames).
2. Fix the cause where all callers go through (the checker, the decoder), not in the harness.
3. Copy the input to `tests/fuzz/regress/<target>-<what>.<ts|zbc>`: `tests/t0/fuzz_regress.sh` runs every file there through `zinc` and fails on a crash, a signal or a hang (timeout 20 s). A file that must be refused rather than merely survived gets a line at the end of that script.
4. Delete the artifact from `tests/fuzz/crashes`.

## Found and fixed (first runs)

| Target | Input | Cause | Fix |
|---|---|---|---|
| `fuzz_zbc` | `zbc-class-flags.zbc`: a class with flag bits the encoder never writes | the decoder accepted any flag byte and dropped the unknown bits, so two files meant one module | decoding refuses flags above 3 (`invalid class flags`) |
| `fuzz_check` | `check-verify-quadratic-{1,2,3}.ts`: regular expression tests, 1.6 to 4 KB, 1 to 3 s in a release build, a minute with sanitizers | the IR verifier computed dominators as an n x n bit matrix to a fixed point: quadratic in the blocks of a function | Cooper, Harvey and Kennedy over a reverse postorder, dominance by the intervals of a walk of the dominator tree; 3.0 s becomes 0.14 s |
| `fuzz_check` | `check-lvalue-untyped.ts`: `static { C.n$ = 5 }` and a name with a stray byte | assigning to a member of an object the checker had not typed read the type table at the "no type" index | `lvalue` and `primMember` leave an untyped object alone |

## Runs (10 minutes each, ASan and UBSan, seeded corpus)

| Target | Result |
|---|---|
| `fuzz_parse` | 1.28 M runs, clean |
| `fuzz_zbc` | 1.00 M runs, clean |
| `fuzz_native` | 54 M runs, clean |
| `fuzz_check` | one failure after the three fixes above: `regress/check-dup-names-invalid-ir.ts`, a program with nested and top-level functions and classes of the same names (`early`, `later`, `LIMIT`, `Late`, `make`) is accepted by the checker and lowered to invalid IR (`setfield value type differs from the field type`). **Open**, not fixed yet: ZN-147 stays in Review. The compiler reports an internal error and exits 3 (no crash), which is what `tests/t0/fuzz_regress.sh` accepts for now. |
