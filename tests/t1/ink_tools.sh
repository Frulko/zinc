#!/bin/sh
# zinc:ink's writing tools (ZN-844): one stroke of each tool (ballpoint, fineliner, marker, pencil, calligraphy, highlighter) fed through
# the live pen path, the JSON round trip with the tools (and a file of before them, read as a ballpoint and written back unchanged), the
# SVG's per-tool styles (data-tool, the highlighter translucent and first, the pencil lighter), undo/redo, the area eraser; then the strokes
# under zinc:remarkable's InkPalette, compared with the golden frame (INK_TOOLS_UPDATE=1 writes it).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=5 ZINC_SHOT="$tmp/frame.png" timeout 120 "$ZINC" run tests/data/ink-tools >"$tmp/out" 2>"$tmp/err" \
  || { echo "the program failed:"; tail -10 "$tmp/err"; exit 1; }
cat >"$tmp/want" <<'EOF'
tools ballpoint,fineliner,marker,pencil,calligraphy,highlighter
calligraphy widths 7.4 2.5
round trip same ballpoint,fineliner,marker,pencil,calligraphy,highlighter
old file ballpoint same
svg fineliner yes
svg marker yes
svg pencil yes
svg calligraphy yes
svg highlighter yes
svg highlighter first yes, translucent yes
svg pencil lighter yes
undo 4 redo? yes
redo 6 same yes
area 4 ballpoint,marker,pencil,calligraphy
area undo 6
EOF
diff "$tmp/want" "$tmp/out" || fail=1
if [ "$INK_TOOLS_UPDATE" = 1 ]; then mkdir -p tests/golden/ink-tools && cp "$tmp/frame.png" tests/golden/ink-tools/frame.png
else tools/pngdiff "$tmp/frame.png" tests/golden/ink-tools/frame.png --tol 0 >"$tmp/diff" || { echo "the frame differs from tests/golden/ink-tools/frame.png: $(cat "$tmp/diff")"; fail=1; }
fi
[ $fail -eq 0 ] && echo "ink tools: ok"
exit $fail
