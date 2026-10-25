#!/bin/sh
# Builds dist/zinc-canvas.so and dist/zinc-ink.so with the official ferrari 5.7.119 ARM64 SDK, in a one-shot container (never the tablet):
#   the SDK in the Docker volume zinc-rm-sdk-5.7.119 (/sdk), XOVI master in $XOVI_SRC (/xovi, default /tmp/zinc-xovi), this repository at /work.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
docker run --rm --platform linux/arm64 -v zinc-rm-sdk-5.7.119:/sdk -v "$ROOT:/work" -v "${XOVI_SRC:-/tmp/zinc-xovi}:/xovi" zinc/sdk-rmpp bash -c '
set -e
source /sdk/environment-setup-cortexa53-crypto-remarkable-linux
cd /work/integrations/remarkable-ink
QT="$(pkg-config --cflags --libs Qt6Core Qt6Gui Qt6Qml Qt6Quick)"
for x in canvas:zinc-canvas bridge:zinc-ink; do
  src=${x%%:*} name=${x#*:}
  mkdir -p build/$src dist
  python3 /xovi/util/xovigen.py -o build/$src/xovi.c -H build/$src/xovi.h $src.xovi
  $CC -fPIC -O2 -c build/$src/xovi.c -o build/$src/xovi.o
  [ $src = bridge ] && cp build/$src/xovi.h build/xovi.h   # bridge.cpp includes "build/xovi.h"
  $CXX -fPIC -shared -O2 -std=c++17 -Wall -Wextra -Wl,--as-needed -Ibuild/$src $src.cpp build/$src/xovi.o $QT -ldl -o dist/$name.so
  echo "Built dist/$name.so"
done
'
