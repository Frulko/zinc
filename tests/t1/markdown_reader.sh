#!/bin/sh
# Zinc Read (ZN-844): the Markdown reader of app/markdown, headless at the tablet's size, on the fixture documents of app/markdown/fixture
# (headings, lists, a table, code, a picture, task lists, links). md4c (zinc:markdown) parses; the reader pages the document, the table
# of contents jumps to a heading's page, a link opens another .md and an anchor jumps, ticking a task writes '[x]' into the file, pen
# notes are saved per document, A+ lays out again. Then a Notion page is imported through a fake Notion API on 127.0.0.1 (two pages of
# children, nested blocks, a table, one 429 retried) and saved as Markdown in the library; a wrong token is refused. No network.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null || { echo "SKIP: needs python3"; exit 77; }
tmp=$(mktemp -d); srv=
trap '[ -n "$srv" ] && kill $srv; wait 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/docs" && cp app/markdown/fixture/*.md app/markdown/fixture/*.png "$tmp/docs/"
export ZINC_DOCS_DIR="$tmp/docs" ZINC_READ_DIR="$tmp/data" ZINC_STORAGE="$tmp/storage.kv"
app() {
  ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_SHOT="${2:-}" ZINC_READ_SCRIPT="$1" timeout 60 "$Z" run app/markdown >"$tmp/app.log" 2>&1 || { echo "the reader failed ($1):"; tail -15 "$tmp/app.log"; fail=1; }
}
expect() { grep -qF "$1" "$tmp/app.log" || { echo "expected '$1' in:"; grep '^read:' "$tmp/app.log"; fail=1; }; }

# reading: pages, contents, a task, links, ink, text size
app "library; open guide.md; pages; next; pages; prev; toc 4; pages; task 0; toc 0; link other.md; pages; back; link #tasks; pages; draw 300 400 900 500; save; font 1; pages"
expect 'read: library guide.md,other.md'
expect 'read: guide.md · '
expect 'read: heading 1 Field guide p1'
expect 'read: heading 2 Tasks p'
expect 'read: page 2 of '
expect 'read: toc Tasks -> page '
expect 'read: Task done (saved).'
expect 'read: link other.md'
expect 'read: other.md · '
expect 'read: heading 2 Notes p1'
expect 'read: link #tasks'
expect 'read: § Tasks'
expect 'read: Ink saved (1 strokes).'
expect 'read: Text 40 px · '
n=$(sed -n 's/^read: page [0-9]* of \([0-9]*\)$/\1/p' "$tmp/app.log" | head -1)
[ "${n:-0}" -ge 2 ] || { echo "the guide is not paged: $n pages"; fail=1; }
tp=$(sed -n 's/^read: heading 2 Tasks p\([0-9]*\)$/\1/p' "$tmp/app.log" | head -1)
grep -qx "read: page $tp of $n" "$tmp/app.log" || { echo "the contents did not jump to the Tasks page ($tp)"; fail=1; }
grep -qx -- '- \[x\] Charge the tablet' "$tmp/docs/guide.md" || { echo "the ticked task is not in the file:"; grep -- '- \[' "$tmp/docs/guide.md"; fail=1; }
grep -qx -- '- \[x\] Copy the documents' "$tmp/docs/guide.md" && grep -qx -- '- \[ \] Read the second chapter' "$tmp/docs/guide.md" || { echo "the other tasks changed"; fail=1; }
[ "$(grep -c '' "$tmp/docs/guide.md")" = "$(grep -c '' app/markdown/fixture/guide.md)" ] || { echo "ticking a task changed more than its mark"; fail=1; }
inkf=$(ls "$tmp/data/ink/"*.json 2>/dev/null | head -1)
grep -q '"strokes":\[{"color":"#000000"' "$inkf" 2>/dev/null || { echo "the ink file: $(head -c 300 "$inkf" 2>/dev/null)"; fail=1; }
# the ink is kept in document pixels: on page $tp, (tp - 1) view heights down
python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))["strokes"][0]["points"]
xs, ys = s[0::3], s[1::3]
assert min(xs) == 300 and max(xs) == 900 and max(ys) - min(ys) == 100 and (int(sys.argv[2]) == 1 or min(ys) > 1000), (min(xs), max(xs), min(ys), max(ys))
' "$inkf" "$tp" || fail=1

