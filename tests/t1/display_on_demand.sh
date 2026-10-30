#!/bin/sh
# zinc.json "displays": a display driver linked on demand. The built app keeps its own screen, and takes the driver only when ZINC_DISPLAY
# names it at run time (a second process of the app streaming to a tablet: examples/webview/sidecar-browser).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/zinc.json" <<'J'
{ "name": "on-demand", "entry": "main.tsx", "displays": ["sidecar"], "targets": { "macos": { "width": 320, "height": 200 } } }
J
cat > "$tmp/main.tsx" <<'J'
import { render } from 'zinc:ui/solid';
render(() => <View className="h-full bg-slate-900" />, 0, null);
J
out=$("$ZINC" build "$tmp" -o "$tmp/app" 2>&1) || { echo "build failed: $out"; exit 1; }
fail=0
# nothing listens on port 1: the driver, when it registers, says it found no screen
out=$(ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_SIDECAR=127.0.0.1:1 "$tmp/app" 2>&1)
echo "$out" | grep -q "display-sidecar" && { echo "not asked, the driver took the screen: $out"; fail=1; }
out=$(ZINC_HEADLESS=1 ZINC_FRAMES=2 ZINC_DISPLAY=sidecar ZINC_SIDECAR=127.0.0.1:1 "$tmp/app" 2>&1)
echo "$out" | grep -q "display-sidecar: no Sidecar screen at 127.0.0.1:1" || { echo "ZINC_DISPLAY=sidecar did not reach the driver: $out"; fail=1; }
exit $fail
