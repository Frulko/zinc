#!/bin/sh
# zinc assets check (ZN-437) on tests/data/assets_check (budgets for linux: download 100 KB, boot 8 KB, ram 48 KB): under them it exits 0
# with every budget ok; a 64 KB file more in level1 puts that group over ram and the packs over download: exit 1, each named with its sizes
# in KB, and the group within its budget (boot) is not blamed. The assets are random bytes, so the release packs (zstd) do not shrink them.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p="$tmp/p"
mkdir -p "$p/assets/boot" "$p/assets/level1"
cp tests/data/assets_check/zinc.json "$p/"
head -c 4096 /dev/urandom > "$p/assets/boot/hud.bin"
head -c 20000 /dev/urandom > "$p/assets/level1/a.bin"
head -c 20000 /dev/urandom > "$p/assets/level1/b.bin"
export ZINC_HEADLESS=1 HOME="$tmp" ZINC_HOME="$tmp/.zinc"
fail=0
want() { printf '%s\n' "$2" | grep -qF -- "$3" || { echo "assets_check: $1: no '$3' in:"; printf '%s\n' "$2" | head -20; fail=1; }; }

out=$(cd "$p" && "$Z" assets check --target linux 2>&1); rc=$?
[ $rc -eq 0 ] || { echo "assets_check: under budget: exit $rc"; fail=1; }
want under "$out" "ok    ram: largest group level1 39 KB of 48 KB"
want under "$out" "ok    download: every pack together 43 KB of 100 KB"
want under "$out" "ok    boot: group boot (loaded at start) 4.1 KB of 8.0 KB"
want under "$out" "zinc assets check: linux is within its budgets"

head -c 65536 /dev/urandom > "$p/assets/level1/more.bin"
out=$("$Z" assets check "$p" --target linux 2>&1); rc=$?
[ $rc -eq 1 ] || { echo "assets_check: over budget: exit $rc, expected 1"; fail=1; }
want over "$out" "over  group level1 takes 103 KB, over the ram budget of 48 KB by 55 KB (a group is loaded whole)"
want over "$out" "over  every pack together takes 107 KB, over the download budget of 100 KB by"
want over "$out" "zinc assets check: 2 budgets exceeded on linux"
want over "$out" "ok    boot: group boot"
if printf '%s\n' "$out" | grep -q "ram: largest group"; then echo "assets_check: over: an ok ram line while a group is over"; fail=1; fi

out=$("$Z" assets check "$p" --target rmpp 2>&1); rc=$?   # rmpp: the default budgets of targets/capabilities.json (ram 256 MB)
[ $rc -eq 0 ] || { echo "assets_check: default budgets: exit $rc"; printf '%s\n' "$out" | tail -5; fail=1; }
[ $fail -eq 0 ] && echo "assets_check: ok"
exit $fail
