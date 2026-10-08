#!/bin/sh
# Object styles with string values decided at run time (ZN-362): tests/golden/style-dynamic switches enum keys, colour keys and a numeric fontWeight through
# conditionals between literals; a string decided elsewhere is a clear build error.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=5 "$ZINC" run tests/golden/style-dynamic 2>&1)
[ "$out" = "$(cat tests/golden/style-dynamic/main.out)" ] || { echo "style dynamic: $(echo "$out" | diff - tests/golden/style-dynamic/main.out | head -4)"; fail=1; }
printf '{ "name": "t", "entry": "main.tsx" }\n' > "$tmp/zinc.json"
printf "import { render } from 'zinc:ui/solid';\nconst a: string = 'center';\nfunction App(): i32 { return <view style={{ alignItems: a }} />; }\nrender(App, 0, (dt: number) => {});\n" > "$tmp/main.tsx"
"$ZINC" run "$tmp" 2>&1 | grep -q "'alignItems' takes a literal or a conditional between literals" || { echo "a run-time string for an enum key is not refused clearly"; fail=1; }
[ $fail -eq 0 ] && echo "style dynamic: ok"
exit $fail
