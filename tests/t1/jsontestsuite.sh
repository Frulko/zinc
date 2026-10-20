#!/bin/sh
# JSON.parse against JSONTestSuite (ZN-092): every y_ file is accepted, every n_ file rejected, and the i_ (implementation defined) ones behave as recorded in
# tests/data/jsontestsuite.expected (the same answers as Node's JSON.parse). Data: nst/JSONTestSuite 1ef36fa, tests/data/jsontestsuite.tar.xz.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tar xJf tests/data/jsontestsuite.tar.xz -C "$tmp" || exit 2
"$ZINC" run tests/golden/host/jsontestsuite.ts -- "$tmp/test_parsing" > "$tmp/out" 2>&1
bad=$(awk '{p = substr($1, 1, 1); if (p == "y" && $2 == "reject") print "must accept: " $1; if (p == "n" && $2 == "accept") print "must reject: " $1}' "$tmp/out")
[ -z "$bad" ] || { echo "$bad" | head -5; exit 1; }
diff -q "$tmp/out" tests/data/jsontestsuite.expected >/dev/null || { echo "the answers differ from tests/data/jsontestsuite.expected"; diff "$tmp/out" tests/data/jsontestsuite.expected | head -5; exit 1; }
