#!/bin/sh
# Windows, first step (ZN-714): `zinc build --target x86_64-windows` (and its alias windows-x86_64) links a console program with the pinned zig, the result is a
# PE executable for x86-64, and a program that opens a window is refused with a message instead of a wall of compiler errors. Nothing runs here: no Windows,
# no Wine; the CI job windows-console runs the programs (tools/windows-cross check). Skipped (77) when the pinned zig is not installed: no download in a test.
cd "$(dirname "$0")/../.." || exit 2
[ -n "$ZINC_ZIG" ] || ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig >/dev/null 2>&1 || { echo "cross_windows: the pinned zig is not installed (zinc toolchain install)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
ZINC="$ZINC" tools/windows-cross build "$tmp" library || fail=1
if [ -f "$tmp/library.exe" ]; then
  file "$tmp/library.exe" | grep -q "PE32+ executable.*x86-64" || { echo "cross_windows: not a PE32+ x86-64 executable: $(file "$tmp/library.exe")"; fail=1; }
  cmp -s "$tmp/library.out" tests/golden/run/library.out || { echo "cross_windows: the frozen output is not beside the program"; fail=1; }
fi
"$ZINC" build --target windows-x86_64 tests/golden/run/records.ts -o "$tmp/alias.exe" >"$tmp/log" 2>&1 && [ -f "$tmp/alias.exe" ] || { echo "cross_windows: the name windows-x86_64 is not accepted: $(tail -3 "$tmp/log")"; fail=1; }
"$ZINC" build --target x86_64-windows examples/hero/src/main.tsx -o "$tmp/hero.exe" >"$tmp/log" 2>&1 && { echo "cross_windows: a program with a window builds?"; fail=1; }
grep -q "console programs only" "$tmp/log" || { echo "cross_windows: no clear message for a program with a window: $(head -3 "$tmp/log")"; fail=1; }
[ $fail -eq 0 ] && echo "cross windows: ok"
exit $fail
