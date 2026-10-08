#!/bin/sh
# The AOT links the layout engine only for the rn mode (ZN-355): a small zinc:ui program built in classic has no Yoga symbol, the same program built with
# ZINC_UI_LAYOUT=rn has them (examples/hero: 20,161,056 bytes in classic, 20,297,208 in rn, 2026-10-08). About 50 s: a milestone test.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "import { render } from 'zinc:ui/solid';\nfunction App(): i32 { return <view style={{ padding: 8 }}><text>hi</text></view>; }\nrender(App, 0xffffff, null);\n" > "$tmp/small.tsx"
fail=0
"$ZINC" build "$tmp/small.tsx" -o "$tmp/classic" >/dev/null 2>&1 || { echo "classic build failed"; exit 1; }
ZINC_UI_LAYOUT=rn "$ZINC" build "$tmp/small.tsx" -o "$tmp/rn" >/dev/null 2>&1 || { echo "rn build failed"; exit 1; }
[ "$(nm "$tmp/classic" | grep -c 'YG')" = 0 ] || { echo "a classic build links Yoga"; fail=1; }
[ "$(nm "$tmp/rn" | grep -c 'YG')" -gt 0 ] || { echo "an rn build has no Yoga"; fail=1; }
[ $fail -eq 0 ] && echo "aot layout link: ok ($(wc -c < "$tmp/classic" | tr -d ' ') bytes classic, $(wc -c < "$tmp/rn" | tr -d ' ') rn)"
exit $fail
