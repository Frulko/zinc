#!/bin/sh
# Single-app packaging (ZN-053): the package of tools/package is unpacked on a "clean machine" (empty HOME, PATH=/bin, no ZINC_* variables,
# no checkout in reach) and must run a program, open the app, build for a Pi, build for this machine without a C++ compiler, and run on the
# emulated ESP32, downloading its tools on the way. Needs the network the first time (zig, QEMU: about 100 MB).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tools/package --build "$(dirname "$ZINC")" --out "$tmp/dist" >/dev/null 2>"$tmp/err" || { echo "tools/package failed: $(tail -c 300 "$tmp/err")"; exit 1; }
case "$(uname -s)" in
  Darwin) (cd "$tmp" && unzip -q dist/Zinc-*-macos-*.zip) ; Z="$tmp/Zinc Atelier.app/Contents/MacOS/zinc"; APP="$tmp/Zinc Atelier.app/Contents/Resources/zinc/next/app/atelier/main.tsx" ;;
  *) (cd "$tmp" && tar -xzf dist/zinc-*-linux-*.tar.gz) ; Z=$(echo "$tmp"/zinc-*/bin/zinc); APP=$(echo "$tmp"/zinc-*/share/zinc/next/app/atelier/main.tsx) ;;
esac
mkdir -p "$tmp/home" "$tmp/work"
clean() { env -i HOME="$tmp/home" PATH=/usr/bin:/bin "$@"; }
cd "$tmp/work" || exit 2
printf 'console.log("hello", 6 * 7);\n' > hello.ts
real=$(cd "$tmp" && pwd -P)
case "$(clean "$Z" --root)" in "$real"/*) ;; *) echo "the engine files are not read from the package: $(clean "$Z" --root)"; fail=1 ;; esac
[ "$(clean "$Z" run hello.ts 2>&1)" = "hello 42" ] || { echo "hello.ts does not run from the package"; fail=1; }
clean ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_SIZE=800x500 ZINC_SHOT="$tmp/work/atelier.png" ZINC_SHOT_FRAMES=2 "$Z" run "$APP" -- "$tmp/work" >/dev/null 2>"$tmp/err" \
  && [ -s "$tmp/work/atelier-2.png" ] || { echo "the app does not open from the package: $(head -c 300 "$tmp/err")"; fail=1; }
clean "$Z" build --target aarch64-linux hello.ts -o hello-pi >/dev/null 2>"$tmp/err"
[ "$(head -c 4 hello-pi 2>/dev/null | od -An -c | tr -d ' ')" = '177ELF' ] || { echo "no aarch64 program from the package: $(tail -c 300 "$tmp/err")"; fail=1; }
clean "$Z" build hello.ts -o hello-here >/dev/null 2>"$tmp/err"
[ "$(./hello-here 2>&1)" = "hello 42" ] || { echo "a build for this machine without a C++ compiler fails: $(tail -c 300 "$tmp/err")"; fail=1; }
[ "$(clean "$Z" run hello.ts --target esp32 --qemu 2>"$tmp/err")" = "hello 42" ] || { echo "hello.ts does not run on the emulated ESP32 from the package: $(tail -c 300 "$tmp/err")"; fail=1; }
exit $fail
