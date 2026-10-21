#!/bin/sh
# Adds scenes to examples/js-spline/assets/scenes, where pick.sh lists them:
#   examples/js-spline/fetch.sh <link> [name]   ...or several links, one per line, on stdin: fetch.sh < links.txt
# A link is what Spline's Export panel gives: a code export (https://prod.spline.design/<id>/scene.splinecode) or a public URL
# (https://my.spline.design/<name>-<id>/), whose page holds the scene's bytes (app.start([...])) or names its file. The name defaults to the link's.
here=$(cd "$(dirname "$0")" && pwd)
dir=${SPLINE_SCENES:-$here/assets/scenes}   # SPLINE_SCENES=<dir>: into another folder
mkdir -p "$dir"
fail=0

fetch() {   # fetch <link> [name]
  link=$1; name=$2
  case "$link" in
    https://prod.spline.design/*/scene.splinecode) scene=$link ;;
    https://my.spline.design/*)
      [ -n "$name" ] || name=$(printf '%s' "$link" | sed -E 's#https://my\.spline\.design/##; s#/.*##; s#-[A-Za-z0-9]{20,}$##')
      page="$dir/.page.$$"
      curl -fsSL --max-time 60 -o "$page" "$link" || { rm -f "$page"; echo "fetch: cannot open $link"; return 1; }
      # the page of a public URL starts the runtime with the scene itself: app.start([212,114,...]); write those bytes as the file
      if python3 -c 'import re,sys; m=re.search(r"app\.start\(\[([0-9,\s]+)\]", open(sys.argv[1], encoding="utf-8", errors="replace").read()); m or sys.exit(1); open(sys.argv[2], "wb").write(bytes(int(x) for x in m.group(1).split(",") if x.strip()))' "$page" "$dir/$name.splinecode.part" 2>/dev/null; then
        rm -f "$page"; mv "$dir/$name.splinecode.part" "$dir/$name.splinecode"
        echo "fetch: $name ($(wc -c < "$dir/$name.splinecode" | tr -d ' ') bytes) from $link"
        return 0
      fi
      rm -f "$dir/$name.splinecode.part"
      scene=$(grep -oE 'https://prod\.spline\.design/[A-Za-z0-9_-]+/scene\.splinecode' "$page" | head -1)
      rm -f "$page"
      [ -n "$scene" ] || { echo "fetch: $link holds no scene (a public URL made before 2022 is in an older format): export the scene again"; return 1; } ;;
    *) echo "fetch: $link is not a Spline export link (https://prod.spline.design/<id>/scene.splinecode or https://my.spline.design/...)"; return 1 ;;
  esac
  [ -n "$name" ] || name=$(printf '%s' "$scene" | sed -E 's#https://prod\.spline\.design/([^/]+)/.*#\1#')
  name=$(printf '%s' "$name" | tr -c 'A-Za-z0-9_-' '-' | sed 's/-*$//')
  curl -fsSL --max-time 120 -o "$dir/$name.splinecode.part" "$scene" || { rm -f "$dir/$name.splinecode.part"; echo "fetch: cannot download $scene"; return 1; }
  mv "$dir/$name.splinecode.part" "$dir/$name.splinecode"
  echo "fetch: $name ($(wc -c < "$dir/$name.splinecode" | tr -d ' ') bytes) from $scene"
}

if [ $# -gt 0 ]; then
  fetch "$1" "${2:-}" || fail=1
else
  while read -r link name; do
    [ -n "$link" ] || continue
    case "$link" in \#*) continue ;; esac
    fetch "$link" "$name" || fail=1
  done
fi
exit $fail
