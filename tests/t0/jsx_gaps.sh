#!/bin/sh
# ZN-1025: JSX gaps in one program (tests/data/jsx_gaps): <Bar /> with every prop optional, {list.map(fn)} with a named and an imported
# function, aria-* and data-* on a component and a host node, {c ? list.map(...) : <View />}, narrowing into a JSX branch and through
# `a?.b !== undefined`, several children and {p.children?.()}. The texts the frame draws (ZINC_SCENE_DUMP) match expected.out, in the React
# and the Solid model, on the interpreter, AOT and QuickJS; a node id printed as text would show as a number.
cd "$(dirname "$0")/../.." || exit 2
d=tests/data/jsx_gaps
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/react" "$tmp/solid"
cp $d/main.tsx $d/rows.tsx "$tmp/react/"
sed 's#zinc:ui/react#zinc:ui/solid#' $d/main.tsx > "$tmp/solid/main.tsx"
cp $d/rows.tsx "$tmp/solid/"
fail=0
for model in react solid; do
  for engine in --interp --native "--engine quickjs"; do
    rm -f "$tmp/scene.bin"
    # shellcheck disable=SC2086
    ZINC_SCENE_DUMP="$tmp/scene.bin" ZINC_HEADLESS=1 ZINC_FRAMES=3 timeout 300 "$ZINC" run $engine "$tmp/$model/main.tsx" >"$tmp/log" 2>&1
    python3 tools/scene-texts "$tmp/scene.bin" 2>&1 | diff -u $d/expected.out - >"$tmp/d" || { echo "$model $engine: $(head -12 "$tmp/d") $(tail -3 "$tmp/log")"; fail=1; }
  done
done
exit $fail
