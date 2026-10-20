#!/bin/sh
# Single-app packaging (ZN-053): the downloads of tools/package are unpacked on a "clean machine" (empty HOME, PATH=/bin, no ZINC_* variables,
# no checkout in reach): the CLI archive must run a program, build for a Pi, build for this machine without a C++ compiler, and run on the
# emulated ESP32, downloading its tools on the way; the app (macOS) must open. Needs the network the first time (zig, QEMU: about 100 MB).
# ZINC_DIST names a directory that already holds the archives (tools/package --out <dir>); without it they are built here.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
dist=${ZINC_DIST:-$tmp/dist}
if [ -z "${ZINC_DIST:-}" ]; then
  tools/package --build "$(dirname "$ZINC")" --out "$dist" >/dev/null 2>"$tmp/err" || { echo "tools/package failed: $(tail -c 300 "$tmp/err")"; exit 1; }
fi
case "$(uname -s)" in Darwin) os=macos ;; *) os=linux ;; esac
(cd "$tmp" && tar -xzf "$dist"/zinc-*-$os-*.tar.gz) || { echo "no CLI archive in $dist"; exit 1; }
Z=$(echo "$tmp"/zinc-*/bin/zinc)
APP=
if [ $os = macos ]; then
  (cd "$tmp" && ditto -x -k "$dist"/Zinc-Atelier-*-macos-*.zip .) || { echo "no app archive in $dist"; exit 1; }
  APP="$tmp/Zinc Atelier.app/Contents/MacOS/zinc-atelier"
fi
mkdir -p "$tmp/home" "$tmp/work"
clean() { env -i HOME="$tmp/home" PATH=/usr/bin:/bin ZINC_STEPS=0 "$@"; }
cd "$tmp/work" || exit 2
printf 'console.log("hello", 6 * 7);\n' > hello.ts
real=$(cd "$tmp" && pwd -P)
case "$(clean "$Z" --root)" in "$real"/zinc-*/share/zinc/next) ;; *) echo "the engine files are not read from the package: $(clean "$Z" --root)"; fail=1 ;; esac
out=$(clean "$Z" run hello.ts 2>&1); [ "$out" = "hello 42" ] || { echo "hello.ts does not run from the package: $(printf '%s' "$out" | head -c 600)"; fail=1; }
if [ -n "$APP" ]; then
  clean ZINC_BACKGROUND=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_SIZE=800x500 ZINC_SHOT="$tmp/work/atelier.png" ZINC_SHOT_FRAMES=2 ZINC_PROJECT="$tmp/work" "$APP" >/dev/null 2>"$tmp/err" \
    && [ -s "$tmp/work/atelier-2.png" ] || { echo "the app does not open from the package: $(head -c 300 "$tmp/err")"; fail=1; }
fi
clean "$Z" build --target aarch64-linux hello.ts -o hello-pi >/dev/null 2>"$tmp/err"
[ "$(head -c 4 hello-pi 2>/dev/null | od -An -c | tr -d ' ')" = '177ELF' ] || { echo "no aarch64 program from the package: $(tail -c 300 "$tmp/err")"; fail=1; }
clean "$Z" build hello.ts -o hello-here >/dev/null 2>"$tmp/err"
[ "$(./hello-here 2>&1)" = "hello 42" ] || { echo "a build for this machine without a C++ compiler fails: $(tail -c 300 "$tmp/err")"; fail=1; }
[ "$(clean "$Z" run hello.ts --target esp32 --qemu 2>"$tmp/err")" = "hello 42" ] || { echo "hello.ts does not run on the emulated ESP32 from the package: $(tail -c 300 "$tmp/err")"; fail=1; }
exit $fail
