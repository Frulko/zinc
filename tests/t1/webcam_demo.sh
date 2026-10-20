#!/bin/sh
# The webcam demo (examples/webcam) on the fake camera, headless and deterministic: each state renders to its recorded frame hash
# (tests/golden/webcam-demo/hashes.txt: name, input, permission, scheme, frames, window size, hash; the size classes: "wide" at 1440x900,
# "medium" at 800x600 with four fake cameras, "phone" at 390x844 in portrait with touch targets and four cameras, the rest at 1040x680)
# and the scripted sessions print their recorded lines
# (session.out, WEBCAM_LOG=1): the preview, fit and fill, mirror, brightness and contrast (each a different frame), 1280x720 then 15 fps and
# the camera switch, the HUD's fps, a photo saved as a 640x480 PNG in the Photos folder, the strip and the viewer, delete, the denied and
# "Allow the camera" screens (WEBCAM_DEMO_PERMISSION) and their buttons. The app draws at the camera's rate, not the screen's (a lazy
# preview: 30 previews a second at 30 fps) and a camera frame never re-renders React (0 renders a second once live).
# No real camera is opened and no system question is asked.
# ZN_UPDATE_GOLDEN=1 records the hashes and session.out again.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
app=$PWD/examples/webcam; golden=$PWD/tests/golden/webcam-demo
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# run <name> <frames> <input|-> <permission|-> <scheme> <size>: one run on a fresh storage folder ($tmp/<name>), the Photos folder under it
run() {
  rm -rf "$tmp/$1"; mkdir -p "$tmp/$1"
  inp=; [ "$3" = - ] || inp=$golden/$3.input
  perm=; [ "$4" = - ] || perm=$4
  cams=1; pointer=
  case $1 in medium) cams=4 ;; phone) cams=4; pointer=touch ;; esac
  (cd "$app" && env ZINC_STORAGE="$tmp/$1/s.kv" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FAKE_CAMERA=$cams ZINC_SCALE=1 ZINC_SIZE=$6 \
    ZINC_FRAMES=$2 ZINC_FRAMEHASH=last ZINC_SCHEME=$5 WEBCAM_LOG=1 ${inp:+ZINC_INPUT=$inp} ${perm:+WEBCAM_DEMO_PERMISSION=$perm} ${pointer:+ZINC_POINTER=$pointer} \
    timeout 120 "$ZINC" run . 2>&1 < /dev/null)
}
hash() { echo "$1" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }

: > "$tmp/hashes"; : > "$tmp/session"
while read -r name input perm scheme frames size want; do
  out=$(run "$name" "$frames" "$input" "$perm" "$scheme" "$size")
  got=$(hash "$out")
  echo "$name $input $perm $scheme $frames $size $got" >> "$tmp/hashes"
  echo "$out" | grep -vE '^  |^zinc' | sed "s/^/$name: /" >> "$tmp/session"
  eval "h_$name=\$got"
  [ "$got" = "$want" ] || { [ -n "$ZN_UPDATE_GOLDEN" ] || echo "webcam demo $name: ${got:-no frame hash}, recorded $want$(echo "$out" | grep -iE 'error|failed' | head -2 | sed 's/^/ | /')"; fail=1; }
  case $name in
    viewer)   # the shot: a 640x480 PNG named by the time it was taken
      png=$(ls "$tmp/viewer/webcam/Photos/"photo-*.png 2>/dev/null | head -1)
      size=$([ -n "$png" ] && python3 -c "import struct,sys; d=open(sys.argv[1],'rb').read(24); print('%dx%d' % struct.unpack('>II', d[16:24]) if d[:8] == b'\x89PNG\r\n\x1a\n' else 'not a png')" "$png")
      [ "$size" = 640x480 ] || { echo "webcam demo: the photo is ${size:-missing} ($png)"; fail=1; } ;;
    delete)   # two shots, one deleted from the viewer: one file left
      n=$(ls "$tmp/delete/webcam/Photos/" 2>/dev/null | grep -c '\.png$')
      [ "$n" = 1 ] || { echo "webcam demo: $n photos left after deleting one of two"; fail=1; } ;;
    format)   # the HUD's measured rate follows the asked one (30, then 15 fps)
      last=$(echo "$out" | sed -n 's/^fps \([0-9]*\).*/\1/p' | tail -1)
      [ -n "$last" ] && [ "$last" -ge 13 ] && [ "$last" -le 16 ] || { echo "webcam demo: measured ${last:-no} fps at 15 fps"; fail=1; } ;;
    live)   # once live, each second draws as many previews as the camera gave frames (the window sleeps in between) and renders nothing
      echo "$out" | sed -n 's/^fps \([0-9]*\), \([0-9]*\) previews drawn, \([0-9]*\) renders$/\1 \2 \3/p' | tail -1 | {
        read -r fps drawn renders
        [ -n "$fps" ] && [ "$drawn" -le $((fps + 2)) ] && [ "$renders" -eq 0 ] || { echo "webcam demo: ${drawn:-?} previews drawn and ${renders:-?} renders in a second at ${fps:-?} fps"; exit 1; }
      } || fail=1 ;;
  esac
done < "$golden/hashes.txt"
# the adjustments change what the camera delivers
for n in cover mirror bright contrast; do
  eval "h=\$h_$n"
  [ -n "$h" ] && [ "$h" != "$h_live" ] || { echo "webcam demo: $n draws the same frame as the plain preview"; fail=1; }
done
# the compiled program draws what the interpreter draws (one hash); the getUserMedia page opens the same camera through navigator.mediaDevices
got=$(hash "$(cd "$app" && ZINC_STORAGE="$tmp/n.kv" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FAKE_CAMERA=1 ZINC_SCALE=1 ZINC_SIZE=1040x680 ZINC_FRAMES=130 \
  ZINC_FRAMEHASH=last ZINC_SCHEME=light timeout 300 "$ZINC" run --native . 2>&1 < /dev/null)")
[ "$got" = "$h_live" ] || { echo "webcam demo compiled: ${got:-no frame hash}, the interpreter drew $h_live"; fail=1; }
out=$(cd "$app" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FAKE_CAMERA=1 ZINC_FRAMES=10 timeout 120 "$ZINC" run src/web.tsx 2>&1 < /dev/null | grep '^getUserMedia')
[ "$out" = "getUserMedia: video Zinc Fake Camera 640x480 live" ] || { echo "webcam demo getUserMedia page: ${out:-no stream}"; fail=1; }
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/hashes" "$golden/hashes.txt"; cp "$tmp/session" "$golden/session.out"; echo "webcam demo: goldens recorded"; exit 0; fi
cmp -s "$tmp/session" "$golden/session.out" || { echo "webcam demo sessions differ:"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
[ $fail -eq 0 ] && echo "webcam demo: ok"
exit $fail
