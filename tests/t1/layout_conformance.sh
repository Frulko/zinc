#!/bin/sh
# Layout conformance (ZN-289, LE-10): Yoga v3.2.1's 548 generated cases (tests/golden/layout-conformance/cases.json, tools/layout-fixtures) run on zinc:ui in
# both engines. rn must pass every case zinc:ui can express (tolerance 0); classic must keep every case of its baseline (classic.pass; the others are
# classic.known-fail). A case that starts passing is reported so the baseline can grow. The matrix: tools/layout-fixtures --report <rn> <classic>.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
g=tests/golden/layout-conformance
export ZINC_HEADLESS=1
fail=0
for e in rn classic; do ZINC_UI_LAYOUT=$e "$ZINC" run $g/main.ts > "$tmp/$e" 2>&1; done
grep '^FAIL' "$tmp/rn" | head -5 | while read -r l; do echo "rn: $l"; done
[ "$(grep -c '^FAIL' "$tmp/rn")" = 0 ] || fail=1
[ "$(grep -c '^PASS' "$tmp/rn")" = "$(wc -l < $g/rn.pass | tr -d ' ')" ] || { echo "rn: $(grep -c '^PASS' "$tmp/rn") cases pass, $(wc -l < $g/rn.pass | tr -d ' ') expected"; fail=1; }
grep '^PASS' "$tmp/classic" | cut -d' ' -f2 | sort > "$tmp/classic.now"
lost=$(sort $g/classic.pass | comm -23 - "$tmp/classic.now")
[ -z "$lost" ] || { echo "classic regressed: $(echo "$lost" | head -5 | tr '\n' ' ')"; fail=1; }
won=$(sort $g/classic.pass | comm -13 - "$tmp/classic.now")
[ -z "$won" ] || echo "classic passes more cases now (update classic.pass): $(echo "$won" | head -5 | tr '\n' ' ')"
[ $fail -eq 0 ] && echo "layout conformance: ok (rn $(grep -c '^PASS' "$tmp/rn"), classic $(grep -c '^PASS' "$tmp/classic"), skipped $(grep -c '^SKIP' "$tmp/rn"))"
exit $fail
