#!/bin/sh
# A ZINC_INPUT click carries the modifiers named after it ("down meta" is a Cmd-click, "down shift+meta" both), as a key does: a list's
# Cmd and Shift selection can be scripted. A plain click has none.
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
cat > "$t/main.tsx" <<'TSX'
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/solid';
function App(): i32 {
  return <View className="w-full h-full" onPointerDown={(e: ui.PointerEvent) => console.log('click', e.meta, e.shift)} />;
}
render(App, 0xffffff, null);
TSX
printf '5 move 50 50\n6 down\n7 up\n9 down meta\n10 up meta\n12 down shift+meta\n13 up\n' > "$t/in"
out=$(cd "$t" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=20 ZINC_INPUT="$t/in" "$ZINC" run --interp main.tsx 2>&1 | grep '^click' | tr '\n' '|')
want='click false false|click true false|click true true|'
[ "$out" = "$want" ] || { echo "input_click_mods: $out, want $want"; exit 1; }
echo "input_click_mods: ok"
