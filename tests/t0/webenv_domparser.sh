#!/bin/sh
# DOMParser and XMLSerializer of the web environment (ZN-706, @xmldom/xmldom in third_party/xmldom): a bitmap font and an SVG parse to the
# nodes headless Chrome gives (tests/golden/webenv/domparser.out, written from Chrome's DOMParser through tools/cdp.py), and the parser is
# read only when a program makes its first DOMParser (ZINC_WEB=trace names the load).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
web() { ZINC_HEADLESS=1 ZINC_WEB="$1" timeout 30 "$ZINC" run "$2" --engine quickjs; }

web 1 tests/golden/webenv/domparser.js > "$tmp/out" 2> "$tmp/err" || { echo "webenv_domparser: domparser.js failed: $(grep -v '^  \|^zinc run' "$tmp/err" | head -c 300)"; fail=1; }
diff "$tmp/out" tests/golden/webenv/domparser.out > "$tmp/diff" || { echo "webenv_domparser: differs from Chrome's tests/golden/webenv/domparser.out:"; head -20 "$tmp/diff"; fail=1; }

printf "console.log(typeof DOMParser, typeof XMLSerializer);\n" > "$tmp/unused.js"
[ "$(web trace "$tmp/unused.js" 2>&1 | grep -c '^web: loaded @xmldom')" = 0 ] || { echo "webenv_domparser: the XML parser is loaded by a program that parses nothing"; fail=1; }
printf "const p = new DOMParser(); p.parseFromString('<a/>', 'text/xml'); console.log(p.parseFromString('<b x=\"1\"/>', 'application/xml').documentElement.getAttribute('x'));\n" > "$tmp/used.js"
web trace "$tmp/used.js" > "$tmp/used.out" 2>&1
[ "$(grep -c '^web: loaded @xmldom/xmldom' "$tmp/used.out")" = 1 ] && grep -qx 1 "$tmp/used.out" || { echo "webenv_domparser: the XML parser is not loaded once at the first parse: $(head -c 300 "$tmp/used.out")"; fail=1; }
exit $fail
