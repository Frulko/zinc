#!/bin/sh
# Zinc Web (ZN-844): the relay (app/web-relay) renders a local page in headless Chrome at the tablet's size, and the reader (app/web) drives
# it headless. Relay: a page picture is exactly the viewport, a zoomed one too, the link map has the fixture's two http links (not the mailto),
# a request without the token is refused (served with --no-token), a file:// page is refused. Reader (ZINC_WEB_SCRIPT, the buttons' actions): open, page down,
# follow a link by a tap on it, back, write with the pen, save the ink per URL (it comes back on the next run), export page + ink as PNG.
# Dashboard (TRMNL-style): on a short period (ZINC_WEB_DASH_MS) a page that changed is swapped, an unchanged one is not, the widget draws it.
# No network: the fixture is served by python3 on 127.0.0.1.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v curl >/dev/null && command -v python3 >/dev/null || { echo "SKIP: needs curl and python3"; exit 77; }
[ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || [ -n "$CHROME" ] || command -v chromium >/dev/null || command -v google-chrome >/dev/null \
  || { echo "SKIP: needs Google Chrome (or CHROME=<path>)"; exit 77; }
tmp=$(mktemp -d); web=; rel=
trap '[ -n "$rel" ] && kill $rel; [ -n "$web" ] && kill $web; wait 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
free() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
wp=$(free); rp=$(free)
cp -R app/web-relay/fixture "$tmp/site"; echo '<h1>Count 1</h1>' > "$tmp/site/dash.html"
python3 -m http.server "$wp" --bind 127.0.0.1 --directory "$tmp/site" >"$tmp/http.log" 2>&1 & web=$!
"$Z" run app/web-relay -- --port "$rp" --data "$tmp/relay" --no-open >"$tmp/relay.log" 2>&1 & rel=$!
for i in $(seq 1 100); do grep -q 'relay: token' "$tmp/relay.log" && curl -s "http://127.0.0.1:$wp/" >/dev/null && break; sleep 0.2; done
grep -q 'relay: token' "$tmp/relay.log" || { echo "the relay did not start:"; head -20 "$tmp/relay.log"; exit 1; }
token=$(cat "$tmp/relay/relay.token")
R=http://127.0.0.1:$rp
page=http://127.0.0.1:$wp/index.html
size() { python3 -c 'import struct, sys; d = open(sys.argv[1], "rb").read(24); print("%dx%d" % struct.unpack(">II", d[16:24]) if d[:8] == b"\x89PNG\r\n\x1a\n" else "not-png")' "$1"; }
get() { curl -s -H "Authorization: Bearer $token" "$@"; }

# the relay alone
j=$(get "$R/render?url=$page&w=1620&h=1800")
echo "$j" | python3 -c '
import json, sys
j = json.load(sys.stdin)
hrefs = [l[4] for l in j["links"]]
assert j["width"] == 1620 and j["page"] == 1800 and j["height"] > 3 * 1800, j
assert len(hrefs) == 2 and hrefs[0].endswith("/next.html") and hrefs[1].endswith("/next.html#end"), hrefs
x, y, w, h = j["links"][0][:4]
assert 0 < x < 200 and 100 < y < 600 and w > 100 and h > 40, j["links"][0]
' || { echo "render: $j"; fail=1; }
get -o "$tmp/p1.png" "$R/shot?url=$page&w=1620&h=1800&x=0&y=1800"
[ "$(size "$tmp/p1.png")" = 1620x1800 ] || { echo "page 2: $(size "$tmp/p1.png")"; fail=1; }
get -o "$tmp/z.png" "$R/shot?url=$page&w=1620&h=1800&x=200&y=100&cw=540&ch=600&zoom=3"
[ "$(size "$tmp/z.png")" = 1620x1800 ] || { echo "zoom 3: $(size "$tmp/z.png")"; fail=1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "$R/render?url=$page")" = 401 ] || { echo "a request without the token was not refused"; fail=1; }
[ "$(get -o /dev/null -w '%{http_code}' "$R/render?url=file:///etc/hosts")" = 502 ] || { echo "a file:// page was not refused"; fail=1; }
# reading mode (Readability): the article's link is kept, the menu, the advert and the footer are gone
art=http://127.0.0.1:$wp/article.html
links() { get "$R/render?url=$art&w=1620&h=1800&style=$1" | python3 -c 'import json, sys; print(" ".join(l[4].split("#")[1] for l in json.load(sys.stdin)["links"]))'; }
[ "$(links read)" = "article" ] || { echo "reading mode: links $(links read)"; fail=1; }
case " $(links eink) " in *" nav "*) ;; *) echo "e-ink style lost the menu: $(links eink)"; fail=1;; esac
# sending a page from the Mac: the page at /, /send (token in the query, as the bookmarklet does), /inbox once
curl -s "$R/" | grep -q 'Send to the reMarkable' || { echo "no page at /"; fail=1; }
curl -s -o /dev/null "$R/send?token=$token&url=$page"
curl -s -o /dev/null "$R/send?token=$token&url=$page%23two"
[ "$(get "$R/inbox?at=http://reading/")" = "$page" ] || { echo "the sent page is not in the inbox"; fail=1; }
[ "$(get "$R/inbox")" = "$page#two" ] || { echo "the second sent page is not next in the inbox"; fail=1; }
[ "$(get "$R/inbox")" = "" ] || { echo "the inbox was not emptied"; fail=1; }
get "$R/status" | python3 -c '
import json, sys
s = json.load(sys.stdin)
assert 0 <= s["tablet"] < 5 and s["reading"] == "" and [x["taken"] for x in s["sent"]] == [True, True] and s["sent"][0]["url"].endswith("#two"), s
' || { echo "status: $(get "$R/status")"; fail=1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' "$R/send?url=$page")" = 401 ] || { echo "a send without the token was not refused"; fail=1; }

