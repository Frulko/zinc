#!/bin/sh
# The notes app's record mode (ZN-931): NOTES_RECORD_DEMO=1 writes four scripted samples through the live pen path in the headless
# emulator; the writer's file holds them with their class names, and tools/ink-train/make-dataset --real takes the file in.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/cwd" "$tmp/real"
(cd "$tmp/cwd" && NOTES_DIR="$tmp/cwd/notes-data" NOTES_RECORD=tester NOTES_RECORD_DEMO=1 ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=400 timeout 120 "$ZINC" run "$root/examples/remarkable/notes") >"$tmp/out" 2>"$tmp/err" \
  || { echo "the app failed:"; tail -10 "$tmp/err"; exit 1; }
f="$tmp/cwd/notes-data/ink-tester.json"
[ -f "$f" ] || { echo "no $f"; ls -R "$tmp/cwd" | head; exit 1; }
python3 - "$f" <<'PY' || exit 1
import json, sys
d = json.load(open(sys.argv[1]))
assert d['writer'] == 'tester'
assert [s['c'] for s in d['samples']] == ['A', 'circle', 'x', 'V'], [s['c'] for s in d['samples']]
assert all(s['s'] and all(len(p) >= 8 and len(p) % 2 == 0 for p in s['s']) for s in d['samples'])
PY
cp "$f" "$tmp/real/"
tools/ink-train/make-dataset --out "$tmp/set.json" --real "$tmp/real" --writers 2 --test 1 --per 1 >/dev/null || { echo "make-dataset --real failed"; exit 1; }
grep -q '"id":"tester"' "$tmp/set.json" || { echo "the recorded writer is not in the set"; exit 1; }
echo ok
