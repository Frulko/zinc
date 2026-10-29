#!/bin/sh
# The headless window's `close` (ZINC_INPUT) asks the program first, as the close button of a real window does: a close-requested handler
# that keeps the window open (close to the menu bar, a quit that saves first) keeps the program running; the second close, not vetoed, ends it.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/zinc.json" <<'EOF'
{"name":"headless_close","entry":"main.tsx","permissions":["window"]}
EOF
cat > "$tmp/main.tsx" <<'EOF'
import { render } from 'zinc:ui/solid';
import * as window from 'zinc:system/window';
let asked = 0;
window.onCloseRequested(() => {
  asked++;
  console.log(`close asked ${asked}`);
  if (asked === 1) { window.keepOpen(); setTimeout(() => { console.log('still open'); }, 20); }
});
render(() => <View className="w-full h-full" />, 0xffffffff, null);
EOF
printf '5 close\n40 close\n' > "$tmp/input"
out=$(cd "$tmp" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_INPUT=input ZINC_FRAMES=100000 timeout 20 "$ZINC" run --interp . 2>/dev/null | grep -v '^\[system\]')
want='close asked 1
still open
close asked 2'
[ "$out" = "$want" ] || { echo "headless_close: $(printf '%s' "$out" | tr '\n' '|')"; exit 1; }
echo "headless_close: ok"
