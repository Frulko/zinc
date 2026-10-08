#!/bin/sh
# The interpreter as a WASI module (ZN-135): tools/build-wasm builds vm.wasm with the pinned zig (no emscripten); the 18 M3 programs (corpus/M3-set.txt) run on it under Node's WASI
# (wasmtime when installed) and print what `zinc run` prints in a deterministic run, with the same exit code.
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null || { echo "wasm: no node, skipped"; exit 0; }
tools/build-wasm >/dev/null 2>&1 || { echo "tools/build-wasm failed"; tools/build-wasm 2>&1 | tail -5; exit 1; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
fail=0
for b in $(cat corpus/M3-set.txt); do
  "$ZINC" --emit=zbc-bin ../tests/conformance/$b.ts "$t/$b.zbc" 2>/dev/null || { echo "$b: no zbc"; fail=1; continue; }
  if command -v wasmtime >/dev/null; then wasmtime run --dir "$t" build-wasm/vm.wasm "$t/$b.zbc" > "$t/$b.w" 2>/dev/null; w=$?; else node --no-warnings tests/wasm/run.mjs build-wasm/vm.wasm "$t" "$b.zbc" > "$t/$b.w" 2>/dev/null; w=$?; fi
  ZINC_DETERMINISTIC=1 "$ZINC" run "$t/$b.zbc" > "$t/$b.i" 2>/dev/null; i=$?
  cmp -s "$t/$b.w" "$t/$b.i" && [ "$w" = "$i" ] || { echo "$b: wasm exit $w, interpreter exit $i, outputs $(cmp -s "$t/$b.w" "$t/$b.i" && echo same || echo differ)"; fail=1; }
done
[ $fail = 0 ] && echo "wasm: $(wc -l < corpus/M3-set.txt | tr -d ' ') programs match the interpreter on WASI"
exit $fail