# the state comes back (zinc:storage) and the shot shows the first page (ZINC_SHOT, checked by eye)
last=$(grep '^read: page ' "$tmp/app.log" | tail -1)
app "pages"
expect 'read: guide.md · '
expect "$last"
app "open guide.md; pages" "$tmp/page1.png"
expect 'read: page 1 of '
app "open guide.md; toc 4" "$tmp/tasks.png"

# pictures: next to the document, a %-escaped path in a folder, a data: URI, an http one (fetched once into the cache, then read offline)
# and an http one that fails (its placeholder stays)
mkdir -p "$tmp/docs/sub" "$tmp/www" && cp app/markdown/fixture/figure.png "$tmp/docs/sub/my figure.png" && cp app/markdown/fixture/figure.png "$tmp/www/remote.png"
python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])' >"$tmp/port"
wport=$(cat "$tmp/port")
(cd "$tmp/www" && exec python3 -m http.server "$wport" --bind 127.0.0.1) >/dev/null 2>&1 & srv=$!
for i in $(seq 1 50); do python3 -c 'import socket, sys; socket.create_connection(("127.0.0.1", int(sys.argv[1])), 0.2)' "$wport" 2>/dev/null && break; sleep 0.1; done
printf '# Pictures\n\n![next to it](figure.png)\n\n![escaped](sub/my%%20figure.png)\n\n![inline](data:image/png;base64,%s)\n\n![remote](http://127.0.0.1:%s/remote.png)\n\n![gone](http://127.0.0.1:%s/none.png)\n' \
  "$(base64 < app/markdown/fixture/figure.png | tr -d '\n')" "$wport" "$wport" > "$tmp/docs/pictures.md"
app "open pictures.md; pictures"
expect 'read: pictures 4'
expect 'read: 1 of 2 pictures loaded'
kill $srv; wait $srv 2>/dev/null; srv=
app "open pictures.md; pictures"
expect 'read: pictures 4'
rm "$tmp/docs/pictures.md"

# Notion: a wrong token, then the page imported, then read offline
python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])' >"$tmp/port"
port=$(cat "$tmp/port")
python3 tests/t1/markdown_reader_notion.py "$port" "$tmp/notion.log" & srv=$!
for i in $(seq 1 50); do python3 -c 'import socket, sys; socket.create_connection(("127.0.0.1", int(sys.argv[1])), 0.2)' "$port" 2>/dev/null && break; sleep 0.1; done
export ZINC_NOTION_API="http://127.0.0.1:$port/v1"
url="https://www.notion.so/Reading-list-0123456789abcdef0123456789abcdef"
app "notion wrong $url; sync"
expect "read: Notion refused the token"
app "notion secret_test $url; sync; library; open notion/reading-list-01234567.md; pages"
expect 'read: Notion: 1 page saved'
expect 'read: library guide.md,notion/reading-list-01234567.md,other.md'
expect 'read: heading 1 Reading list p1'
expect 'read: heading 3 After the cursor p1'
f="$tmp/docs/notion/reading-list-01234567.md"
python3 - "$f" <<'EOF' || fail=1
import sys
md = open(sys.argv[1]).read()
want = ["# Reading list", "## Plan", "Read **this** and *that* on [the site](https://example.org) with `x*2`", "- Outer point", "  - Inner point",
        "- [ ] Buy paper", "- [x] Charge pen", "```python\nprint('hi')\nprint(2)\n```", "---", "| Name | Size |", "|---|---|", "| A4 | 210 x 297 |",
        "> Calm paper", "1. First", "2. Second", "### After the cursor"]
missing = [w for w in want if w not in md]
assert not missing, (missing, md)
EOF
grep -q 'start_cursor\|^/v1/blocks/01234567-89ab-cdef-0123-456789abcdef/children 2026-03-11 7$' "$tmp/notion.log" || { echo "the second page of children was not asked:"; cat "$tmp/notion.log"; fail=1; }
[ "$(grep -c '^/v1/blocks/b3/children' "$tmp/notion.log")" = 2 ] || { echo "the 429 was not retried"; cat "$tmp/notion.log"; fail=1; }
[ "$(stat -f %Lp "$tmp/data/read.conf" 2>/dev/null || stat -c %a "$tmp/data/read.conf")" = 600 ] || { echo "read.conf is not mode 600"; fail=1; }

[ -n "$READ_SHOTS" ] && cp "$tmp/page1.png" "$tmp/tasks.png" "$READ_SHOTS/" 2>/dev/null
[ $fail -eq 0 ] && echo "markdown reader: ok"
exit $fail
