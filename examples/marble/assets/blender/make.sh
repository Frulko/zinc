#!/bin/sh
# Regenerates the 3D art of examples/marble from Kenney's kits (CC0): fetches the three kits (pinned URLs and SHA-256) into $KITS,
# runs build.py in Blender headless (models/high, models/low, models/models.json, preview/course.json, preview/course-blender.png),
# then the zinc:3d viewer on both variants (preview/course-zinc-low.png, preview/course-zinc-high.png).
#   BLENDER (default: blender on the PATH), ZINC (default: build/zinc of this checkout), KITS (default: /tmp/kenney-marble-kits)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
ASSETS=$(dirname "$HERE")
BLENDER=${BLENDER:-blender}
ZINC=${ZINC:-$HERE/../../../../build/zinc}
KITS=${KITS:-/tmp/kenney-marble-kits}

fetch() {   # kit, url, sha256: the zip is checked before it is unpacked; nothing in it is run
  [ -d "$KITS/$1" ] && return
  mkdir -p "$KITS"
  curl -sfL "$2" -o "$KITS/$1.zip"
  echo "$3  $KITS/$1.zip" | shasum -a 256 -c - >/dev/null || { echo "make.sh: $1.zip does not match its SHA-256"; exit 1; }
  unzip -q "$KITS/$1.zip" -d "$KITS/$1"
}
fetch marble https://kenney.nl/media/pages/assets/marble-kit/56fd69e5ed-1716385090/kenney_marble-kit.zip 4a289fe77fa4e71b943fb9a0df828a7987e62f665083ea9237d0bd9acd0b6dcb
fetch platformer https://kenney.nl/media/pages/assets/platformer-kit/1585cf62b4-1775122253/kenney_platformer-kit.zip 899605d237367688c6b42e41fff2206c0fb8d626163158294556353f7baa7c1b
fetch nature https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip fa7974a0d342bfe63c38664ba9f8ec1a4aab8ea25f099bdc56870e33588c4d9d

"$BLENDER" -b --factory-startup -P "$HERE/build.py" -- "$KITS" 2>&1 | grep -E '^BUILT|Error|Traceback' || true
[ -f "$ASSETS/models/models.json" ] || { echo "make.sh: the Blender build failed"; exit 1; }

# The viewer runs in a scratch project whose assets are copies of the models and the course (its build directory stays out of the repo).
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/assets"
cp "$HERE/viewer.ts" "$tmp/main.ts"
cp -R "$ASSETS/models" "$tmp/assets/models"
cp "$ASSETS/preview/course.json" "$tmp/assets/course.json"
cat >"$tmp/zinc.json" <<'EOF'
{ "name": "marble-art", "entry": "main.ts",
  "assets": { "rules": [{ "match": "models/**/*.glb", "as": "model", "format": "zmesh" }] },
  "targets": { "macos": { "width": 960, "height": 544 } } }
EOF
"$ZINC" assets build "$tmp"
for v in low high; do
  (cd "$tmp" && VARIANT=$v ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SHOT="$ASSETS/preview/course-zinc-$v.png" "$ZINC" run .)
done
