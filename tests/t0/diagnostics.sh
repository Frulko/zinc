#!/bin/sh
# Registry: every code has a fixture, every registry example triggers its own code, docs/diagnostics.md is current,
# `zinc explain` prints entries and rejects unknown codes.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for code in $("$ZINC" explain --codes); do
  grep -qs "^$code " tests/golden/*/errors/*.expect || { echo "no fixture for $code"; fail=1; }
  "$ZINC" explain "$code" | sed '1,/^Example:/d' > "$tmp/ex.ts"
  ex=$tmp/ex.ts; grep -q '/>' "$ex" && { mv "$ex" "$tmp/ex.tsx"; ex=$tmp/ex.tsx; }   # a JSX example (Z0006, Z0007) is a .tsx file
  got=$("$ZINC" check --check "$ex" 2>&1| head -1 | sed -E 's/^[^:]*:[0-9]+:[0-9]+: error (Z[0-9]+):.*/\1/')
  [ "$got" = "$code" ] || { echo "example of $code reports '$got'"; fail=1; }
done
"$ZINC" explain --markdown | diff -q - docs/diagnostics.md >/dev/null || { echo "docs/diagnostics.md is stale: run zinc explain --markdown > docs/diagnostics.md"; fail=1; }
# zinc check --json: LSP-shaped diagnostics (uri, range.start 0-based, code, severity 1, message), exit 1 with errors and [] without
json=$("$ZINC" check --json tests/golden/checker/errors/forbidden_var.ts 2>/dev/null); rc=$?
[ $rc -eq 1 ] && printf '%s' "$json" | grep -q '"code": "Z1001"' && printf '%s' "$json" | grep -q '"line": 1, "character": 0' || { echo "check --json output is wrong: $json"; fail=1; }
[ "$("$ZINC" check --json tests/golden/checker/ok/$(ls tests/golden/checker/ok | head -1) 2>/dev/null)" = "[]" ] || { echo "check --json of a good file is not []"; fail=1; }
"$ZINC" explain Z9999 >/dev/null 2>&1 && { echo "unknown code accepted"; fail=1; }

# ZN-774.04: codes as a person types them, the list, and the registry's English kept in i18n/en/diag.json (the other languages follow it)
for c in z0103 103; do "$ZINC" explain $c | head -1 | grep -qx 'Z0103: Type is not assignable' || { echo "zinc explain $c does not print Z0103"; fail=1; }; done
"$ZINC" explain | grep -qx 'Z0103  Type is not assignable' || { echo "zinc explain with no code does not list the codes"; fail=1; }
"$ZINC" explain --catalog > "$tmp/reg.json"
python3 - "$tmp/reg.json" i18n/en/diag.json <<'EOF' || fail=1
import json, sys
reg, en = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
bad = [k for k in reg if en.get(k) != reg[k]]
for k in bad[:5]: print(f"i18n/en/diag.json: {k} is not the registry's text (include/zn/diagnostics.h): {reg[k]!r}")
sys.exit(1 if bad else 0)
EOF
# what a beginner writes first: number (not f64), no DOM, Node's and React's modules, plain JavaScript
mkdir -p "$tmp/b"
printf 'let n: number = "ten";\n' > "$tmp/b/num.ts"
printf 'document.title = "x";\nwindow.alert("hi");\n' > "$tmp/b/dom.ts"
printf 'import { readFileSync } from "fs";\nconsole.log(readFileSync);\n' > "$tmp/b/fs.ts"
printf 'import React from "react";\nconsole.log(React);\n' > "$tmp/b/react.ts"
printf 'function add(a, b) { return a + b; }\nconsole.log(add(1, 2));\n' > "$tmp/b/plain.ts"
expect() {   # expect <file> <text>: zinc check of the file prints the text
  (cd "$tmp/b" && "$ZINC" check "$1" 2>&1) | grep -qF -- "$2" || { echo "zinc check $1 does not say: $2"; (cd "$tmp/b" && "$ZINC" check "$1" 2>&1) | head -3; fail=1; }
}
expect num.ts "error Z0103: Type is not assignable: 'string' to 'number'"
expect dom.ts "'title' on 'Document': Zinc runs without a browser, so there is no DOM"
expect dom.ts "error Z0101: Cannot find name: 'window': Zinc runs without a browser"
expect fs.ts "'fs' is a module of Node.js. Zinc has \`zinc:fs\` instead."
expect react.ts "React in Zinc is \`zinc:ui/react\`"
expect plain.ts "name the file plain.js: \`zinc run plain.js\` runs it as it is."
# the five languages: the code and the machine part stay English (Zinc Atelier reads them), the title and the frequent details are translated
for l in "fr:Type non assignable:'string' vers 'number'" "es:El tipo no es asignable:'string' a 'number'" "it:Il tipo non è assegnabile:'string' a 'number'" "de:Typ nicht zuweisbar:'string' an 'number'"; do
  lang=${l%%:*} rest=${l#*:} title=${rest%%:*} detail=${rest#*:}
  (cd "$tmp/b" && ZINC_LANG=$lang "$ZINC" check num.ts 2>&1) | grep -qxF "num.ts:1:17: error Z0103: $title: $detail" || { echo "$lang: zinc check says $(cd "$tmp/b" && ZINC_LANG=$lang "$ZINC" check num.ts 2>&1 | head -1)"; fail=1; }
  ZINC_LANG=$lang "$ZINC" explain Z0103 | head -1 | grep -qxF "Z0103: $title" || { echo "$lang: zinc explain Z0103 is not translated"; fail=1; }
  "$ZINC" explain --markdown --lang "$lang" | grep -qxF "## Z0103: $title" || { echo "$lang: zinc explain --markdown --lang $lang is not translated"; fail=1; }
  ZINC_LANG=$lang "$ZINC" check --json "$tmp/b/num.ts" | grep -qF "Type is not assignable: 'string' to 'number'" || { echo "$lang: zinc check --json is not English"; fail=1; }
done
exit $fail
