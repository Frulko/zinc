#!/bin/sh
# zinc:3d keeps the world matrix of a node that has not moved under a parent that has not either (render() makes it again only on a change):
# a child follows its parent's move, its own move, a move to another parent, and that parent's move.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/main.ts" <<'TS'
import { onFrame, width, height } from 'zinc:gfx';
import { Scene, Camera, Node } from 'zinc:3d';
const scene = new Scene(), camera = new Camera();
const parent = new Node(null, null), child = new Node(null, null), other = new Node(null, null);
scene.add(parent); parent.add(child); scene.add(other);
child.setPosition(1, 0, 0);
let frame = 0;
onFrame((dt: number) => {
  frame++;
  if (frame === 2) parent.setPosition(5, 0, 0);
  if (frame === 3) child.position[1] = 2;
  if (frame === 4) { parent.children.splice(0, 1); other.add(child); }
  if (frame === 5) other.setPosition(0, 0, 7);
  camera.render(scene, 0, 0, width(), height());
  console.log(`${frame} ${child.world[12]} ${child.world[13]} ${child.world[14]}`);
});
TS
ZINC_HEADLESS=1 ZINC_FRAMES=6 "$ZINC" run "$tmp/main.ts" >"$tmp/out" 2>&1 || { echo "the run failed: $(tail -3 "$tmp/out")"; exit 1; }
want='1 1 0 0
2 6 0 0
3 6 2 0
4 1 2 0
5 1 2 7
6 1 2 7'
got=$(grep '^[0-9] ' "$tmp/out")
[ "$got" = "$want" ] || { printf 'child world positions:\n%s\nwanted:\n%s\n' "$got" "$want"; exit 1; }
echo "zinc3d_still: ok"
