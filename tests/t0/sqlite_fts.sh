#!/bin/sh
# zinc:sqlite is built with FTS5 (plugins/sqlite/plugin.json): a full-text table, MATCH with a prefix, ranked, and its snippet().
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run tests/data/sqlite/fts.ts 2>&1 | grep '\.md ')
want='a.md Ship the [editor] before the summer
b.md A book about [editors] and summers'
[ "$out" = "$want" ] || { echo "sqlite_fts: $(echo "$out" | head -3 | tr '\n' ' ')"; exit 1; }
