#!/bin/sh
# zinc run names the plugins a program imports (ZN-710): `zinc: plugins: gestures, ink` on stderr where the build steps go (ZINC_STEPS=1 here,
# stderr is not a terminal), under the interpreter, from the cached program and under QuickJS; nothing for a program without plugins, under -q,
# with JSON logs or when stderr is a pipe without ZINC_STEPS.
cd "$(dirname "$0")/../.." || exit 2
fail=0
p=tests/data/plugins_line
line="zinc: plugins: gestures, ink"
has() { echo "$2" | grep -qxF "$line" || { echo "$1: no '$line' in: $2"; fail=1; }; }
hasnt() { echo "$2" | grep -q "plugins:" && { echo "$1: unexpected plugins line in: $2"; fail=1; }; }
has interpreter "$(ZINC_STEPS=1 ZINC_NO_CACHE=1 "$ZINC" run --interp $p 2>&1)"
ZINC_STEPS=1 "$ZINC" run --interp $p >/dev/null 2>&1
has "cached program" "$(ZINC_STEPS=1 "$ZINC" run --interp $p 2>&1)"
has quickjs "$(ZINC_STEPS=1 "$ZINC" run $p --engine quickjs 2>&1)"
hasnt "no plugins" "$(ZINC_STEPS=1 "$ZINC" run --interp $p/none.ts 2>&1)"
hasnt "-q" "$(ZINC_STEPS=1 "$ZINC" run -q --interp $p 2>&1)"
hasnt "json logs" "$(ZINC_STEPS=1 ZINC_LOG_FORMAT=json "$ZINC" run --interp $p 2>&1)"
hasnt "a pipe" "$("$ZINC" run --interp $p 2>&1)"
exit $fail
