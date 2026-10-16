#!/bin/sh
# ZN-749: examples/webview/hybrid through <NativeView> on macOS. The real WKWebView takes the layout node's box (beside the 256 px sidebar),
# the page and the program talk both ways (invoke, postMessage), and in the phone layout (HYBRID_PHONE=1) a scroll moves the view up under
# the bar, which clips it: the container keeps the clip, the web view moves inside it (ZINC_WEBVIEW_TRACE prints the frames AppKit got).
[ "$(uname)" = Darwin ] || exit 77
cd "$(dirname "$0")/../.." || exit 2
ex=$(cd ../examples/webview/hybrid && pwd)
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
unset ZINC_HEADLESS ZINC_DETERMINISTIC ZINC_ASSETS
export ZINC_NATIVE=real ZINC_BACKGROUND=1 ZINC_WEBVIEW_TRACE=1 HYBRID_DEMO=1 ZINC_FRAMES=240
timeout 60 "$ZINC" run --interp "$ex" -- "$ex" > "$t/desk" 2>&1 || { tail -20 "$t/desk"; exit 1; }
for want in 'hybrid: page ready (2 files)' 'hybrid: readFile main.tsx'; do
  grep -qxF "$want" "$t/desk" || { echo "webview hybrid: no '$want'"; tail -20 "$t/desk"; exit 1; }
done
grep -qx 'webview 0: clip 256,0 768x640 view 0,0 768x640' "$t/desk" || { echo 'webview hybrid: the web view is not at the node beside the sidebar'; grep '^webview' "$t/desk"; exit 1; }
HYBRID_PHONE=1 HYBRID_SCROLL=200 ZINC_SIZE=390x700 timeout 60 "$ZINC" run --interp "$ex" -- "$ex" > "$t/phone" 2>&1 || { tail -20 "$t/phone"; exit 1; }
grep -qx 'hybrid: scrolled 200' "$t/phone" || { echo 'webview hybrid: the phone layout did not scroll'; tail -20 "$t/phone"; exit 1; }
# after the scroll: the container starts at the bar's bottom edge, the web view 200 logical px higher than before inside it
python3 - "$t/phone" <<'EOF' || exit 1
import re, sys
fr = [tuple(map(float, m.groups())) for m in re.finditer(r'^webview 0: clip ([-\d.e]+),([-\d.e]+) ([-\d.e]+)x([-\d.e]+) view ([-\d.e]+),([-\d.e]+) ([-\d.e]+)x([-\d.e]+)$', open(sys.argv[1]).read(), re.M)]
fr = [f for f in fr if f[6] > 100]
if len(fr) < 2: sys.exit(f'webview hybrid: expected the view placed before and after the scroll, got {fr}')
a, b = fr[0], fr[-1]
k = (b[1] + b[5] - (a[1] + a[5])) / -200   # the view's top on the window moved up by 200 logical px
if not 1 <= k <= 3: sys.exit(f'webview hybrid: the view moved by {a[1] + a[5] - b[1] - b[5]} points for a 200 px scroll')
if b[5] >= 0 or b[1] <= 0 or b[1] >= a[1]: sys.exit(f'webview hybrid: not clipped by the bar after the scroll: {b}')
EOF
echo 'webview hybrid: ok'
