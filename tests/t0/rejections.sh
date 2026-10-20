#!/bin/sh
# An unhandled promise rejection is an uncaught error once the microtasks have drained: message on stderr, exit code 101 (ZN-058).
# A rejection that is awaited inside try/catch is not.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "async function f(): Promise<void> { throw new Error('boom'); }\nf();\nconsole.log('after');\n" > "$tmp/u.ts"
out=$("$ZINC" run "$tmp/u.ts" 2>&1); rc=$?
[ $rc -eq 101 ] && echo "$out" | grep -q "Uncaught Error: boom" && echo "$out" | grep -q "after" || { echo "an unhandled rejection does not end with 101 and the message: rc=$rc $out"; fail=1; }
printf "async function f(): Promise<void> { throw new Error('boom'); }\nasync function main(): Promise<void> {\n  try { await f(); } catch (e) { console.log('caught'); }\n}\nmain();\n" > "$tmp/h.ts"
"$ZINC" run "$tmp/h.ts" >/dev/null 2>&1 || { echo "a rejection caught by try/catch ends the program with an error"; fail=1; }
exit $fail
