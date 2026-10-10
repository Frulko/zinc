#!/bin/sh
# zinc debug --dap (ZN-371.02): tests/dap_check.py plays VS Code: a breakpoint, the stack, scopes and locals (a Point and an array unfolded),
# evaluate, step into, over and out, the program's output as output events; a program that does not compile fails its launch with the
# diagnostic; a running loop stops at the pause button. Skips (77) without python3.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || exit 77
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
python3 tests/dap_check.py "$ZINC" tests/data/debug_cli/main.ts > "$tmp/main.log" 2>&1 || { grep -v "^ok" "$tmp/main.log"; fail=1; }
printf 'let x: number = "a";\nconsole.log(x);\n' > "$tmp/bad.ts"
python3 tests/dap_check.py "$ZINC" "$tmp/bad.ts" --bad > "$tmp/bad.log" 2>&1 || { grep -v "^ok" "$tmp/bad.log"; fail=1; }
python3 tests/dap_check.py "$ZINC" tests/data/debug_cli/loop.ts --pause > "$tmp/pause.log" 2>&1 || { grep -v "^ok" "$tmp/pause.log"; fail=1; }
exit $fail
