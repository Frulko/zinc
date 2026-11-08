#!/bin/sh
# Mobile feel (ZN-1064):
# - a Canvas's onDraw inherits its views' opacity through zinc:gfx's global alpha (a fading screen fades its icons), and the alpha is back to
#   255 after the callback;
# - React Native's Modal in the classic layout: its host (object style position 'absolute', inset 0) covers the window, a press inside it does not
#   ask onRequestClose, Escape does.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cat > "$tmp/alpha.ts" <<'P'
import * as ui from 'zinc:ui';
import { globalAlpha, rrect } from 'zinc:gfx';
const root = ui.createNode(ui.VIEW);
const fade = ui.createNode(ui.VIEW);
ui.setClass(fade, 'w-[40px] h-[40px] opacity-50');
const c = ui.createNode(ui.CANVAS);
ui.setClass(c, 'w-[20px] h-[20px]');
ui.insert(fade, c, -1); ui.insert(root, fade, -1);
let seen: i32 = -1, fr = 0;
ui.draw(c, (x: i32, y: i32, w: i32, h: i32) => { seen = globalAlpha(); rrect(x, y, w, h, 0, 0xff0000, 255); });
ui.mount(root, 0xffffff, (dt: number) => {
  fr++;
  if (fr === 3) console.log(`log seen ${seen} after ${globalAlpha()}`);
});
P
got=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 "$ZINC" run "$tmp/alpha.ts" 2>&1 | grep '^log' | tail -1)
[ "$got" = "log seen 128 after 255" ] || { echo "alpha: want 'log seen 128 after 255', got '$got'"; fail=1; }
mkdir "$tmp/modal"
echo '{ "name": "modal", "entry": "main.tsx" }' > "$tmp/modal/zinc.json"
cat > "$tmp/modal/main.tsx" <<'P'
import * as ui from 'zinc:ui';
import { render } from 'zinc:ui/react';
import { Modal } from 'zinc:react-native';
let frame = 0, closed = 0, host = -1;
function App(): i32 {
  return <View className="flex-1">
    <Modal visible={true} transparent={true} onRequestClose={(): void => { closed++; }}>
      <View style={{ width: 100, height: 80, marginTop: 50, marginLeft: 40, backgroundColor: 0x334155 }} />
    </Modal>
  </View>;
}
render(App, 0xffffff, (dt: number) => {});
ui.addWatcher((): void => {
  frame++;
  if (frame === 4) { const r = ui.inspectNode(ui.rootNode()); if (r !== null) { const a = ui.inspectNode(r.children[0]); if (a !== null && a.children.length > 0) host = a.children[0]; } }
  if (frame === 20) { const n = ui.inspectNode(host); console.log(`log host ${n === null ? 'none' : `${n.lw}x${n.lh}`} pressed ${closed}`); }
  if (frame === 29) console.log(`log escape ${closed}`);
});
P
printf '5 move 80 80\n6 down\n7 up\n10 move 200 250\n11 down\n12 up\n25 key Escape\n' > "$tmp/modal/press.input"
out=$(cd "$tmp/modal" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=240x320 ZINC_FRAMES=30 ZINC_INPUT=press.input "$ZINC" run . 2>&1 | grep '^log')
want='log host 240x320 pressed 0
log escape 1'
[ "$out" = "$want" ] || { echo "modal: want '$want', got '$out'"; fail=1; }
[ $fail -eq 0 ] && echo "ui_canvas_alpha: ok"
exit $fail