# the reader, headless (its page view is the relay's viewport)
export ZINC_WEB_DIR="$tmp/web"
app() {
  ZINC_HEADLESS=1 ZINC_FRAMES=2000000000 ZINC_WEB_SCRIPT="$1" timeout 90 "$Z" run app/web >"$tmp/app.log" 2>&1 || { echo "the reader failed ($1):"; tail -15 "$tmp/app.log"; fail=1; }
}
expect() { grep -qF "$1" "$tmp/app.log" || { echo "expected '$1' in:"; grep '^web:' "$tmp/app.log"; fail=1; }; }
app "relay $R $token; open $page; next; next; prev; draw 500 700 1100 900; tool highlighter; draw 500 1000 1100 1000; save; link next.html; back; export; bookmark"
expect 'web: Relay fixture · 2 links'
expect 'web: tap on http://127.0.0.1:'"$wp"'/next.html'
expect 'web: Second page · 1 links'
expect 'web: Ink saved (2 strokes).'
expect 'web: Exported '
expect 'web: Bookmarked http://127.0.0.1:'"$wp"'/index.html.'
grep -qx "http://127.0.0.1:$wp/index.html" "$tmp/web/bookmarks.txt" 2>/dev/null || { echo "bookmarks.txt: $(cat "$tmp/web/bookmarks.txt" 2>/dev/null)"; fail=1; }
ex=$(ls "$tmp/web/exports/"*.png 2>/dev/null | head -1)
s=$(size "$ex" 2>/dev/null); case "$s" in 1620x*) h=${s#1620x}; [ "$h" -gt 5400 ] || { echo "the export is not the whole page: $s"; fail=1; } ;; *) echo "no export PNG: $s"; fail=1 ;; esac
inkf=$(ls "$tmp/web/ink/"*.json 2>/dev/null | head -1)
grep -q '"tool":"highlighter"' "$inkf" 2>/dev/null || { echo "the highlighter stroke has no tool: $(head -n 3 "$inkf")"; fail=1; }
grep -q '"strokes":\[{"color":"#000000"' "$inkf" 2>/dev/null || { echo "the ink file: $(cat "$inkf" 2>/dev/null | head -c 300)"; fail=1; }
grep -qx "$page" "${inkf%.json}.txt" 2>/dev/null || { echo "the ink's URL: $(cat "${inkf%.json}.txt" 2>/dev/null)"; fail=1; }
# the ink drawn on page 2 is in page pixels: one view height down, + 700..900
python3 -c '
import json, sys
s = json.load(open(sys.argv[1]))["strokes"][0]["points"]
xs, ys = s[0::3], s[1::3]
assert min(xs) == 500 and max(xs) == 1100 and min(ys) > 1200 and max(ys) - min(ys) == 200, (min(xs), max(xs), min(ys), max(ys))
' "$inkf" || fail=1
# the ink comes back with the page; a zoomed view shows it at the right place (the shot of the reader)
ZINC_SHOT="$tmp/shot.png" app "open $page; next; zoom 2"
expect 'web: Relay fixture · 2 links'
oy=$(head -n 1 "$tmp/web/tabs.txt" | cut -f1)
# tabs: a page sent from the Mac opens in a new tab, the page being read keeps its tab and its place; closing the shown tab shows the other
curl -s -o /dev/null "$R/send?token=$token&url=http://127.0.0.1:$wp/next.html"
app "inbox"
expect 'web: Second page · 1 links'
[ "$(cut -f2 "$tmp/web/tabs.txt" | tr '\n' ' ')" = "$page http://127.0.0.1:$wp/next.html " ] || { echo "tabs.txt: $(cat "$tmp/web/tabs.txt")"; fail=1; }
[ "$(head -n 1 "$tmp/web/tabs.txt" | cut -f1)" = "$oy" ] && [ "$oy" != 0 ] || { echo "the first tab lost its place ($oy): $(cat "$tmp/web/tabs.txt")"; fail=1; }
app "close 1"
expect 'web: Relay fixture · 2 links'
[ "$(wc -l < "$tmp/web/tabs.txt" | tr -d ' ')" = 1 ] || { echo "close 1: $(cat "$tmp/web/tabs.txt")"; fail=1; }
# a smaller page (more of it per screen) is rendered again, both settings are kept; the full-screen view has no tool rows
ZINC_SHOT="$tmp/full.png" app "open $page; smaller; full"
expect 'web: Page size 80 %.'
[ "$(grep -c 'web: Relay fixture · 2 links' "$tmp/app.log")" = 2 ] || { echo "the smaller page was not rendered again"; fail=1; }
grep -qx 'scale=1.6' "$tmp/web/web.conf" && grep -qx 'full=on' "$tmp/web/web.conf" || { echo "web.conf: $(cat "$tmp/web/web.conf")"; fail=1; }
[ "$(size "$tmp/shot.png")" != not-png ] || { echo "no shot of the reader"; fail=1; }

# the dashboard: render 1 is new, the page changes, render 2 (one period later) is new, render 3 is unchanged; then the widget
# (the page changes once Chrome fetched it: http.server's log is unbuffered, the app's may not be)
( for i in $(seq 1 300); do grep -q 'GET /dash.html' "$tmp/http.log" 2>/dev/null && break; sleep 0.05; done
  echo '<h1>Count 2</h1>' > "$tmp/site/dash.html" ) &
edit=$!
ZINC_WEB_DASH_MS=2500 ZINC_SHOT="$tmp/widget.png" app "relay $R $token; dash http://127.0.0.1:$wp/dash.html; ticks 3; widget"
wait $edit
expect 'web: dashboard 1: new picture'
expect 'web: dashboard 2: new picture'
expect 'web: dashboard 3: unchanged'
expect 'web: widget 810x'
grep -qx "dash=http://127.0.0.1:$wp/dash.html" "$tmp/web/web.conf" || { echo "the dashboard mode was not saved: $(grep dash "$tmp/web/web.conf")"; fail=1; }
[ "$(size "$tmp/widget.png")" != not-png ] || { echo "no shot of the widget"; fail=1; }
[ -n "$WEB_SHOTS" ] && cp "$tmp/widget.png" "$WEB_SHOTS/" 2>/dev/null
[ -n "$WEB_SHOTS" ] && cp "$tmp/shot.png" "$tmp/p1.png" "$tmp/z.png" "$ex" "$WEB_SHOTS/" 2>/dev/null

kill $rel; wait $rel 2>/dev/null; rel=
for i in $(seq 1 25); do pgrep -f "user-data-dir=$tmp/relay/chrome-profile" >/dev/null || break; sleep 0.2; done   # the relay stops its Chrome
pgrep -f "user-data-dir=$tmp/relay/chrome-profile" >/dev/null && { echo "Chrome was left running"; pkill -f "user-data-dir=$tmp/relay/chrome-profile"; fail=1; }
# --no-token (a test on a trusted network): a request without the token is served
"$Z" run app/web-relay -- --port "$rp" --data "$tmp/open" --no-token --no-open >"$tmp/open.log" 2>&1 & rel=$!
for i in $(seq 1 100); do grep -q 'relay: no token' "$tmp/open.log" && break; sleep 0.2; done
[ "$(curl -s -o /dev/null -w '%{http_code}' "$R/nope")" = 404 ] || { echo "--no-token still asks for a token: $(tail -3 "$tmp/open.log")"; fail=1; }
[ -e "$tmp/open/relay.token" ] && { echo "--no-token wrote a token"; fail=1; }
kill $rel; wait $rel 2>/dev/null; rel=
# a relay on a server: --block-private refuses the local network (and its disguises), serves the rest; https with --tls-cert/--tls-key
openssl req -x509 -newkey rsa:2048 -nodes -subj /CN=localhost -days 1 -keyout "$tmp/key.pem" -out "$tmp/cert.pem" >/dev/null 2>&1
"$Z" run app/web-relay -- --port "$rp" --data "$tmp/srv" --no-token --no-open --block-private --tls-cert "$tmp/cert.pem" --tls-key "$tmp/key.pem" >"$tmp/srv.log" 2>&1 & rel=$!
for i in $(seq 1 100); do grep -q 'relay: no token' "$tmp/srv.log" && break; sleep 0.2; done
S=https://127.0.0.1:$rp
code() { curl -sk -o /dev/null -w '%{http_code}' "$S/send?url=$1"; }
for u in http://192.168.1.1/ http://10.0.0.2/x http://172.20.0.1/ http://localhost:8080/ http://nas.local/ http://0x7f.1/ http://2130706433/ \
         http://0177.0.0.1/ 'http://[::1]/' http://user@127.0.0.1/ http://100.100.1.1/ http://router/; do
  [ "$(code "$u")" = 403 ] || { echo "--block-private let $u through: $(code "$u")"; fail=1; }
done
for u in https://example.com/ http://172.32.0.1/ http://8.8.8.8/; do [ "$(code "$u")" = 200 ] || { echo "--block-private refused $u"; fail=1; }; done
[ "$(curl -sk -o /dev/null -w '%{http_code}' "$S/render?url=$page")" = 502 ] || { echo "--block-private rendered a page of 127.0.0.1"; fail=1; }
kill $rel; wait $rel 2>/dev/null; rel=
[ $fail -eq 0 ] && echo "web relay: ok"
exit $fail
