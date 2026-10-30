#!/bin/sh
# zinc:screen-capture (ZN-874): with the fake sources (ZINC_FAKE_SCREEN=1), getSources lists a screen and a window with thumbnails and
# getDisplayMedia gives a live track of the asked source at the asked size whose frames arrive; an unknown source is NotFoundError. On the
# real machine it only asks where screen recording stands, never captures and never shows the system's question: refused, getSources says
# where to allow it; allowed, it lists the screens (no thumbnails, no capture).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: ScreenCaptureKit is macOS only"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
cat > "$tmp/fake.ts" <<'EOF'
import { getSources, CaptureSource } from 'zinc:screen-capture';
import { navigator, MediaStreamTrack, DOMException } from 'zinc:web';
async function main(): Promise<void> {
  for (const s of await getSources({ thumbnailSize: { width: 160, height: 160 } })) console.log(`${s.kind} ${s.name} ${s.width}x${s.height} thumb ${s.thumbnail >= 0 ? 'yes' : 'no'}`);
  const m = await navigator.mediaDevices.getDisplayMedia({ video: { deviceId: 'zinc:fake-window', width: 640, height: 640, frameRate: 30 } });
  const t: MediaStreamTrack = m.getVideoTracks()[0];
  const st = t.getSettings();
  console.log(`track ${t.kind} ${st.width}x${st.height} ${st.frameRate} fps image ${t.image >= 0 ? 'yes' : 'no'}`);
  let tries = 0;
  while (t.frameIndex < 3 && ++tries < 200) await new Promise<void>((done: () => void) => { setTimeout(done, 10); });
  console.log(`frames ${t.frameIndex >= 3 ? 'yes' : 'no'} snapshot ${t.snapshot().length}`);
  t.stop();
  console.log(`stopped ${t.readyState}`);
  try { await navigator.mediaDevices.getDisplayMedia({ video: { deviceId: 'nope' } }); } catch (e) { console.log(`unknown ${(e as DOMException).name}`); }
}
main();
EOF
want="screen Zinc Fake Screen 1280x800 thumb yes
window Zinc Fake Window 800x600 thumb yes
track video 640x480 30 fps image yes
frames yes snapshot 1228800
stopped ended
unknown NotFoundError"
got=$(ZINC_FAKE_SCREEN=1 ZINC_NATIVE=real ZINC_HEADLESS=1 timeout 120 "$ZINC" run "$tmp/fake.ts" 2>&1)
[ "$got" = "$want" ] || { echo "the fake-source session differs: $got"; fail=1; }
# the real machine: the status only, the explanation when refused, the screens when allowed; never a capture, never the system's question
cat > "$tmp/real.ts" <<'EOF'
import { permissionStatus, getSources } from 'zinc:screen-capture';
const p = permissionStatus();
getSources({ types: ['screen'] }).then((s) => console.log(`${p} screens ${s.length > 0 ? 'yes' : 'no'}`)).catch((e: Error) => console.log(`${p} ${e.message}`));
EOF
got=$(env -u ZINC_DETERMINISTIC ZINC_FAKE_SCREEN=0 ZINC_BACKGROUND=1 ZINC_NATIVE=real ZINC_HEADLESS=1 timeout 120 "$ZINC" run "$tmp/real.ts" 2>&1)
case "$got" in
  "granted screens yes") ;;
  "denied screen capture: screen recording permission is not granted: allow this app in System Settings"*) ;;
  *) echo "the real status is not reported with its explanation: $got"; fail=1 ;;
esac
# zinc.json permissions: a project without "screen" cannot reach the sources when enforced
mkdir -p "$tmp/denied" && printf '{ "name": "denied", "entry": "main.ts", "permissions": [] }\n' > "$tmp/denied/zinc.json"
printf "import { getSources } from 'zinc:screen-capture';\ngetSources().then(() => console.log('listed')).catch((e: Error) => console.log(e.message));\n" > "$tmp/denied/main.ts"
out=$(cd "$tmp/denied" && ZINC_PERMISSIONS=enforce ZINC_FAKE_SCREEN=1 ZINC_NATIVE=real ZINC_HEADLESS=1 timeout 120 "$ZINC" run . 2>&1)
echo "$out" | grep -q 'needs the permission "screen"' || { echo "an undeclared screen capture is not refused: $out"; fail=1; }
exit $fail
