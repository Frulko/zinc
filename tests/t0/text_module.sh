#!/bin/sh
# The CLI carries no shaper; first font use loads the private, same-build module.
cd "$(dirname "$0")/../.." || exit 2
bin=$(cd "$(dirname "$ZINC")" && pwd)
case $(uname -s) in Darwin) suffix=dylib;; MINGW*|MSYS*) suffix=dll;; *) suffix=so;; esac
module="$bin/libzn_text_module.$suffix"
[ -f "$module" ] && [ -x "$bin/text_module_test" ] || { echo 'text module artifacts missing'; exit 1; }
if nm "$ZINC" | awk '{print $NF}' | grep -E '^_?(hb_|SB[A-Z])' > /dev/null; then echo 'HarfBuzz/SheenBidi linked into zinc'; exit 1; fi
ZINC_TEXT_LIB=/nonexistent/zn-text-module "$ZINC" --version >/dev/null || exit 1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_TEXT_LIB=/nonexistent/zn-text-module "$ZINC" bake tests/golden/res/main.ts -o "$tmp/font.bin" >"$tmp/missing.log" 2>&1
rc=$?
[ "$rc" = 1 ] && grep -q 'text module unavailable' "$tmp/missing.log" || { cat "$tmp/missing.log"; echo "missing module exit $rc"; exit 1; }
printf '%s\n' '{"entry":"canvas.js","text":"shaped"}' > "$tmp/zinc.json"
printf '%s\n' "console.log('canvas text entry'); const canvas = document.createElement('canvas'); const context = canvas.getContext('2d'); context.fillText('hello', 1, 16);" > "$tmp/canvas.js"
ZINC_TEXT_LIB=/nonexistent/zn-text-module ZINC_TEXT=simple ZINC_WEB=1 ZINC_HEADLESS=1 ZINC_FRAMES=1 "$ZINC" run "$tmp/canvas.js" --engine quickjs >"$tmp/canvas.log" 2>&1
rc=$?
[ "$rc" = 1 ] && grep -q 'canvas text entry' "$tmp/canvas.log" && grep -q 'text module unavailable' "$tmp/canvas.log" || { cat "$tmp/canvas.log"; echo "missing canvas module exit $rc"; exit 1; }
ZINC_TEXT_LIB=/nonexistent/zn-text-module "$bin/text_module_test" missing "$module" || exit 1
ZINC_TEXT_LIB="$bin/libtext_module_bad.$suffix" "$bin/text_module_test" missing "$module" || exit 1
ZINC_BAD_TEXT_SHORT=1 ZINC_TEXT_LIB="$bin/libtext_module_bad.$suffix" "$bin/text_module_test" missing "$module" || exit 1
"$bin/text_module_test" tampered "$module" || exit 1
ZINC_TEXT_LIB="$module" "$bin/text_module_test" lib/fonts/Inter-Regular.ttf "$module"
[ "$?" = 0 ] || exit 1
"$ZINC" pack tests/golden/shaped -o "$tmp/shaped.zapp" >"$tmp/pack.log" 2>&1 || { cat "$tmp/pack.log"; exit 1; }
"$ZINC" fuse "$tmp/shaped.zapp" -o "$tmp/shaped" >"$tmp/fuse.log" 2>&1 || { cat "$tmp/fuse.log"; exit 1; }
ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_FRAMES=1 "$tmp/shaped" >"$tmp/first.log" 2>&1 || { cat "$tmp/first.log"; exit 1; }
python3 - "$tmp/home" <<'PY'
import pathlib, sys
module = next(p for p in pathlib.Path(sys.argv[1]).glob('cache/zapp/*/engine/*/libzn_text_module.*') if p.suffix in ('.dylib', '.so', '.dll'))
with module.open('r+b') as f: f.write(b'X')
PY
ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_FRAMES=1 "$tmp/shaped" >"$tmp/tamper.log" 2>&1
rc=$?
[ "$rc" = 1 ] && grep -q 'cached module checksum mismatch' "$tmp/tamper.log" || { cat "$tmp/tamper.log"; echo "tampered module exit $rc"; exit 1; }
