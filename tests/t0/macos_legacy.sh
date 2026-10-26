#!/bin/sh
# The legacy runtime is opt-in; never rebuild or silently use the modern engine as its substitute.
set -eu
cd "$(dirname "$0")/../.."
[ "$(uname -s)" = Darwin ] || exit 77
core=${ZN_LEGACY_BINARY:-build/macos-legacy/zinc-legacy}
[ -x "$core" ] || { echo 'Build first: cmake -S targets/macos-legacy -B build/macos-legacy && BUILD_DIR=build/macos-legacy tools/build zinc-core'; exit 77; }
case $core in /*) ;; *) core=$PWD/$core ;; esac
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
[ "$(lipo -archs "$core")" = x86_64 ]
otool -l "$core" | awk '/LC_VERSION_MIN_MACOSX/ { old=1 } old && /version 10.12$/ { found=1 } END { exit !found }'
! otool -L "$core" | grep -E 'SDL|JavaScriptCore|Metal|/opt/homebrew|/usr/local'
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for example in hello bouncing-ball; do
  mkdir "$tmp/$example"
  "$Z" pack "examples/$example" -o "$tmp/$example.zapp" >"$tmp/pack.log" 2>&1 || { cat "$tmp/pack.log"; exit 1; }
  tar -xf "$tmp/$example.zapp" -C "$tmp/$example"
  ZINC_HEADLESS=1 ZINC_FRAMES=60 ZINC_FRAMEHASH=last "$Z" run --interp "examples/$example" >"$tmp/want" 2>&1
  ZINC_HEADLESS=1 ZINC_FRAMES=60 ZINC_FRAMEHASH=last "$core" "$tmp/$example/program.zbc" >"$tmp/framed" 2>&1
  sed '1d;$d' "$tmp/framed" >"$tmp/got"
  diff -u "$tmp/want" "$tmp/got"
done
printf 'invalid bytecode' >"$tmp/invalid.zbc"
status=0
ZINC_HEADLESS=1 "$core" "$tmp/invalid.zbc" >"$tmp/error" 2>&1 || status=$?
[ "$status" = 2 ]
grep -q 'zinc:exit 2' "$tmp/error"
echo 'macOS legacy: Intel 10.12 binary, output/pixels and invalid-bytecode rejection ok'
