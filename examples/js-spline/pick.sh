#!/bin/sh
# Lists the scenes of examples/js-spline (assets/scenes, the showcase of assets/showcase, then those of assets/scenes-wasm) and runs the one you
# choose; `d` downloads the showcase (showcase.txt): examples/js-spline/pick.sh   (ZINC=<binary> to use another engine build)
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
zinc=${ZINC:-$root/build/zinc}
[ -x "$zinc" ] || { echo "pick: no engine at $zinc (build it with tools/build zinc, or set ZINC)" >&2; exit 1; }
"$root/tools/test-lib" spline-runtime-2.0.98 > /dev/null || exit 1   # Spline's runtime, downloaded once

scenes() {   # the scenes, in the order they are listed
  set -- "$here/assets/scene.splinecode" "$here"/assets/scenes/*.splinecode
  for f in "$here"/assets/showcase/*.splinecode "$here"/assets/scenes-wasm/*.splinecode; do [ -f "$f" ] && set -- "$@" "$f"; done   # the scenes that need WebAssembly last
  printf '%s\n' "$@"
}
while :; do
  set -- $(scenes)   # (no spaces in the paths of assets/)
  echo
  i=0
  for f in "$@"; do
    i=$((i + 1))
    name=$(basename "$f" .splinecode)
    [ "$name" = scene ] && name="robot (the default)"
    case "$f" in */scenes-wasm/*) name="$name   (needs WebAssembly: not on QuickJS)" ;; */showcase/*) name="$name   (showcase)" ;; esac
    printf '  %2d  %s\n' "$i" "$name"
  done
  ls "$here"/assets/showcase/*.splinecode > /dev/null 2>&1 || printf '   d  download the showcase: %d more scenes from my.spline.design (about 18 MB)\n' "$(grep -c '^https' "$here/showcase.txt")"
  printf '\nScene to run (1-%d, q to quit): ' "$#"
  read -r choice || exit 0
  case "$choice" in
    q|Q) exit 0 ;;
    d|D) SPLINE_SCENES="$here/assets/showcase" "$here/fetch.sh" < "$here/showcase.txt"; continue ;;
    ''|*[!0-9]*) echo "pick: type a number from 1 to $#"; continue ;;
  esac
  [ "$choice" -ge 1 ] && [ "$choice" -le "$#" ] || { echo "pick: type a number from 1 to $#"; continue; }
  eval "scene=\${$choice}"
  echo "running $(basename "$scene") (close the window to come back here)"
  SPLINE_SCENE="$scene" "$zinc" run "$here"
done
