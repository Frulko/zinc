#!/bin/sh
# zinc assets clean (ZN-437): a build of tests/data/assets_check fills the asset cache of ZINC_HOME; clean removes it and says how many files
# and how much, a second clean says it is already empty, and the next build imports every asset again.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p="$tmp/p"
mkdir -p "$p/assets/boot" "$p/assets/level1"
cp tests/data/assets_check/zinc.json "$p/"
head -c 4096 /dev/urandom > "$p/assets/boot/hud.bin"
head -c 20000 /dev/urandom > "$p/assets/level1/a.bin"
export ZINC_HEADLESS=1 HOME="$tmp" ZINC_HOME="$tmp/.zinc"
unset ZINC_NO_CACHE
fail=0
imported() { sed -n 's/.*"imported": \([0-9]*\).*/\1/p' "$p/build/assets/linux/report.json"; }

"$Z" assets build "$p" --target linux >/dev/null || { echo "assets_clean: build failed"; exit 1; }
[ -d "$tmp/.zinc/cache/assets" ] || { echo "assets_clean: no cache after a build"; fail=1; }
out=$("$Z" assets clean 2>&1); rc=$?
[ $rc -eq 0 ] || { echo "assets_clean: exit $rc"; fail=1; }
printf '%s\n' "$out" | grep -qE "^zinc assets clean: removed [0-9]+ files, [0-9.]+ KB, from .*/cache/assets " || { echo "assets_clean: unexpected: $out"; fail=1; }
[ -d "$tmp/.zinc/cache/assets" ] && { echo "assets_clean: the cache is still there"; fail=1; }
out=$("$Z" assets clean 2>&1)
printf '%s\n' "$out" | grep -q "^zinc assets clean: the asset cache is already empty" || { echo "assets_clean: second clean: $out"; fail=1; }
"$Z" assets build "$p" --target linux >/dev/null || { echo "assets_clean: rebuild failed"; exit 1; }
[ "$(imported)" = 2 ] || { echo "assets_clean: the build after clean imported $(imported), expected 2"; fail=1; }
[ $fail -eq 0 ] && echo "assets_clean: ok"
exit $fail
