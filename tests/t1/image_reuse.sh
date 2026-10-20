#!/bin/sh
# A runtime image destroyed and created again reuses the slot, so the id, of the old one: its version must not start again, or what keeps
# images by (id, version) goes on showing the old pixels. zinc:3d's GPU renderer did (a texture replaced by another of the same size stayed
# on screen): a quad whose texture is swapped on the third frame must end as the quad that had the new texture from the start, on the
# software renderer and on the GPU one (which is the software one where there is no GPU context).
cd "$(dirname "$0")/../.." || exit 2
last() { ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SIZE=320x200 ZINC_FRAMES=5 ZINC_FRAMEHASH=last ZINC_3D=$1 "$ZINC" run tests/data/image_reuse/main.ts -- $2 2>&1 | sed -n 's/^zinc: framehash //p'; }
for renderer in software gpu; do
  [ "$renderer" = gpu ] && [ -n "$ZINC_CI" ] && continue   # a hosted CI runner has a virtual GPU: its frames are not the recorded ones
  kept=$(last $renderer); swapped=$(last $renderer --swap)
  [ -n "$kept" ] && [ "$kept" = "$swapped" ] || { echo "image_reuse ($renderer): the swapped texture is not on screen: $swapped, want $kept"; exit 1; }
done
echo "image_reuse: ok"
