#!/bin/sh
# zinc ui (ZN-155): the prototype's zinc-ui tools run from this zinc: check validates the Figma storyboard design, code prints the UI the
# prototype generates for it. Skips (77) without Node.
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null 2>&1 || exit 77
d=../examples/ui/figma-storyboard/design.zui.json
out=$("$ZINC" ui check $d 2>&1) && echo "$out" | grep -q "valid zinc-ui/1" || { echo "zinc ui check: $out"; exit 1; }
[ "$("$ZINC" ui code $d 2>&1)" = "$(node ../compiler/bin/zinc.mjs ui code $d 2>&1)" ] || { echo "zinc ui code differs from the prototype's"; exit 1; }
echo "ui_tools: ok"
