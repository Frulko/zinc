#!/bin/sh
# The compiler built to wasm (ZN-774.29): `tools/build-wasm compiler` builds build-wasm/zinc-compile.wasm with the pinned zig (about 30 s the
# first time, a second after); lesson 8 of docs/learn, compiled on it under Node's WASI, is byte for byte the ZBC `zinc --emit=zbc-bin` writes,
# and both run headless to the same output and the same frame.
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null || { echo "wasm_compiler: no node, skipped"; exit 77; }
tools/build-wasm compiler >/dev/null 2>&1 || { echo "wasm_compiler: tools/build-wasm compiler failed"; tools/build-wasm compiler 2>&1 | grep -v '^warning' | tail -5; exit 1; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT HUP INT TERM
s=docs/learn/samples/08-state
ZINC_PLATFORM=linux timeout 60 node --no-warnings tests/wasm/compile.mjs build-wasm/zinc-compile.wasm "$PWD" "$s" src/main.tsx "$t/w.zbc" || { echo "wasm_compiler: the wasm compiler failed on $s"; exit 1; }
ZINC_PLATFORM=linux "$ZINC" --emit=zbc-bin "$s/src/main.tsx" "$t/n.zbc" || exit 1
cmp -s "$t/w.zbc" "$t/n.zbc" || { echo "wasm_compiler: the ZBC of the wasm compiler differs from zinc's"; exit 1; }
for k in w n; do
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SHOT="$t/$k.png" timeout 60 "$ZINC" run "$t/$k.zbc" > "$t/$k.out" 2>/dev/null || { echo "wasm_compiler: the run of $k.zbc failed"; exit 1; }
done
cmp -s "$t/w.out" "$t/n.out" && cmp -s "$t/w.png" "$t/n.png" || { echo "wasm_compiler: the runs differ"; exit 1; }
echo "wasm_compiler: $s compiles on zinc-compile.wasm to zinc's ZBC ($(wc -c < "$t/w.zbc" | tr -d ' ') bytes) and runs to the same frame"
