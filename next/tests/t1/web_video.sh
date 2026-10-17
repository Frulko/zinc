#!/bin/sh
# zinc:video and zinc:lottie on the web target (docs/targets/web.md, "Video", "Lottie"), in headless Chrome by tools/web-video-test: the page holds the browser's own <video> (VP9 and AV1 WebM
# fixtures, which Chrome without proprietary codecs plays), the Player's API drives it (play, pause, seek, volume, rate, controls, next), a file no browser plays shows a message and a
# download link; lottie-web is loaded the first time an animation is drawn and puts an <svg> in the node's box that follows the Player. The export warns about the codecs a browser of the
# target set cannot play (W0604), and the same programs run on a canvas render. Skipped (77) without Chrome or python3. Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_video: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_video: no Chrome"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export tests/fixtures/web-video --target web --render dom -o "$tmp/video" >"$tmp/video.log" 2>&1 || { echo "web_video: the video export failed: $(cat "$tmp/video.log")"; exit 1; }
grep -q "W0604: assets/clip-legacy.avi" "$tmp/video.log" || { echo "web_video: no W0604 for the AVI: $(cat "$tmp/video.log")"; fail=1; }
grep -q "W0604: codecHEVC" "$tmp/video.log" || { echo "web_video: no W0604 for the HEVC file"; fail=1; }
grep -q "W0604: codecAV1" "$tmp/video.log" || { echo "web_video: no W0604 for the AV1 file"; fail=1; }
[ ! -f "$tmp/video/clip-vp9.webm" ] && ls "$tmp"/video/assets/clip-vp9.*.webm >/dev/null 2>&1 || { echo "web_video: the video is not published as a file of its own"; fail=1; }
"$Z" export tests/fixtures/web-lottie --target web --render dom -o "$tmp/lottie" >"$tmp/lottie.log" 2>&1 || { echo "web_video: the lottie export failed: $(cat "$tmp/lottie.log")"; exit 1; }
ls "$tmp"/lottie/lottie-svg.*.js >/dev/null 2>&1 || { echo "web_video: lottie-web (svg) is not in the export"; fail=1; }
ls "$tmp"/lottie/lottie-canvas.*.js >/dev/null 2>&1 && { echo "web_video: the DOM render ships the canvas build of lottie-web"; fail=1; }
check() {   # <name> <dir> <what>
  python3 -I tools/web-video-test "$3" "$2" >"$tmp/$1.out" 2>"$tmp/$1.err"
  rc=$?
  [ $rc -eq 77 ] && exit 77
  python3 -I -c '
import json, sys
try: o = json.load(open(sys.argv[1]))
except Exception: sys.exit("web_video: %s: no result: %s" % (sys.argv[3], open(sys.argv[2]).read()[:400]))
bad = ["%s %s" % (n, d) for n, ok, d in o["checks"] if not ok]
if bad: sys.exit("web_video: %s: %d of %d checks failed: %s" % (sys.argv[3], len(bad), len(o["checks"]), "; ".join(bad)[:900]))' "$tmp/$1.out" "$tmp/$1.err" "$3" || fail=1
}
check video "$tmp/video" video
check lottie "$tmp/lottie" lottie
# the same programs on a canvas render: the video's frames are drawn, the animation is drawn by the canvas build
"$Z" export tests/fixtures/web-video --target web --render canvas -o "$tmp/vc" >/dev/null 2>&1 || { echo "web_video: the canvas video export failed"; exit 1; }
python3 -I tools/web-browser-test "$tmp/vc" --wait 3 --size 900x500 >"$tmp/vc.out" 2>&1 || { echo "web_video: the canvas video page failed: $(cut -c1-300 "$tmp/vc.out")"; fail=1; }
grep -q '"nonblank": 0\.[0-9]*[1-9]' "$tmp/vc.out" || { echo "web_video: the canvas render drew nothing: $(cut -c1-300 "$tmp/vc.out")"; fail=1; }
grep -q '"errors": \[\]' "$tmp/vc.out" || { echo "web_video: errors on the canvas render: $(cut -c1-300 "$tmp/vc.out")"; fail=1; }
"$Z" export tests/fixtures/web-lottie --target web --render canvas -o "$tmp/lc" >/dev/null 2>&1 || { echo "web_video: the canvas lottie export failed"; exit 1; }
ls "$tmp"/lc/lottie-canvas.*.js >/dev/null 2>&1 || { echo "web_video: the canvas build of lottie-web is not in the canvas export"; fail=1; }
ls "$tmp"/lc/lottie-svg.*.js >/dev/null 2>&1 && { echo "web_video: the canvas render ships the svg build of lottie-web"; fail=1; }
python3 -I tools/web-browser-test "$tmp/lc" --wait 3 --size 500x400 --eval "typeof window.lottie" >"$tmp/lc.out" 2>&1 || { echo "web_video: the canvas lottie page failed: $(cut -c1-300 "$tmp/lc.out")"; fail=1; }
grep -q '"eval": "object"' "$tmp/lc.out" || { echo "web_video: lottie-web was not loaded on the canvas render: $(cut -c1-300 "$tmp/lc.out")"; fail=1; }
grep -q '"errors": \[\]' "$tmp/lc.out" || { echo "web_video: errors on the canvas lottie render: $(cut -c1-300 "$tmp/lc.out")"; fail=1; }
exit $fail
