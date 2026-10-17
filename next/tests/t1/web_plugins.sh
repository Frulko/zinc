#!/bin/sh
# The plugins of the web target (docs/targets/web.md, "Plugins"), end to end in headless Chrome with its fake camera and microphone: examples/webrtc-call runs unchanged (a real
# WebRTC loopback call: zinc:camera, zinc:microphone, zinc:webrtc, zinc:audio, zinc:svg icons) and says so in its text; a fixture opens zinc:camera and zinc:microphone directly
# (frames and blocks flow, a snapshot has the size); another plays a tone, a stream and PCM through zinc:audio. DOM mode, so the page's text is the app's text.
# Skipped (77) without Chrome or python3. Firefox and Safari are not tested here.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
command -v python3 >/dev/null 2>&1 || { echo "web_plugins: no python3"; exit 77; }
python3 -I -c "import sys; sys.path.insert(0, 'tools'); from cdp import find_chrome; sys.exit(0 if find_chrome() else 1)" || { echo "web_plugins: no Chrome"; exit 77; }
export ZINC_BACKGROUND=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export ../examples/webrtc-call --target web --render dom -o "$tmp/call" >/dev/null 2>"$tmp/err" || { echo "web_plugins: the call export failed: $(cat "$tmp/err")"; exit 1; }
"$Z" export tests/fixtures/web-media --target web -o "$tmp/media" >/dev/null 2>&1 || { echo "web_plugins: the media export failed"; exit 1; }
"$Z" export tests/fixtures/web-audio --target web -o "$tmp/audio" >/dev/null 2>&1 || { echo "web_plugins: the audio export failed"; exit 1; }
python3 -I tools/web-browser-test "$tmp/call" --wait 2 --after 6 --size 1040x680 --click 556,607 --expect-text "In a call with the echo peer" >"$tmp/call.out" 2>&1 || { echo "web_plugins: the call did not connect: $(cut -c1-600 "$tmp/call.out")"; fail=1; }
grep -q "VP8" "$tmp/call.out" || { echo "web_plugins: no VP8 in the stats of the call"; fail=1; }
grep -q "audio opus" "$tmp/call.out" || { echo "web_plugins: no Opus audio in the stats of the call"; fail=1; }
grep -q '"errors": \[\]' "$tmp/call.out" || { echo "web_plugins: errors in the call page: $(cut -c1-400 "$tmp/call.out")"; fail=1; }
python3 -I tools/web-browser-test "$tmp/media" --wait 2 --after 4 --size 800x500 --click-text Open --expect-text "frames flowing, snapshot ok, microphone" >"$tmp/media.out" 2>&1 || { echo "web_plugins: camera and microphone: $(cut -c1-500 "$tmp/media.out")"; fail=1; }
grep -q "blocks flowing" "$tmp/media.out" || { echo "web_plugins: the microphone blocks did not flow: $(cut -c1-400 "$tmp/media.out")"; fail=1; }
python3 -I tools/web-browser-test "$tmp/audio" --wait 2 --after 1 --size 800x500 --click-text Play --expect-text "backend Web Audio, tone 0.25 s, playing true, stream true, pcm 8000 Hz 4 frames" >"$tmp/audio.out" 2>&1 || { echo "web_plugins: audio: $(cut -c1-500 "$tmp/audio.out")"; fail=1; }
# a plugin whose native code is C: zinc:sqlite, the amalgamation built to WebAssembly by the pinned zig, a database saved and loaded again through localStorage
if ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-* >/dev/null 2>&1; then
  "$Z" export tests/fixtures/web-sqlite --target web -o "$tmp/sqlite" >/dev/null 2>"$tmp/err" || { echo "web_plugins: the sqlite export failed: $(cat "$tmp/err")"; fail=1; }
  ls "$tmp"/sqlite/sqlite.*.wasm >/dev/null 2>&1 || { echo "web_plugins: no sqlite.wasm in the export"; fail=1; }
  python3 -I tools/web-browser-test "$tmp/sqlite" --wait 2 --after 2 --size 800x500 --click-text Run --expect-text "rows 3: alpha/béta/gamma, sum 3.5, last id 2" >"$tmp/sqlite.out" 2>&1 || { echo "web_plugins: sqlite: $(cut -c1-500 "$tmp/sqlite.out")"; fail=1; }
else echo "web_plugins: no pinned zig downloaded: the sqlite part is skipped"; fi
exit $fail
