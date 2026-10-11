#!/bin/sh
# zinc build --debug in lldb (ZN-371.06): the debug build of tests/data/debug_cli/main.ts runs as the normal one; lldb resolves breakpoints on
# its .ts lines to the C++ the AOT wrote (#line), in functions named after the Zinc ones (add__t2); the dSYM names the locals with their C++
# types (total: double). The session that stops and prints a local runs only where lldb may launch a process (developer mode on:
# sudo DevToolsSecurity -enable); otherwise the test says so. Skips (77) without lldb.
cd "$(dirname "$0")/../.." || exit 2
command -v lldb >/dev/null 2>&1 && command -v dwarfdump >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$ZINC" build --debug tests/data/debug_cli/main.ts -o "$tmp/app" > "$tmp/build.log" 2>&1 || { cat "$tmp/build.log"; exit 1; }
[ "$("$tmp/app" 2>&1)" = "$(printf 'zinc 6 1\ndone')" ] || { echo "the debug build prints something else: $("$tmp/app" 2>&1)"; fail=1; }
out=$(timeout 60 lldb --batch -o "b main.ts:9" -o "b main.ts:19" "$tmp/app" 2>&1)
echo "$out" | grep -q "add__t2.* at main.ts:9" || { echo "no breakpoint at main.ts:9 in add: $out"; fail=1; }
echo "$out" | grep -q "Breakpoint 2: " || { echo "no breakpoint at main.ts:19: $out"; fail=1; }
dwarfdump --debug-info "$tmp/app.dSYM" 2>/dev/null | grep -A3 'DW_AT_name.*("total")' | grep -q '"double"' || { echo "the dSYM has no local total of type double"; fail=1; }
if DevToolsSecurity -status 2>/dev/null | grep -q "enabled"; then
  out=$(timeout 120 lldb --batch -o "b main.ts:9" -o run -o "frame variable a b" -o bt -o "process kill" "$tmp/app" 2>&1)
  echo "$out" | grep -q "(double) a = 0" && echo "$out" | grep -q "(double) b = 1" || { echo "lldb did not stop in add with a = 0, b = 1: $out"; fail=1; }
  echo "$out" | grep -q "run__" || { echo "the stack has no run: $out"; fail=1; }
else
  echo "note: developer mode is off (sudo DevToolsSecurity -enable): lldb cannot launch here, the stop and the locals were not run" >&2
fi
exit $fail
