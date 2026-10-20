#!/bin/sh
# Modules: a multi-file program (imports, aliases, re-exports, `export *`, live bindings, initialisation order) prints the
# golden output; the same program is the oracle's and the IR's input; circular imports, package imports and missing
# exports are reported with the importing file's position.
cd "$(dirname "$0")/../.." || exit 2
fail=0
"$ZINC" run tests/golden/modules/modules.ts 2>&1 | diff -q - tests/golden/modules/modules.out >/dev/null || { echo "modules output differs"; fail=1; }
"$ZINC" --emit=ir tests/golden/modules/modules.ts >/dev/null 2>&1 || { echo "modules do not lower"; fail=1; }
! tools/oracle --available || tools/oracle tests/golden/modules/modules.ts >/dev/null 2>&1 || { echo "oracle rejects the modules program"; fail=1; }
check() {  # file, expected "Zxxxx file:line:col" first diagnostic
  got=$("$ZINC" check --check "tests/golden/modules/$1" 2>&1 | head -1 | sed -E 's/^[^:]*\/([^/:]*):([0-9]+:[0-9]+): error (Z[0-9]+):.*/\3 \1:\2/')
  [ "$got" = "$2" ] || { echo "$1: got '$got', want '$2'"; fail=1; }
}
check cycle_a.ts "Z0005 cycle_b.ts:1:1"
check package.ts "Z0119 package.ts:1:1"  # a bare specifier no tsconfig.json paths entry maps (ZN-076)
check no_member.ts "Z0101 no_member.ts:1:10"
exit $fail
