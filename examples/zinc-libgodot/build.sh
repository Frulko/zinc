#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
root=$PWD
out="$root/examples/zinc-libgodot/build"
ZINC=${ZINC:-$root/build/zinc}
GODOT=${GODOT:-$(tools/godot/fetch)}
cpp=${GODOT_CPP:-$(tools/godot/fetch-cpp)}
lib=${LIBGODOT:-$(tools/godot/build-lib)}
mkdir -p "$out"
cmake -S examples/godot-zinc-ui/native -B "$out/bindings" -DGODOT_CPP="$cpp" -DCMAKE_BUILD_TYPE=Release
BUILD_DIR="$out/bindings" tools/build godot-cpp
ZN_AOT_CPP_ONLY=1 "$ZINC" build examples/zinc-libgodot -o "$out/navigation"
EMBED_LINK_FLAGS="-fvisibility=hidden -I$cpp/include -I$out/bindings/godot-cpp/gen/include -I$cpp/gdextension $out/bindings/bin/libgodot-cpp.macos.template_release.arm64.a" tools/link-embedded "$out/navigation" "$out/rally" examples/zinc-libgodot/native/host.mm
"$GODOT" --headless --path examples/zinc-libgodot/godot --script pack.gd -- "$out/rally.pck"
cp "$lib" "$out/libgodot.dylib"
printf 'Built: %s/rally (game pack and libgodot.dylib beside it)\n' "$out"
