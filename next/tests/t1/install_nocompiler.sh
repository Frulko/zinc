#!/bin/sh
# Nothing to compile for a beginner (ZN-718): tools/install.sh installs the archive of tools/package from a local directory (file://, with SHA256SUMS)
# into an empty HOME, and from that install, with an empty ZINC_HOME and a PATH that holds no compiler:
# - zinc new, zinc run (headless, a frame written), a type error with its file and line, zinc dev (start, an edit, the reload);
# - templates that import plugins with native code (system, svg, three) run: their libraries are the prebuilt ones of the archive;
# - zinc doctor counts the prebuilt plugin libraries and names the plugins without one;
# - nothing was compiled or fetched: the PATH holds shims of cc, c++, clang, gcc, cmake, zig, make, xcrun, ld, ar, pkg-config, git, node and python3
#   that write to a log and fail, links to the few /usr/bin tools the install and zinc use, and /bin; no toolchain is in ZINC_HOME at the end;
# - a wrong checksum installs nothing.
# ZINC_DIST names a directory that already holds the archive (tools/package --out <dir>); without it the archive is built here, which takes minutes
# when the plugins' libraries are not in the cache yet.
cd "$(dirname "$0")/../.." || exit 2
next=$PWD
fail=0
tmp=$(mktemp -d); trap 'kill $dev 2>/dev/null; rm -rf "$tmp"' EXIT
dev=
dist=${ZINC_DIST:-}
if [ -z "$dist" ]; then
  dist="$tmp/dist"
  tools/package --build "$(cd "$(dirname "$ZINC")" && pwd)" --out "$dist" >"$tmp/package.log" 2>&1 || { echo "tools/package failed: $(tail -c 400 "$tmp/package.log")"; exit 1; }
fi
case "$(uname -s)" in Darwin) pat='Zinc-*-macos-*.zip' ;; *) pat='zinc-*-linux-*.tar.gz' ;; esac
mkdir -p "$tmp/release" "$tmp/bin" "$tmp/shims" "$tmp/home" "$tmp/work"
cp "$dist"/$pat "$next/tools/install.sh" "$tmp/release/" || { echo "no archive ($pat) in $dist"; exit 1; }
(cd "$tmp/release" && shasum -a 256 $pat > SHA256SUMS) || exit 2

for t in cc c++ clang clang++ gcc g++ cmake zig make ninja xcrun xcodebuild ld ar ranlib pkg-config git node python3 brew; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/shim.log"\nexit 127\n' "$t" "$tmp" > "$tmp/shims/$t"; chmod +x "$tmp/shims/$t"
done
for t in curl shasum perl ditto unzip tar gzip uname grep sed head dirname basename mktemp tr cut env awk; do
  p=$(PATH=/usr/bin:/bin command -v "$t") && ln -s "$p" "$tmp/bin/$t"
done
clean() { env -i HOME="$tmp/home" ZINC_HOME="$tmp/home/zinc-home" PATH="$tmp/shims:$tmp/bin:/bin" "$@"; }

# a wrong checksum: nothing installed
mkdir "$tmp/bad" && cp "$tmp/release/"* "$tmp/bad/" && sed 's/^..../0000/' "$tmp/release/SHA256SUMS" > "$tmp/bad/SHA256SUMS"
clean ZINC_INSTALL_URL="file://$tmp/bad" ZINC_NO_MODIFY_PATH=1 sh "$tmp/release/install.sh" >"$tmp/out" 2>&1
[ $? -ne 0 ] && grep -q "checksum mismatch" "$tmp/out" && [ ! -e "$tmp/home/.zinc" ] && [ ! -e "$tmp/home/.local" ] || { echo "a wrong checksum is not refused: $(cat "$tmp/out")"; fail=1; }

