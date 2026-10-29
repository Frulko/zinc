#!/bin/sh
# zinc doc (src/doc, ZN-856): the site of tests/data/doc/starfield (a project with Markdown and MDX pages, a theme.css and a plugin of its
# own that adds pages, a screenshot and a native spec; it imports zinc:sqlite, whose engine docs come along), of that plugin alone, and of
# the engine itself (--std: its guides, the standard library, every plugin). Each is checked by tests/data/doc/check_site.py: static
# (nothing loaded from a network or from localhost), every link and anchor of the site resolves, no MDX component left, a search index.
# Then the content (MDX rendered, the API with doc comments and without private members, the spec's records, ApiRef links, the theme
# override), the refusal to write over a folder zinc doc did not make, and --serve on a free port: the pages, the version that changes when
# a source is saved. The server is stopped at the end.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d)
pid=
trap '[ -n "$pid" ] && kill "$pid" 2>/dev/null; rm -rf "$tmp"' EXIT
no() { echo "$1"; fail=1; }

"$ZINC" doc tests/data/doc/starfield --out "$tmp/site" >"$tmp/out" 2>&1 || no "fixture: exit $?: $(cat "$tmp/out")"
grep -q "^zinc doc: 9 pages, .* 2 plugins" "$tmp/out" || no "fixture summary: $(head -1 "$tmp/out")"
python3 tests/data/doc/check_site.py "$tmp/site" --anchors >"$tmp/check" || no "fixture site: $(cat "$tmp/check")"
for f in index.html guide/01-getting-started.html guide/02-notes.html api/src-world.html plugins/blink/index.html plugins/blink/01-wiring.html \
         plugins/blink/api.html plugins/sqlite/index.html plugins/sqlite/api.html assets/docs/img/game.png assets/plugins/blink/docs/img/board.png \
         _zdoc/style.css _zdoc/doc.js _zdoc/search-index.js _zdoc/theme.css; do
  [ -f "$tmp/site/$f" ] || no "no $f"
done
s=$tmp/site
has() { grep -q -- "$2" "$s/$1" || no "$1 lacks $2"; }
lacks() { grep -q -- "$2" "$s/$1" && no "$1 has $2"; }
has guide/01-getting-started.html 'class="steps"'
has guide/01-getting-started.html '<p class="step-title">Run the game</p>'
has guide/01-getting-started.html 'class="tab" data-label="Linux"'
has guide/01-getting-started.html 'class="callout callout-tip"><p class="callout-title">Fast refresh'
has guide/01-getting-started.html 'code-block command'
has guide/01-getting-started.html '<span class="pr">$ </span><span class="f">zinc</span> doctor'
has guide/01-getting-started.html 'src="../assets/docs/img/game.png" alt="The game running" width="960" height="544"'
has guide/01-getting-started.html 'href="../api/src-world.html#World"><code>World</code>'
has guide/01-getting-started.html '<span class="k">import</span>'
has guide/01-getting-started.html 'href="../guide/02-notes.html#limits"'
has guide/02-notes.html 'class="callout callout-warning"'
has guide/02-notes.html 'href="../plugins/blink/01-wiring.html"'
has guide/02-notes.html 'type="checkbox" disabled checked'
has index.html 'class="card"'
has index.html 'Collect the stars before they drift away'
has index.html '_zdoc/theme.css'
has plugins/blink/01-wiring.html 'class="example"'
has plugins/blink/01-wiring.html 'href="../../plugins/blink/api.html#Blinker"'
has plugins/blink/index.html 'zinc:blink'
has api/src-world.html 'id="World.step"'
has api/src-world.html '<strong>Parameters</strong>'
has api/src-world.html 'The game world.'
has api/src-world.html 'id="STARS"'
has api/src-world.html 'readonly</span> width'
lacks api/src-world.html 'id="World.stars"'
lacks api/src-world.html 'id="hidden"'
has plugins/blink/api.html 'Native interface'
has plugins/blink/api.html 'id="PinInfo"'
has plugins/blink/api.html 'id="Spec.open"'
has plugins/blink/api.html 'href="#BlinkOptions"'
has plugins/sqlite/api.html 'id="Database"'
has _zdoc/search-index.js '"t":"World","u":"api/src-world.html#World"'
has _zdoc/search-index.js '"t":"Wiring the LED"'

# a plugin alone: its overview is the home page
"$ZINC" doc tests/data/doc/starfield/plugins/blink --out "$tmp/blink" >"$tmp/out" 2>&1 || no "plugin alone: exit $?: $(cat "$tmp/out")"
python3 tests/data/doc/check_site.py "$tmp/blink" --anchors >"$tmp/check" || no "plugin site: $(cat "$tmp/check")"
grep -q '<h1>Blink</h1>' "$tmp/blink/index.html" && [ -f "$tmp/blink/api.html" ] && [ -f "$tmp/blink/01-wiring.html" ] || no "plugin alone: not its pages"

# the engine: guides, the standard library, every plugin
"$ZINC" doc --std --out "$tmp/std" >"$tmp/out" 2>&1 || no "--std: exit $?: $(tail -3 "$tmp/out")"
python3 tests/data/doc/check_site.py "$tmp/std" --anchors >"$tmp/check" || no "--std site: $(cat "$tmp/check")"
for f in api/ui.html api/gfx.html api/sys.html plugins/sqlite/api.html plugins/markdown/index.html plugins/three/index.html guide/01-getting-started.html; do
  [ -f "$tmp/std/$f" ] || no "--std: no $f"
done

# never over a folder it did not make
mkdir -p "$tmp/mine" && echo keep >"$tmp/mine/notes.txt"
"$ZINC" doc tests/data/doc/starfield --out "$tmp/mine" >/dev/null 2>&1 && no "wrote into a folder zinc doc did not make"
[ -f "$tmp/mine/notes.txt" ] || no "a file of someone else's folder is gone"

# --serve: a free port, the pages, a rebuild when a source changes
cp -R tests/data/doc/starfield "$tmp/proj"
"$ZINC" doc "$tmp/proj" --serve --port 0 --out "$tmp/served" >"$tmp/serve.out" 2>&1 &
pid=$!
url=
for _ in $(seq 1 50); do url=$(grep -o 'http://127.0.0.1:[0-9]*/' "$tmp/serve.out" | head -1); [ -n "$url" ] && break; sleep 0.1; done
if [ -z "$url" ]; then no "--serve printed no URL: $(cat "$tmp/serve.out")"
else
  curl -sf "${url}guide/01-getting-started.html" | grep -q 'class="steps"' || no "--serve: no page"
  curl -sf "${url}" | grep -q '<title>Starfield</title>' || no "--serve: no index for /"
  curl -s -o /dev/null -w '%{http_code}' "${url}missing.html" | grep -q 404 || no "--serve: a missing page is not a 404"
  curl -s -o /dev/null -w '%{http_code}' "${url}../../etc/passwd" | grep -q '40[04]' || no "--serve: answers outside its folder"
  v1=$(curl -sf "${url}__zdoc/version")
  sleep 1.1   # a new modification time on any file system
  printf '\nA line added while served.\n' >>"$tmp/proj/docs/02-notes.md"
  v2=$v1
  for _ in $(seq 1 40); do v2=$(curl -sf "${url}__zdoc/version"); [ "$v2" != "$v1" ] && break; sleep 0.1; done
  [ "$v2" != "$v1" ] || no "--serve: no rebuild after a change (version $v1)"
  curl -sf "${url}guide/02-notes.html" | grep -q 'A line added while served' || no "--serve: the rebuilt page is not served"
fi
kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; pid=
exit $fail
