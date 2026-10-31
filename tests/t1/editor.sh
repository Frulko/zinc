#!/bin/sh
# plugins/editor, command-palette, editor-lsp (ZN-908): the highlighter and its language registry, the document, the editing commands on
# several selections with undo, the theme pair, the fuzzy matcher and the LSP framing print tests/golden/editor/editor_core.out on the
# interpreter, a zinc build program (AOT) and QuickJS. Then the views: a CodeEditor and a CodeView (plugins/editor/tests/editor_view.tsx)
# drawn headless, `(x)` typed at two cursors, undone and redone; the frame is tests/golden/editor/view-12.png.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
src=plugins/editor/tests/editor_core.ts want=tests/golden/editor/editor_core.out
"$ZINC" run "$src" 2>"$tmp/err" | diff - $want > "$tmp/d" || { echo "editor: the interpreter differs from $want: $(head -6 "$tmp/d") $(head -3 "$tmp/err")"; fail=1; }
"$ZINC" run "$src" --engine quickjs 2>"$tmp/err" | diff - $want > "$tmp/d" || { echo "editor: QuickJS differs from $want: $(head -6 "$tmp/d") $(head -3 "$tmp/err")"; fail=1; }
"$ZINC" build "$src" -o "$tmp/app" > "$tmp/build.log" 2>&1 || { echo "editor: zinc build failed: $(tail -c 300 "$tmp/build.log")"; exit 1; }
"$tmp/app" | diff - $want > "$tmp/d" || { echo "editor: the AOT program differs from $want: $(head -6 "$tmp/d")"; fail=1; }

out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=12 ZINC_SHOT="$tmp/view.png" ZINC_SHOT_FRAMES=12 "$ZINC" run plugins/editor/tests/editor_view.tsx 2>&1)
[ "$(echo "$out" | grep -E '^(text|undone|redone) ')" = "$(printf 'text one(x)|two(x)\nundone one|two\nredone one(x)|two(x)')" ] || { echo "editor view: typing at two cursors, undo and redo: $(echo "$out" | tail -3)"; fail=1; }
tools/pngdiff "$tmp/view-12.png" tests/golden/editor/view-12.png >/dev/null || { echo "editor view: frame 12 differs from tests/golden/editor/view-12.png"; fail=1; }
[ -n "$EDITOR_KEEP" ] && cp "$tmp/view-12.png" "$EDITOR_KEEP"
[ $fail -eq 0 ] && echo "editor: ok"
exit $fail
