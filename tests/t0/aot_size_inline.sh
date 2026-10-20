#!/bin/sh
# AOT code reads width() and height() from the runtime's surface size, without a call (ZN-399: the bouncing-ball update loop calls them per ball;
# the calls kept every field in memory). tests/t1/host_direct.sh checks the values against the decoded path.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "import { onFrame, rect, width, height } from 'zinc:gfx';\nonFrame(() => { for (let i = 0; i < 3; i++) rect(i, i, width() - i, height() - i, 0xffffff); });\n" > "$tmp/a.ts"
printf "import { onFrame, rect } from 'zinc:gfx';\nonFrame(() => { for (let i = 0; i < 3; i++) rect(i, i, 10 - i, 20 - i, 0xffffff); });\n" > "$tmp/b.ts"
for p in a b; do "$ZINC" --emit=cpp "$tmp/$p.ts" > "$tmp/$p.cpp" 2>&1 || { echo "emit failed: $(head -c 300 "$tmp/$p.cpp")"; exit 1; }; done
fail=0
grep -q "zrt::surf_w" "$tmp/a.cpp" && grep -q "zrt::surf_h" "$tmp/a.cpp" || { echo "width() / height() are not read inline"; fail=1; }
a=$(grep -o "hostFast\[" "$tmp/a.cpp" | wc -l | tr -d ' '); b=$(grep -o "hostFast\[" "$tmp/b.cpp" | wc -l | tr -d ' ')
[ "$a" = "$b" ] || { echo "width() / height() add $((a - b)) host calls"; fail=1; }
[ $fail -eq 0 ] && echo "aot size inline: ok"
exit $fail
