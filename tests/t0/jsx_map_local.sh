#!/bin/sh
# ZN-1079: node provenance survives local returns, without leaking across bindings or nested functions.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/solid" "$tmp/react"
cp tests/data/jsx_map_local/main.tsx "$tmp/solid/main.tsx"
sed 's#zinc:ui/solid#zinc:ui/react#' tests/data/jsx_map_local/main.tsx > "$tmp/react/main.tsx"
fail=0
for model in solid react; do
  for engine in --interp "--engine quickjs"; do
    rm -f "$tmp/scene.bin"
    # shellcheck disable=SC2086
    if ! ZINC_SCENE_DUMP="$tmp/scene.bin" ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 45 "$ZINC" run $engine "$tmp/$model/main.tsx" >"$tmp/log" 2>&1; then
      cat "$tmp/log"; fail=1; continue
    fi
    python3 tools/scene-texts "$tmp/scene.bin" > "$tmp/texts" && diff -u tests/data/jsx_map_local/expected.out "$tmp/texts" || { echo "$model $engine: wrong children"; fail=1; }
  done
done
exit "$fail"
