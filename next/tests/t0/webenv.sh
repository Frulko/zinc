#!/bin/sh
# The web environment of the QuickJS engine (ZN-568, lib/std/webenv.js): off unless the program asks (ZINC_WEB=1 or "web" in zinc.json; ZINC_WEB=0
# wins over the project); then the window is the global object, the document has a tree with the simple selectors, events run their capture, target
# and bubble phases up to the document and the window, an unhandled rejection is the window's `unhandledrejection` event (ZN-566: a prevented one
# is silent, the program goes on), the size and the pixel scale are the surface's, and ZINC_WEB=trace names a member a library misses.
# requestAnimationFrame runs on the engine's frame loop and the host's input reaches the listeners where libraries put them.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
web() { mode=$1; shift; env ZINC_HEADLESS=1 ZINC_WEB="$mode" "$@" "$ZINC" run "$file" --engine quickjs; }   # web <ZINC_WEB or ''> [VAR=value...] on $file

file=tests/golden/webenv/dom.js
web 1 > "$tmp/dom.out" 2> "$tmp/dom.err" || { echo "webenv: dom.js failed: $(head -c 300 "$tmp/dom.err")"; fail=1; }
diff "$tmp/dom.out" tests/golden/webenv/dom.out > "$tmp/dom.diff" || { echo "webenv: dom.js differs from tests/golden/webenv/dom.out:"; head -20 "$tmp/dom.diff"; fail=1; }
grep -q "^Uncaught (in promise) Error: loud" "$tmp/dom.err" || { echo "webenv: an unhandled rejection no listener prevented is not printed"; fail=1; }
grep -q "quiet" "$tmp/dom.err" && { echo "webenv: a rejection whose event was prevented is printed"; fail=1; }

# requestAnimationFrame on the frame loop (a deterministic run steps the clock by 1/60 s) and a scripted pointer drag, wheel, keys and touch as DOM events
file=tests/golden/webenv/frames.js
web 1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=10 ZINC_INPUT=tests/golden/webenv/frames.input > "$tmp/frames.out" 2>&1 || { echo "webenv: frames.js failed"; fail=1; }
diff "$tmp/frames.out" tests/golden/webenv/frames.out > "$tmp/frames.diff" || { echo "webenv: frames.js differs from tests/golden/webenv/frames.out:"; head -20 "$tmp/frames.diff"; fail=1; }

# URL, Blob, fetch, XMLHttpRequest and script elements over files, data: and blob: URLs; localStorage is kept between two runs
file=tests/golden/webenv/net.js
web 1 ZINC_STORAGE="$tmp/storage.json" > "$tmp/net.out" 2>&1 || { echo "webenv: net.js failed"; fail=1; }
diff "$tmp/net.out" tests/golden/webenv/net.out > "$tmp/net.diff" || { echo "webenv: net.js differs from tests/golden/webenv/net.out:"; head -20 "$tmp/net.diff"; fail=1; }
printf "const n = +(localStorage.getItem('runs') || 0) + 1; localStorage.setItem('runs', n); console.log('run', n, localStorage.length, sessionStorage.length);\n" > "$tmp/kept.js"
file="$tmp/kept.js"
[ "$(web 1 ZINC_STORAGE="$tmp/kept.json" 2>&1; web 1 ZINC_STORAGE="$tmp/kept.json" 2>&1)" = "run 1 1 0
run 2 1 0" ] || { echo "webenv: localStorage is not kept from one run to the next"; fail=1; }
# image elements (ZN-569): a src loaded and decoded by the engine's codec with a browser's order of events, each format's size, data: and
# blob: URLs, what is not a picture; a picture larger than the environment decodes is refused from its header, by name; no
# createImageBitmap while there is no Worker
file=tests/golden/webenv/image.js
web 1 > "$tmp/image.out" 2> "$tmp/image.err" || { echo "webenv: image.js failed: $(head -c 300 "$tmp/image.err")"; fail=1; }
diff "$tmp/image.out" tests/golden/webenv/image.out > "$tmp/image.diff" || { echo "webenv: image.js differs from tests/golden/webenv/image.out:"; head -20 "$tmp/image.diff"; fail=1; }
grep -q "^zinc: an image of 9000 x 9000 pixels is larger than" "$tmp/image.err" || { echo "webenv: a picture over the pixel bound is not refused by name: $(head -c 200 "$tmp/image.err")"; fail=1; }
# the same over the host's network: a server of the assets on a loopback port the system picks
if command -v python3 >/dev/null 2>&1; then
  python3 -c 'import http.server, socketserver, sys, os
os.chdir(sys.argv[1])
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
with socketserver.TCPServer(("127.0.0.1", 0), Quiet) as s:
    open(sys.argv[2], "w").write(str(s.server_address[1])); s.serve_forever()' tests/golden/webenv/assets "$tmp/port" &
  server=$!
  i=0; while [ ! -s "$tmp/port" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
  file=tests/golden/webenv/http.js
  [ "$(web 1 WEBENV_HTTP="http://127.0.0.1:$(cat "$tmp/port")" 2>&1)" = "$(cat tests/golden/webenv/http.out)" ] || { echo "webenv: http.js differs from tests/golden/webenv/http.out: $(web 1 WEBENV_HTTP="http://127.0.0.1:$(cat "$tmp/port")" 2>&1 | head -8)"; fail=1; }
  kill $server 2>/dev/null; wait $server 2>/dev/null
fi

printf "console.log(typeof window, typeof document === 'undefined' || typeof document.body, typeof navigator, typeof addEventListener);\n" > "$tmp/off.js"
file="$tmp/off.js"
[ "$(web '' 2>&1)" = "undefined undefined undefined undefined" ] || { echo "webenv: a program that does not ask gets a window: $(web '' 2>&1)"; fail=1; }
mkdir -p "$tmp/app/src"
printf '{ "name": "app", "entry": "src/main.js", "web": true }\n' > "$tmp/app/zinc.json"
printf "console.log(typeof window, location.pathname.endsWith('/app/index.html'));\n" > "$tmp/app/src/main.js"
file="$tmp/app"
[ "$(web '' 2>&1)" = "object true" ] || { echo "webenv: \"web\" in zinc.json does not start the environment at the project's directory: $(web '' 2>&1)"; fail=1; }
web 0 2>&1 | grep -q "location is not defined" || { echo "webenv: ZINC_WEB=0 does not turn a project's environment off"; fail=1; }

printf "console.log(innerWidth, innerHeight, devicePixelRatio, document.body.clientWidth, screen.height);\n" > "$tmp/size.js"
file="$tmp/size.js"
[ "$(web 1 ZINC_SIZE=800x600 ZINC_SCALE=2 2>&1)" = "800 600 2 800 600" ] || { echo "webenv: the window's size and pixel scale are not the surface's: $(web 1 ZINC_SIZE=800x600 ZINC_SCALE=2 2>&1)"; fail=1; }

printf "window.AudioContext; window.AudioContext; document.pictureInPictureEnabled; navigator.userAgent; window.innerWidth; console.log('done');\n" > "$tmp/trace.js"
file="$tmp/trace.js"
[ "$(web trace 2>&1)" = "web: unknown window.AudioContext
web: unknown document.pictureInPictureEnabled
done" ] || { echo "webenv: ZINC_WEB=trace does not name the missing members once each: $(web trace 2>&1)"; fail=1; }
exit $fail
