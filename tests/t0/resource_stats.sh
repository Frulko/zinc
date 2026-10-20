#!/bin/sh
# A live image contributes owned bytes; a borrowed image is not counted twice; destruction drops the counter.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'TS'
import { createImage, destroyImage } from 'zinc:gfx';
import { resourceStats } from 'zinc:__diagnostics';
console.log(resourceStats());
const image = createImage(12, 10);
console.log(resourceStats());
destroyImage(image);
console.log(resourceStats());
TS
for engine in --interp native; do
  if [ "$engine" = native ]; then engine=''; fi
  ZINC_HEADLESS=1 "$ZINC" run $engine "$tmp/main.ts" > "$tmp/output"
  python3 - "$tmp/output" <<'PY'
import json, sys
a, b, c = [json.loads(line)['images'] for line in open(sys.argv[1]) if line.startswith('{')]
assert b['objects'] == a['objects'] + 1, (a, b)
assert b['cpuBytes'] == a['cpuBytes'] + 480, (a, b)
assert c == a, (a, c)
assert b['borrowedBytes'] == a['borrowedBytes'], (a, b)
PY
done
cat > "$tmp/render.ts" <<TS
import { Mesh, Camera, Scene } from 'zinc:3d';
import { resourceStats } from 'zinc:__diagnostics';
const mesh = new Mesh([0,0,0, 1,0,0, 0,1,0], [0,1,2], [], [], []);
const target = new Camera();
target.render(new Scene(), 0, 0, 12, 10);
console.log(resourceStats());
target.dispose(); mesh.dispose();
console.log(resourceStats());
TS
ZINC_3D=software ZINC_HEADLESS=1 "$ZINC" run --interp "$tmp/render.ts" > "$tmp/output"
python3 - "$tmp/output" <<'PY'
import json, sys
a, b = [json.loads(line) for line in open(sys.argv[1]) if line.startswith('{')]
assert a['3d.meshes']['objects'] == a['3d.targets']['objects'] == 1, a
assert a['3d.targets']['cpuBytes'] == 12 * 10 * 8, a
assert a['images']['cpuBytes'] == 0 and a['images']['borrowedBytes'] == 12 * 10 * 4, a
assert b['3d.meshes']['objects'] == b['3d.targets']['objects'] == 0, b
assert b['3d.targets']['cpuBytes'] == b['images']['borrowedBytes'] == 0, b
PY
if command -v pkg-config >/dev/null && pkg-config --exists libavformat libavcodec libavutil libswscale; then
  cat > "$tmp/video.ts" <<'TS'
import { onFrame, quit } from 'zinc:gfx';
import { Player } from 'zinc:video';
import { env } from 'zinc:sys';
import { resourceStats } from 'zinc:__diagnostics';
const video = new Player(32, 24);
video.add(env('VIDEO_FILE')); video.play();
onFrame((dt: number): void => {
  if (video.frames < 2) return;
  console.log(resourceStats());
  video.close();
  console.log(resourceStats());
  quit();
});
TS
  env -u ZINC_DETERMINISTIC ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_FRAMES=3000000 VIDEO_FILE="$PWD/examples/video/bounce/media/fractal.mp4" timeout 30 "$ZINC" run --interp "$tmp/video.ts" > "$tmp/output"
  python3 - "$tmp/output" <<'PY'
import json, sys
a, b = [json.loads(line) for line in open(sys.argv[1]) if line.startswith('{')]
assert a['video.buffers']['objects'] == 1 and a['video.buffers']['cpuBytes'] == 5 * 32 * 24 * 4, a
assert a['video.sources']['objects'] > 0, a
assert b['video.buffers']['objects'] == b['video.sources']['objects'] == 0, b
assert b['video.buffers']['cpuBytes'] == b['images']['borrowedBytes'] == 0, b
PY
fi
echo 'resource_stats: ok (interpreter, native create/destroy)'
