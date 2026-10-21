#!/bin/sh
# Lists the scenes of examples/js-spline and runs the one you choose: examples/js-spline/pick.sh   (ZINC=<binary> to use another engine build)
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../.." && pwd)
zinc=${ZINC:-$root/build/zinc}
[ -x "$zinc" ] || { echo "pick: no engine at $zinc (build it with tools/build zinc, or set ZINC)" >&2; exit 1; }
"$root/tools/test-lib" spline-runtime-2.0.98 > /dev/null || exit 1   # Spline's runtime, downloaded once

set -- "$here/assets/scene.splinecode" "$here"/assets/scenes/*.splinecode
while :; do
  echo
  i=0
  for f in "$@"; do
    i=$((i + 1))
    name=$(basename "$f" .splinecode)
    [ "$name" = scene ] && name="robot (the default)"
    printf '  %2d  %s\n' "$i" "$name"
  done
  printf '\nScene to run (1-%d, q to quit): ' "$#"
  read -r choice || exit 0
  case "$choice" in q|Q) exit 0 ;; esac
  case "$choice" in ''|*[!0-9]*) echo "pick: type a number from 1 to $#"; continue ;; esac
  [ "$choice" -ge 1 ] && [ "$choice" -le "$#" ] || { echo "pick: type a number from 1 to $#"; continue; }
  eval "scene=\${$choice}"
  echo "running $(basename "$scene") (close the window to come back here)"
  SPLINE_SCENE="$scene" "$zinc" run "$here"
done
