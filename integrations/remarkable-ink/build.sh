#!/bin/sh
set -eu
# Official ferrari 5.7.119 ARM64 SDK installed in the zinc-ink-builder container at /sdk.
# XOVI source is mounted at /xovi; project root at /work. This never contacts the tablet.
docker exec zinc-ink-builder bash -c '
set -e
source /sdk/environment-setup-cortexa53-crypto-remarkable-linux
cd /work/integrations/remarkable-ink
mkdir -p build dist
python3 /xovi/util/xovigen.py -o build/xovi.c -H build/xovi.h bridge.xovi
$CC -fPIC -O2 -c build/xovi.c -o build/xovi.o
$CXX -fPIC -shared -O2 -std=c++17 -Wall -Wextra bridge.cpp build/xovi.o \
  $(pkg-config --cflags --libs Qt6Core Qt6Gui Qt6Quick) -ldl -o dist/zinc-ink.so
echo "Built dist/zinc-ink.so"
'
docker exec zinc-ink-builder sh -c 'cd /work/integrations/remarkable-ink && g++ -std=c++17 -O2 -static probe.cpp -o dist/probe'
