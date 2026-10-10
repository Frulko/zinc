#!/bin/sh
# The web environment of the QuickJS engine (ZN-568, lib/std/webenv.js): off unless the program asks (ZINC_WEB=1 or "web" in zinc.json; ZINC_WEB=0
# wins over the project); then the window is the global object, the document has a tree with the simple selectors, events run their capture, target
# and bubble phases up to the document and the window, an unhandled rejection is the window's `unhandledrejection` event (ZN-566: a prevented one
# is silent, the program goes on), the size and the pixel scale are the surface's, and ZINC_WEB=trace names a member a library misses.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
web() { mode=$1; shift; env ZINC_HEADLESS=1 ZINC_WEB="$mode" "$@" "$ZINC" run "$file" --engine quickjs; }   # web <ZINC_WEB or ''> [VAR=value...] on $file

file=tests/golden/webenv/dom.js
web 1 > "$tmp/dom.out" 2> "$tmp/dom.err" || { echo "webenv: dom.js failed: $(head -c 300 "$tmp/dom.err")"; fail=1; }
diff "$tmp/dom.out" tests/golden/webenv/dom.out > "$tmp/dom.diff" || { echo "webenv: dom.js differs from tests/golden/webenv/dom.out:"; head -20 "$tmp/dom.diff"; fail=1; }
grep -q "^Uncaught (in promise) Error: loud" "$tmp/dom.err" || { echo "webenv: an unhandled rejection no listener prevented is not printed"; fail=1; }
grep -q "quiet" "$tmp/dom.err" && { echo "webenv: a rejection whose event was prevented is printed"; fail=1; }

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

printf "window.AudioContext; window.AudioContext; document.fonts; navigator.userAgent; window.innerWidth; console.log('done');\n" > "$tmp/trace.js"
file="$tmp/trace.js"
[ "$(web trace 2>&1)" = "web: unknown window.AudioContext
web: unknown document.fonts
done" ] || { echo "webenv: ZINC_WEB=trace does not name the missing members once each: $(web trace 2>&1)"; fail=1; }
exit $fail
