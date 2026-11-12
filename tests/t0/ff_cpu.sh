#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
sdl=${ZN_FF_SDL_LIB:-$(dirname "${ZINC:-build/zinc}")/third_party/SDL3/libSDL3.a}
[ -f "$sdl" ] || { echo 'ff CPU: SDL3 archive missing (set ZN_FF_SDL_LIB)'; exit 77; }
case $(uname -s) in
  Darwin) set -- -Wl,-dead_strip -framework Cocoa -framework IOKit -framework CoreVideo -framework CoreMedia -framework ForceFeedback -framework Carbon -framework Foundation -framework GameController -framework Metal -framework QuartzCore -weak_framework UniformTypeIdentifiers -weak_framework CoreHaptics ;;
  *) set -- -Wl,--gc-sections -lm -ldl -pthread ;;
esac
"${CXX:-c++}" -std=c++20 -O1 -Wall -Wextra -Wno-missing-field-initializers -DZRT_HOSTED_CPP -DZN_SDL_NO_DYNAPI \
  -ffunction-sections -fdata-sections -Iinclude -Iruntime -Iruntime/include -Ithird_party/SDL3/include \
  tests/native/ff_cpu.cpp targets/console/ff_cpu.cpp targets/console/ff_replay.cpp runtime/raster.cpp \
  "$sdl" "$@" -o "$tmp/check"
"$tmp/check"
