#!/bin/sh
# zinc check and zinc lint of a program on a JavaScript engine (ZN-793): the QuickJS loader checks it, not the typed checker. A zinc.json
# "engine": "quickjs" project whose TypeScript imports a node_modules package checks clean (no Z0119); a plain JavaScript web example checks and
# lints clean; a syntax error is an error with its place; what QuickJS-ng lacks (Temporal) is a lint warning.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/pkg/src" "$tmp/pkg/node_modules/greet" "$tmp/bad" "$tmp/warn"
printf '{ "name": "pkg", "entry": "src/main.ts", "engine": "quickjs" }\n' > "$tmp/pkg/zinc.json"
printf "import { greet } from 'greet';\nconst who: string = 'zinc';\nconsole.log(greet(who));\n" > "$tmp/pkg/src/main.ts"
printf '{ "name": "greet", "version": "1.0.0", "type": "module", "main": "index.js" }\n' > "$tmp/pkg/node_modules/greet/package.json"
printf "export function greet(name) { return 'hello ' + name; }\n" > "$tmp/pkg/node_modules/greet/index.js"
printf 'const a = 1;\nconst b = ;\n' > "$tmp/bad/main.js"
printf 'const now = Temporal.Now.instant();\nconsole.log(String(now));\n' > "$tmp/warn/main.js"

out=$(timeout 60 "$ZINC" check "$tmp/pkg" 2>&1) || { echo "quickjs project with a package: $out"; fail=1; }
echo "$out" | grep -q Z0119 && { echo "quickjs project: the typed checker ran: $out"; fail=1; }
out=$(timeout 60 "$ZINC" check examples/js-gsap 2>&1) && echo "$out" | grep -q 'for QuickJS' || { echo "js-gsap check: $out"; fail=1; }
out=$(timeout 60 "$ZINC" lint examples/js-gsap 2>&1) || { echo "js-gsap lint: $out"; fail=1; }
out=$(timeout 60 "$ZINC" check "$tmp/bad/main.js" 2>&1) && { echo "a syntax error checks clean"; fail=1; }
echo "$out" | grep -q 'main.js:2:11' || { echo "check of a syntax error: $out"; fail=1; }
out=$(timeout 60 "$ZINC" lint "$tmp/bad/main.js" 2>&1) && { echo "a syntax error lints clean"; fail=1; }
echo "$out" | grep -q 'main.js:2:11: error compile: SyntaxError' || { echo "lint of a syntax error: $out"; fail=1; }
out=$(timeout 60 "$ZINC" lint "$tmp/warn/main.js" 2>&1) || { echo "a warning fails the lint: $out"; fail=1; }
echo "$out" | grep -q 'main.js:1:13: warning quickjs: Q0001: Temporal' || { echo "lint of Temporal: $out"; fail=1; }
exit $fail
