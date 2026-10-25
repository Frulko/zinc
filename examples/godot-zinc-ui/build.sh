#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
root=$PWD
out="$root/examples/godot-zinc-ui/build"
ZINC=${ZINC:-$root/build/zinc}
cpp=${GODOT_CPP:-$(tools/godot/fetch-cpp)}
cmake -S examples/godot-zinc-ui/native -B "$out" -DGODOT_CPP="$cpp" -DZINC_ROOT="$root" -DCMAKE_BUILD_TYPE=Release
BUILD_DIR="$out" tools/build godot-cpp
ZN_AOT_CPP_ONLY=1 "$ZINC" build examples/godot-zinc-ui -o "$out/ui"
mkdir -p examples/godot-zinc-ui/godot/bin
BUILD=${BUILD:-$root/build} python3 examples/godot-zinc-ui/native/private_sdl.py "$out/host-link"
BUILD="$out/host-link" EMBED_LINK_FLAGS="-dynamiclib -fvisibility=hidden -Wl,-exported_symbol,_zinc_library_init -Wl,-install_name,@rpath/libzinc_godot.dylib -I$cpp/include -I$out/godot-cpp/gen/include -I$cpp/gdextension -I$root/runtime/include $out/bin/libgodot-cpp.macos.template_release.arm64.a" tools/link-embedded "$out/ui" "$root/examples/godot-zinc-ui/godot/bin/libzinc_godot.dylib" examples/godot-zinc-ui/native/zinc_control.cpp
printf 'Built: examples/godot-zinc-ui/godot/bin/libzinc_godot.dylib\n'