# the install: one command
clean ZINC_INSTALL_URL="file://$tmp/release" ZINC_BIN_DIR="$tmp/home/.local/bin" SHELL=/bin/zsh sh "$tmp/release/install.sh" >"$tmp/out" 2>&1 || { echo "install.sh failed: $(cat "$tmp/out")"; exit 1; }
Z="$tmp/home/.local/bin/zinc"
[ -x "$Z" ] && grep -q '\.local/bin' "$tmp/home/.zprofile" || { echo "no zinc link or no PATH line: $(cat "$tmp/out")"; fail=1; }
real=$(cd "$tmp" && pwd -P)
case "$(clean "$Z" --root)" in "$real"/home/.zinc/engine/*) ;; *) echo "the engine files are not read from the install: $(clean "$Z" --root)"; fail=1 ;; esac

run() { clean ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=160x120 "$@"; }
cd "$tmp/work" || exit 2
[ "$(clean "$Z" new game my-game 2>&1)" = "created my-game (game); next: cd my-game && zinc run" ] || { echo "zinc new game fails from the install"; fail=1; }
cd my-game || exit 2
run ZINC_SHOT="$tmp/shot.png" "$Z" run >"$tmp/out" 2>"$tmp/err"
[ $? -eq 0 ] && [ -s "$tmp/shot.png" ] && [ ! -s "$tmp/err" ] || { echo "zinc run of the game template: $(head -c 400 "$tmp/err")"; fail=1; }
cp src/main.ts "$tmp/main.ts"
echo 'const lives: number = "three";' >> src/main.ts
run "$Z" run >"$tmp/out" 2>&1
[ $? -eq 1 ] && grep -q "src/main.ts:[0-9]*:[0-9]*: error Z0103: Type is not assignable: 'string' to 'f64'" "$tmp/out" || { echo "no type error with file and line: $(head -c 400 "$tmp/out")"; fail=1; }
cp "$tmp/main.ts" src/main.ts

# zinc dev: the program starts, an edit reloads it
waitfor() { n=0; while [ $n -lt $(( $3 * 20 )) ]; do grep -q "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
clean ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=200000 ZINC_SIZE=64x48 "$Z" dev >"$tmp/dev.log" 2>&1 &
dev=$!
waitfor "$tmp/dev.log" "v1 started" 10 || { echo "zinc dev does not start: $(head -c 400 "$tmp/dev.log")"; fail=1; }
sed 's/0x101820/0x204010/' "$tmp/main.ts" > src/main.ts
waitfor "$tmp/dev.log" "v2 started" 10 || { echo "zinc dev does not reload an edit: $(head -c 400 "$tmp/dev.log")"; fail=1; }
kill $dev 2>/dev/null; wait $dev 2>/dev/null; dev=

# plugins with native code, never built here: the prebuilt libraries of the archive
for t in desktop-app 3d game-2d dashboard; do
  cd "$tmp/work" && clean "$Z" new "$t" "p-$t" >/dev/null 2>&1 && cd "p-$t" || { echo "zinc new $t fails"; fail=1; continue; }
  run ZINC_SHOT="$tmp/$t.png" "$Z" run >"$tmp/out" 2>"$tmp/err"
  [ $? -eq 0 ] && [ -s "$tmp/$t.png" ] && [ ! -s "$tmp/err" ] || { echo "the $t template does not run from the install: $(head -c 400 "$tmp/err")"; fail=1; }
done
clean "$Z" plugin-build system "$tmp/work/p-desktop-app" >"$tmp/out" 2>&1
grep -q "^system prebuilt " "$tmp/out" || { echo "zinc:system is not loaded from its prebuilt library: $(head -c 300 "$tmp/out")"; fail=1; }

# zinc doctor: what has a prebuilt library and what has not
clean "$Z" doctor >"$tmp/doctor" 2>&1
grep -Eq "^plugin libraries for (macos|linux) \(this machine\): [1-9][0-9]* prebuilt" "$tmp/doctor" || { echo "zinc doctor does not count the prebuilt plugin libraries"; fail=1; }
grep -q "^    video: needs the system libraries libavformat" "$tmp/doctor" || { echo "zinc doctor does not name a plugin without a prebuilt library"; fail=1; }
grep -q "(by the manifests)" "$tmp/doctor" && grep -q "^plugin libraries for windows: none" "$tmp/doctor" || { echo "zinc doctor does not report the other platforms"; fail=1; }

# nothing was compiled, nothing was fetched
[ ! -s "$tmp/shim.log" ] || { echo "a compiler or a build tool was run: $(sort -u "$tmp/shim.log" | head -5 | tr '\n' ';')"; fail=1; }
[ ! -e "$tmp/home/zinc-home/toolchains" ] || { echo "a toolchain was downloaded: $(ls "$tmp/home/zinc-home/toolchains")"; fail=1; }
exit $fail
