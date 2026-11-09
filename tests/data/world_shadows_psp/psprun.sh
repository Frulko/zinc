#!/bin/sh
# ZN-1047: the shadows switch probe on the PSP core in PPSSPP headless (70 frames, a shot).
set -e
R=$(cd "$(dirname "$0")/../../.." && pwd)
D="${D:?set D to one scratch directory for setup.sh and psprun.sh}"
Z=$R/build/zinc
rm -rf "$D/pk"; mkdir -p "$D/pk"
"$Z" pack --profile psp "$D/psp" -o "$D/pk/p.zapp" > "$D/pk/pack.log" 2>&1 || { tail -5 "$D/pk/pack.log"; exit 1; }
tar -xf "$D/pk/p.zapp" -C "$D/pk" program.zbc resources.bin packs/default.zpk
cd "$R"
bin=$(timeout 1500 tools/build-console-core psp --embed "$D/pk/program.zbc" "$D/pk/resources.bin" "$D/pk/packs/default.zpk" --frames 45 -B build/console-psp-probe | tail -1)
echo "core: $bin"
timeout 200 tools/console-run psp "$bin" --timeout 150 --shot "$D/psp-day.png"
echo "status $?"
