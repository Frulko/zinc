#!/bin/sh
# Nothing to compile for a beginner (ZN-718): tools/install.sh installs the CLI archive of tools/package (and, on macOS, the Zinc Atelier app) from a
# local directory (file://, with SHA256SUMS) into an empty HOME, and from that install, through the `zinc` link, with an empty ZINC_HOME and a PATH that
# holds no compiler:
# - zinc new, zinc run (headless, a frame written), a type error with its file and line, zinc lint, zinc dev (start, an edit, the reload);
# - the CLI archive unpacked by hand anywhere else runs from a symlink with HOME empty and PATH=/usr/bin:/bin;
# - Atelier's sources check (zinc check), and the installed app opens headless from its launcher with the engine of its own bundle;
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
mac=0; case "$(uname -s)" in Darwin) mac=1; pat='zinc-*-macos-*.tar.gz Zinc-Atelier-*-macos-*.zip' ;; *) pat='zinc-*-linux-*.tar.gz' ;; esac
mkdir -p "$tmp/release" "$tmp/bin" "$tmp/shims" "$tmp/home" "$tmp/work"
for p in $pat; do cp "$dist"/$p "$tmp/release/" || { echo "no archive ($p) in $dist"; exit 1; }; done
cp "$next/tools/install.sh" "$tmp/release/" || exit 2
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

# the install: one command (and the app on macOS, into the test's HOME rather than /Applications)
clean ZINC_INSTALL_URL="file://$tmp/release" ZINC_BIN_DIR="$tmp/home/.local/bin" ZINC_INSTALL_ATELIER=$mac ZINC_APP_DIR="$tmp/home/Applications" SHELL=/bin/zsh \
  sh "$tmp/release/install.sh" >"$tmp/out" 2>&1 || { echo "install.sh failed: $(cat "$tmp/out")"; exit 1; }
Z="$tmp/home/.local/bin/zinc"
[ -x "$Z" ] && grep -q '\.local/bin' "$tmp/home/.zprofile" || { echo "no zinc link or no PATH line: $(cat "$tmp/out")"; fail=1; }
real=$(cd "$tmp" && pwd -P)
[ "$(clean "$Z" --root)" = "$real/home/.zinc/engine/share/zinc/next" ] || { echo "the engine files are not read from the install: $(clean "$Z" --root)"; fail=1; }
[ ! -e "$tmp/home/.zinc/engine/Zinc Atelier.app" ] || { echo "the CLI archive holds the app"; fail=1; }

# the CLI archive unpacked by hand anywhere, run through a symlink with HOME empty and PATH=/usr/bin:/bin
mkdir -p "$tmp/elsewhere/x" "$tmp/elsewhere/links" "$tmp/elsewhere/home" && tar -xzf "$tmp/release/"zinc-*.tar.gz -C "$tmp/elsewhere/x" && ln -s "$(echo "$tmp"/elsewhere/x/zinc-*/bin/zinc)" "$tmp/elsewhere/links/zinc"
printf 'console.log("hello", 6 * 7);\n' > "$tmp/elsewhere/hello.ts"
out=$(env -i HOME="$tmp/elsewhere/home" PATH=/usr/bin:/bin ZINC_STEPS=0 "$tmp/elsewhere/links/zinc" run "$tmp/elsewhere/hello.ts" 2>&1)
[ "$out" = "hello 42" ] || { echo "the CLI archive unpacked elsewhere does not run from a symlink: $(printf '%s' "$out" | head -c 300)"; fail=1; }

run() { clean ZINC_STEPS=0 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=160x120 "$@"; }
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
clean "$Z" lint >"$tmp/out" 2>&1 || { echo "zinc lint fails from the install: $(head -c 400 "$tmp/out")"; fail=1; }

# zinc dev: the program starts, an edit reloads it
waitfor() { n=0; while [ $n -lt $(( $3 * 20 * ${ZN_WAIT_SCALE:-1} )) ]; do grep -Eq "$2" "$1" 2>/dev/null && return 0; sleep 0.05; n=$((n+1)); done; return 1; }
env -i HOME="$tmp/home" ZINC_HOME="$tmp/home/zinc-home" PATH="$tmp/shims:$tmp/bin:/bin" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=200000 ZINC_SIZE=64x48 \
  "$Z" dev >"$tmp/dev.log" 2>&1 &   # not through clean(): $! must be zinc itself (env execs it), or the kill below leaves zinc dev running
dev=$!
waitfor "$tmp/dev.log" "v1 started" 10 || { echo "zinc dev does not start: $(head -c 400 "$tmp/dev.log")"; fail=1; }
sed 's/0x101820/0x204010/' "$tmp/main.ts" > src/main.ts
waitfor "$tmp/dev.log" "v2 started|v1 refreshed" 10 || { echo "zinc dev does not reload an edit: $(tail -c 700 "$tmp/dev.log")"; fail=1; }
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
clean "$Z" doctor --details >"$tmp/doctor" 2>&1
grep -Eq "^plugin libraries for (macos|linux) \(this machine\): [1-9][0-9]* prebuilt" "$tmp/doctor" || { echo "zinc doctor does not count the prebuilt plugin libraries"; fail=1; }
grep -q "^    video: needs the system libraries libavformat" "$tmp/doctor" || { echo "zinc doctor does not name a plugin without a prebuilt library"; fail=1; }
grep -q "(by the manifests)" "$tmp/doctor" && grep -q "^plugin libraries for windows: none" "$tmp/doctor" || { echo "zinc doctor does not report the other platforms"; fail=1; }

# Atelier from the install: its zinc.json (permissions, icon) travels with it, or it stops at Z5006 on a machine that is not this checkout
clean "$Z" check "$(clean "$Z" --root)/app/atelier" >"$tmp/atelier" 2>&1 || { echo "Atelier does not check from the install: $(head -c 300 "$tmp/atelier")"; fail=1; }
# the app as the Finder starts it (its launcher, a bare PATH): it opens on ZINC_PROJECT with the engine of its own bundle
if [ $mac = 1 ]; then
  A="$tmp/home/Applications/Zinc Atelier.app"
  [ "$(clean "$A/Contents/MacOS/zinc" --root)" = "$real/home/Applications/Zinc Atelier.app/Contents/Resources/zinc/next" ] || { echo "the app does not read its own engine files: $(clean "$A/Contents/MacOS/zinc" --root)"; fail=1; }
  clean ZINC_BACKGROUND=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_SIZE=800x500 ZINC_SHOT="$tmp/atelier.png" ZINC_SHOT_FRAMES=2 ZINC_PROJECT="$tmp/work/atelier" \
    "$A/Contents/MacOS/zinc-atelier" >/dev/null 2>"$tmp/err" && [ -s "$tmp/atelier-2.png" ] && [ -e "$tmp/work/atelier/hello.ts" ] || { echo "the app does not open from its launcher: $(head -c 300 "$tmp/err")"; fail=1; }
fi

# nothing was compiled, nothing was fetched
[ ! -s "$tmp/shim.log" ] || { echo "a compiler or a build tool was run: $(sort -u "$tmp/shim.log" | head -5 | tr '\n' ';')"; fail=1; }
[ ! -e "$tmp/home/zinc-home/toolchains" ] || { echo "a toolchain was downloaded: $(ls "$tmp/home/zinc-home/toolchains")"; fail=1; }
exit $fail
