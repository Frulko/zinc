#!/bin/sh
# The small browser APIs of the web environment (ZN-705), each on a page a library would write (tests/golden/webenv/page): the window's focus
# and blur and the document's visibilitychange from the system's signals, with no animation frame while hidden; Shift, Control, Alt and Meta
# as keys of their own; FormData and its multipart body; localStorage and sessionStorage as properties. Fingers as pointers: webenv_touch.
# The FormData and storage outputs equal headless Chrome's on the same pages (checked once through tools/cdp.py).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
d=tests/golden/webenv/page
check() {   # check <name> [VAR=value...]: runs $d/<name>.js and compares its output with $d/<name>.out
  name=$1; shift
  env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 "$@" timeout 30 "$ZINC" run "$d/$name.js" --engine quickjs > "$tmp/$name.out" 2> "$tmp/$name.err" || { echo "webenv_page: $name.js failed: $(grep -v '^  \|^zinc run' "$tmp/$name.err" | head -c 300)"; fail=1; }
  diff "$tmp/$name.out" "$d/$name.out" > "$tmp/$name.diff" || { echo "webenv_page: $name.js differs from $d/$name.out:"; head -20 "$tmp/$name.diff"; fail=1; }
}
check focus ZINC_FRAMES=14 ZINC_INPUT=$d/focus.input
check modkeys ZINC_FRAMES=12 ZINC_INPUT=$d/modkeys.input
check formdata
check storage ZINC_STORAGE="$tmp/storage.json"
exit $fail
