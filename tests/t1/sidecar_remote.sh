#!/bin/sh
# examples/webview/sidecar-browser, the tablet's side, used from the Mac as the Control pad does ("ptr" orders on stdin): the Kenney pointer goes to
# the screen where the mouse is, takes the shape the page's CSS asks for, goes away when idle, and a click and a key reach the page.
[ "$(uname)" = Darwin ] || exit 0   # WKWebView off screen
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
unset ZINC_HEADLESS ZINC_DETERMINISTIC ZINC_ASSETS ZINC_PACKS   # a real WKWebView, on a screen of its own
export ZINC_FRAMES=1000000000
tmp=$(mktemp -d); trap 'kill $screen 2>/dev/null; [ -z "$clip" ] || pbcopy < "$tmp/clip"; rm -rf "$tmp"' EXIT
# the Mac's clipboard is used for real and put back; holding more than text (a picture, files) it would be lost, so that part waits
clip=; case "$(osascript -e 'clipboard info' 2>/dev/null)" in *picture*|*furl*|*TIFF*|*PNG*) ;; *) clip=1; pbpaste > "$tmp/clip"; printf 'fromMac' | pbcopy ;; esac
cp -R examples/webview/sidecar-browser "$tmp/app"
cat > "$tmp/app/assets/pointer.html" <<'H'
<!doctype html><meta charset="utf-8"><body style="margin:0">
<textarea id="t" autofocus style="position:fixed;left:0;top:0;width:40%;height:50%"></textarea>
<a id="a" href="#" style="position:fixed;left:50%;top:0;right:0;bottom:0;background:green;cursor:pointer">x</a>
<script>
document.getElementById('a').addEventListener('click', function (e) {
  e.preventDefault();
  location.href = 'zinc://app/start.html?typed=' + encodeURIComponent(document.getElementById('t').value);
});
</script>
H
python3 "$root/tests/native/sidecar/ack_screen.py" > "$tmp/screen" & screen=$!
while [ ! -s "$tmp/screen" ]; do sleep 0.1; done
( sleep 5; echo "go zinc://app/pointer.html"; sleep 2
  echo "ptr 7 0.2 0.2 0 0"; sleep 1          # over the field: the I-beam
  echo "ptr 0 0.2 0.2 0 0"; echo "ptr 1 0.2 0.2 0 0"; sleep 0.5
  printf 'key KeyZ\t0\tz\n'; sleep 0.5
  if [ -n "$clip" ]; then
    printf 'key KeyV\t8\t\n'; sleep 0.5                 # ⌘V: what the Mac copied, after the z
    printf 'key KeyA\t8\t\n'; printf 'key KeyC\t8\t\n'; sleep 0.5    # ⌘A ⌘C: the page's text on the Mac
    pbpaste > "$tmp/copied"
    printf 'key ArrowRight\t0\t\n'; printf 'key KeyV\t8\t\n'; sleep 0.5    # after the selection: it doubles
  fi
  echo "ptr 7 0.75 0.5 0 0"; sleep 1         # over the link: the hand
  echo "ptr 0 0.75 0.5 0 0"; echo "ptr 1 0.75 0.5 0 0"; sleep 5    # the click loads a page; the pointer goes after 3 s
) | SIDECAR_BROWSER_ROLE=screen ZINC_DISPLAY=sidecar ZINC_SIDECAR=127.0.0.1:$(head -1 "$tmp/screen") timeout 50 "$ZINC" run "$tmp/app" > "$tmp/out" 2>&1
fail=0
check() { grep -q -- "$1" "$2" || { echo "sidecar_remote: no '$1' ($3)"; fail=1; }; }
check "POINTER 288 180 1" "$tmp/screen" "the pointer over the field"
check "POINTER 1080 450 1" "$tmp/screen" "the pointer over the link"
check "POINTER 1080 450 0" "$tmp/screen" "the idle pointer goes"
check "CURSOR 14 32 7 16 " "$tmp/screen" "the I-beam over a field"
check "CURSOR 32 32 8 0 " "$tmp/screen" "the hand over a link"
if [ -n "$clip" ]; then
  check "start.html?typed=zfromMaczfromMac" "$tmp/out" "⌘V from the Mac's clipboard, ⌘A and ⌘C, ⌘V again"
  check "zfromMac" "$tmp/copied" "⌘C reaches the Mac's clipboard"
else
  check "start.html?typed=z" "$tmp/out" "the click on the link, with the key typed in the field"
fi
[ $fail = 0 ] || { grep -E "display-sidecar:|^load|rror" "$tmp/out" | tail -8 | cut -c1-160; cat "$tmp/screen"; }
exit $fail
