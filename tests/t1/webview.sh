#!/bin/sh
# ZN-655: real WKWebView, bidirectional RPC, and zinc:// assets in a moved .app.
[ "$(uname)" = Darwin ] || exit 77
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
unset ZINC_HEADLESS ZINC_DETERMINISTIC ZINC_ASSETS ZINC_PACKS
export ZINC_NATIVE=real ZINC_FRAMES=180 ZINC_STEPS=0
mkdir -p "$t/project/assets" "$t/moved"
cat > "$t/project/main.ts" <<'TS'
import * as webview from 'zinc:webview';
import { onFrame, clear, quit } from 'zinc:gfx';
const web = webview.create({ url: 'zinc://index.html', html: '', x: 0, y: 0, w: 320, h: 200 });
web.handle('echo', (s: string) => 'reply:' + s);
web.onMessage((s: string) => { console.log(s); web.close(); quit(); });
onFrame(() => { clear(0x112233); });
TS
cat > "$t/project/assets/index.html" <<'HTML'
<!doctype html><script>
Promise.all([fetch('msg.txt').then(r => r.text()), zinc.invoke('echo', 'rpc'), zinc.invoke('unknown').then(() => 'BAD', () => 'rejected')])
  .then(parts => zinc.postMessage(parts.join('|')));
</script>
HTML
printf 'bundled' > "$t/project/assets/msg.txt"
printf '{"name":"webview-test","entry":"main.ts","app":{"id":"dev.zinc.test.webview"}}\n' > "$t/project/zinc.json"
"$Z" build --bundle "$t/project/main.ts" -o "$t/Probe.app" > "$t/build" 2>&1 || { cat "$t/build"; exit 1; }
otool -L "$t/Probe.app/Contents/MacOS/webview-test" | grep -q WebKit || { echo 'webview: no WebKit linked'; exit 1; }
mv "$t/Probe.app" "$t/moved/Probe.app"
mv "$t/project/assets" "$t/project/gone"
(cd / && timeout 15 "$t/moved/Probe.app/Contents/MacOS/webview-test") > "$t/native" 2>&1 || { cat "$t/native"; exit 1; }
grep -qx 'bundled|reply:rpc|rejected' "$t/native" || { echo 'webview: bundle page or bridge failed'; cat "$t/native"; exit 1; }
mv "$t/project/gone" "$t/project/assets"
timeout 15 "$Z" run --interp "$t/project/main.ts" > "$t/interp" 2>&1 || { cat "$t/interp"; exit 1; }
grep -qx 'bundled|reply:rpc|rejected' "$t/interp" || { echo 'webview: interpreted page or bridge failed'; cat "$t/interp"; exit 1; }
grep -q 'implemented in both' "$t/interp" && { echo 'webview: two SDL copies loaded'; cat "$t/interp"; exit 1; }
# ZN-995: a closed view's slot goes to the next one; the old view's queued message, a stale postMessage and a stale eval must not reach it
mkdir -p "$t/reuse"
cat > "$t/reuse/main.ts" <<'TS'
import * as webview from 'zinc:webview';
import { onFrame, clear, quit } from 'zinc:gfx';
const a = webview.create({ url: '', html: '<script>zinc.postMessage("a1"); zinc.postMessage("a2")</script>', x: 0, y: 0, w: 320, h: 200 });
let b: webview.WebView | null = null;
a.onMessage((s: string) => {
  console.log('a: ' + s);
  if (b !== null) return;
  a.close();
  const nb = webview.create({ url: '', html: '<script>zinc.onmessage = d => zinc.postMessage("got " + d)</script>', x: 0, y: 0, w: 320, h: 200 });
  b = nb;
  nb.onMessage((m: string) => { console.log('b: ' + m); if (m === 'got fresh') { nb.close(); quit(); } });
  nb.onLoad((u: string) => { a.eval('zinc.postMessage("evalstale")'); a.postMessage('stale'); nb.postMessage('fresh'); });
});
onFrame(() => { clear(0x112233); });
TS
timeout 15 "$Z" run --interp "$t/reuse/main.ts" 2>&1 | grep -E '^(a|b): ' > "$t/reuse.out"
printf 'a: a1\nb: got fresh\n' | diff - "$t/reuse.out" >/dev/null || { echo 'webview: a closed view reached the view in its slot'; cat "$t/reuse.out"; exit 1; }
echo 'webview: ok'
