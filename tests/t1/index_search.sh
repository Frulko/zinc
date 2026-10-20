#!/bin/sh
# `zinc plugins search` (ZN-336.03): the index CI publishes, built here the same way (tools/index-repo entries from plugins/ and templates/, then build and
# sign), served from file://, refreshed through the TUF client and searched: sqlite is found as a plugin, the 3d template by a word of its description, an
# unknown word finds nothing, and a second search after a new publish sees the new version.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
python3 tools/index-repo keys "$tmp/keys.json" >/dev/null && python3 tools/index-repo entries .. "$tmp/e" 1 >/dev/null && python3 tools/index-repo build "$tmp/site/index" "$tmp/keys.json" "$tmp/e/entries.json" >/dev/null || { echo "index_search: the index was not built"; exit 1; }
export ZINC_INDEX_URL="file://$tmp/site/index" ZINC_INDEX_ROOT="$tmp/site/index/root.json" ZINC_HOME="$tmp/home"
out=$("$Z" plugins search sqlite 2>&1)
echo "$out" | grep -q "^plugin  *sqlite " || { echo "index_search: sqlite is not found: $out"; fail=1; }
out=$("$Z" plugins search orbit 2>&1)
echo "$out" | grep -q "^template  *3d " || { echo "index_search: the 3d template is not found by its description: $out"; fail=1; }
"$Z" plugins search zzznothing 2>&1 | grep -q "nothing in the index" || { echo "index_search: an unknown word finds something"; fail=1; }
[ "$("$Z" plugins search 2>/dev/null | wc -l)" -gt 30 ] || { echo "index_search: the whole index is not listed"; fail=1; }
cp "$tmp/site/index/root.json" "$tmp/root.json"   # the root the engine ships stays the published one
python3 tools/index-repo entries .. "$tmp/e" 2 >/dev/null && python3 tools/index-repo build "$tmp/site/index" "$tmp/keys.json" "$tmp/e/entries.json" "$tmp/root.json" >/dev/null
cmp -s "$tmp/root.json" "$tmp/site/index/root.json" || { echo "index_search: a publish with the engine's root changed it"; fail=1; }
"$Z" plugins search sqlite >/dev/null 2>&1 && grep -q '"version": 2' "$tmp/home/index/targets.json" || { echo "index_search: a new publish is not taken"; fail=1; }
exit $fail
