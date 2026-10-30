#!/bin/sh
# The Storage panel of the Zinc Inspector against tests/data/inspector-storage (zinc:devtools on a free port, a fresh store): in a dev run
# (ZINC_DEV=1) the stores listed, the AsyncStorage grid (sorted, filtered), values as JSON trees (one folded), a cell edited in place and
# a row deleted (each change seen back as a DOMStorage event), the program's own writes followed live; its in-memory SQLite tables: columns,
# typed cells (numbers, NULL, a blob), sort, filter and pages in SQL, the schema with its index, a query, a write refused by the read-only
# mode and run once confirmed. The same program not in a dev run: the edits refused, no database shown.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
set -- $(python3 tests/free_ports.py 2); port=$1; port2=$2
run() {   # run <port> <ZINC_DEV>: the target, then the inspector's Storage dump in $tmp/dump
  ZINC_DEV=$2 ZINC_STORAGE="$tmp/store-$1" ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$1 timeout 120 "$ZINC" run tests/data/inspector-storage > "$tmp/target.log" 2>&1 & target=$!
  n=0; while [ $n -lt $((1200 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done   # the first run builds the sqlite plugin
  grep -q "localhost:$1)" "$tmp/target.log" || { echo "the target does not listen on $1: $(cat "$tmp/target.log")"; exit 1; }
  sleep 0.5
  ZINC_INSPECTOR_DUMP=storage ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$1" > "$tmp/dump" 2>&1 ||
    { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
  kill $target 2>/dev/null
}
fail=0
want() { grep -qF -- "$1" "$tmp/dump" || { echo "missing in the Storage panel: $1"; fail=1; }; }
run $port 1
want "storage: $tmp/store-$port"
want 'stores: zinc:storage 0 | AsyncStorage 3 | :memory: covers songs'
want 'columns: Key | Value'
want '  theme | {"mode":"dark","accent":"rose"}'
want 'sorted desc: weather.place theme count'
want 'filtered: theme | {"mode":"dark","accent":"rose"}'
want '    accent: "rose"'
want 'folded weather.place: ▼ {name: "Paris", coords: {…}, tags: […]} /   name: "Paris" /   ▼ coords: {lat: 48.85, lon: 2.35} /     lat: 48.85 /     lon: 2.35 /   ▶ tags: Array(2)'
want 'edit: theme = {"mode":"light"}'
want 'delete: gone true'
want 'live: count'
want 'table: id | title | plays | rows 1–50 of 120 | 1 | Song 1 | 3'
want 'aligned: right left right'
want 'sorted: 120 | Song 120 | 360'
want 'filtered: rows 1–11 of 11'
want 'page 2: rows 51–100 of 120'
want 'schema: CREATE TABLE songs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, plays INTEGER); CREATE INDEX songs_plays ON songs (plays);'
want 'covers: 1 | <blob 18 B> 89504e470d0a1a0a0000000d49484452… | NULL | kinds num blob null'
want 'query: n = 120'
want 'read-only: attempt to write a readonly database'
want 'write: 120 rows changed'
[ $fail -eq 0 ] || cat "$tmp/dump"
f0=$fail
run $port2 0
want 'edit: refused'
want 'delete: refused'
want 'sqlite: none'
[ $fail -eq $f0 ] || cat "$tmp/dump"
exit $fail
