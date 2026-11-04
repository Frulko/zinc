#!/bin/sh
# Builds the REAL Quill demos, from upstream's source at a pinned commit and unmodified, plus the launcher and the toolbar of this folder.
# Host-only: fetches the sources, reads libqsgepaper.so from the tablet (never redistributed), writes dist/quill-originals. deploy.sh installs it.
# Needs Docker and reMarkable's SDK in integrations/remarkable-ink/build/sdk (see integrations/remarkable-ink/README.md).
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd); ROOT=$(CDPATH= cd -- "$HERE/../../.." && pwd)
QUILL_REV=39262ee0bef69915e3ead3ac218d5973916f422a
DRAWLAB_REV=f9b5bab
TABLET=${TABLET:-root@10.11.99.1}
B="$HERE/build"; OUT="$HERE/dist/quill-originals"; mkdir -p "$B" "$OUT/bin" "$OUT/media"
[ -d "$B/quill/.git" ] || git clone https://github.com/MaximeRivest/quill.git "$B/quill"
git -C "$B/quill" checkout -q --detach "$QUILL_REV"
[ -d "$B/inkwordle/.git" ] || git clone https://github.com/Rkcr7/inkwordle.git "$B/inkwordle"
git -C "$B/inkwordle" checkout -q --detach "$DRAWLAB_REV"
[ -f "$B/libqsgepaper.so" ] || scp -O "$TABLET:/usr/lib/plugins/scenegraph/libqsgepaper.so" "$B/"
cp "$ROOT/integrations/remarkable-ink/quill/libquill.so" "$B/libquill.so"
docker run --rm --platform linux/arm64 -v "$ROOT/integrations/remarkable-ink/build/sdk:/work/sdk" -v "$HERE:/proj" -w /proj zinc/linux-build-debian-trixie-arm64 bash -c '
set -e
unset LD_LIBRARY_PATH
source /work/sdk/environment-setup-cortexa53-crypto-remarkable-linux
# the relocated toolchain needs its own libc; only for the compiler: the other tools of the image break on it
TC="env LD_LIBRARY_PATH=/work/sdk/sysroots/aarch64-codexsdk-linux/usr/lib:/work/sdk/sysroots/aarch64-codexsdk-linux/lib"
CC="$TC $CC"; CXX="$TC $CXX"
QT="$SDKTARGETSYSROOT/usr/include"
LINK="-Lbuild -lquill -lqsgepaper -lQt6Gui -lQt6Core -lstdc++ -Wl,--allow-shlib-undefined"   # the tablet has a newer Qt than the SDK; a 6.x app runs on it
Q=build/quill; D=dist/quill-originals/bin
for s in $Q/src/scribble.c $Q/examples/vanishing_trail.c build/inkwordle/quill/src/drawlab.c $Q/src/map_demo.c $Q/src/color_probe.c $Q/src/color_mode_compare.c $Q/src/color_partial_probe.c $Q/src/color_blend_probe.c; do
  $CC -O2 -w "$s" $LINK -o "$D/$(basename "${s%.*}")"
done
for s in image_demo color_image_demo image_anim_demo gif_demo; do
  $CXX -O2 -w -I"$QT" -I"$QT/QtCore" -I"$QT/QtGui" "$Q/src/$s.cpp" $LINK -o "$D/$s"
done
$CC -O2 -Wall -Wextra -Isrc src/home.c $LINK -o $D/home
$CC -O2 -Wall -Wextra -Isrc -fPIC -shared src/bar.c -ldl -pthread -o $D/libbar.so
'
cp "$B/libquill.so" "$OUT/bin/"
cp "$ROOT/integrations/remarkable-ink/quill/LICENSE" "$OUT/QUILL-LICENSE"
cp "$B/quill/marauders_map.png" "$B/quill/medium-map.gif" "$ROOT/examples/museum-table/assets/photos/great-wave.jpg" "$OUT/media/"
cp "$HERE/launch.sh" "$HERE/session.sh" "$HERE/demos.txt" "$HERE/external.manifest.json" "$OUT/"
printf 'Quill source: %s\nDrawlab (inkwordle, GPLv3): %s\n' "$QUILL_REV" "$DRAWLAB_REV" > "$OUT/PROVENANCE"
echo "Ready: $OUT (not installed)"
