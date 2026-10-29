#!/bin/sh
# examples/ipod, headless, on a fake iPod: a 128 MB HFS+ disk image (a fixed size, so the storage shown is the same on every run)
# with iPod_Control/Device/SysInfo, filled by tests/data/ipod-demo (nine tracks in three albums, two with covers, a podcast and a
# playlist, then three duplicates: two from the same file with fewer tags, one melody as WAV and AAC; a note and a voice recording beside them), mounted at /tmp/zinc-ipod-demo/Volumes/ZINCPOD (a fixed path: the pages show it). The demo sees only that iPod
# (ZINC_IPOD_ROOTS, ZINC_IPOD_NO_USB, IPOD_DEMO_MOUNT), opens it by itself and the session (tests/data/ipod-demo/session.input)
# goes through its pages. Checked: one frame hash per page (tests/golden/ipod-demo/hashes.txt: the overview, the album grid with
# its covers, an album, the songs searched, the songs sorted by artist, the playlists, the specs, the albums in the dark scheme, the
# podcasts, a note read on the Notes & files page, the photos (none)) on the interpreter, the
# overview's hash on QuickJS, and a run left alone on the overview paints nothing after it is shown. Then the backups checked, files
# dropped and added (their toasts on the page), an album downloaded (frame 442: its toast running, the sidebar's badge and the busy
# Download button on the album's page; 448: the toast's success with Reveal in Finder), the transfers and the log (hashes, files and log lines), the Optimise page analysed (three
# groups: tags and file, sound), another copy kept in one group and the three merged (the page, the merge job's lines, the log), and
# the iPod unmounted and mounted again while the app runs.
# macOS only (hdiutil); skipped (77) without the plugin's libraries. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] && command -v hdiutil >/dev/null || { echo "skipped: the fake iPod is a macOS disk image"; exit 77; }
pkg-config --exists glib-2.0 gobject-2.0 libplist-2.0 taglib libusb-1.0 2>/dev/null || { echo "skipped: the libraries of zinc:ipod are not installed"; exit 77; }
command -v python3 >/dev/null || exit 77
root=$(pwd)
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
gold=$root/tests/golden/ipod-demo
tmp=/tmp/zinc-ipod-demo
pod=$tmp/Volumes/ZINCPOD
hdiutil detach "$pod" -quiet -force 2>/dev/null; rm -rf "$tmp"; mkdir -p "$tmp" || exit 2   # what a killed run left
trap 'hdiutil detach "$pod" -quiet -force 2>/dev/null; [ -n "$KEEP" ] && mkdir -p "$KEEP" && cp "$tmp"/*.png "$tmp"/*.out "$KEEP/" 2>/dev/null; rm -rf "$tmp"' EXIT
python3 tests/data/ipod-demo/media.py "$tmp" || exit 1
afconvert -f m4af -d aac -b 64000 "$tmp/melody-a.wav" "$tmp/melody-a.m4a" || exit 1   # the AAC copy only its sound gives away
mkdir -p "$pod"
hdiutil create -size 128m -fs HFS+ -volname ZINCPOD -layout NONE "$tmp/pod.dmg" -quiet && hdiutil attach "$tmp/pod.dmg" -mountpoint "$pod" -nobrowse -quiet \
  || { echo "ipod_demo: the disk image of the fake iPod could not be made"; exit 1; }
mkdir -p "$pod/iPod_Control/Device"
printf 'ModelNumStr: xB029\npszSerialNumber: 8K1234ABCDE\nFirewireGuid: 0x000A27001234ABCD\n' > "$pod/iPod_Control/Device/SysInfo"
cd "$tmp" || exit 2
export ZINC_IPOD_BACKUPS="$tmp/backups" ZINC_NATIVE=real ZINC_IPOD_ROOTS=$tmp/Volumes ZINC_IPOD_NO_USB=1 IPOD_DEMO_MOUNT=$pod \
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1180x760 TZ=UTC
IPOD_MOUNT=$pod IPOD_TONES="$tmp" IPOD_MELODY="$tmp/melody-a.wav" IPOD_MELODY_AAC="$tmp/melody-a.m4a" IPOD_COVER_A="$tmp/cover-a.png" IPOD_COVER_B="$tmp/cover-b.png" \
  timeout 120 "$Z" run --interp "$root/tests/data/ipod-demo" > fill.out 2>&1
grep -q '^filled 13$' fill.out || { echo "ipod_demo: the fake iPod was not filled: $(tail -3 fill.out)"; exit 1; }
touch -t 202601021200 "$pod/iPod_Control/iTunes/iTunesDB"   # the specs show when the database was written
mkdir -p "$pod/Notes" "$pod/Recordings" && printf 'Shopping\n- milk\n- bread\n' > "$pod/Notes/Shopping.txt" && cp "$tmp/song.wav" "$pod/Recordings/Memo 1.wav"
rm -rf "$tmp/backups"   # the automatic backup the filling took has today's date: the Backups page starts empty
hash_at() { awk -v f="$1" '$2 == "framehash" && $3 + 0 <= f + 0 { h = $5 } END { print f, h }' "$2"; }   # idle frames are not presented: the last one shown
fail=0
# QuickJS: the same overview
ZINC_FRAMES=30 ZINC_FRAMEHASH=all timeout 120 "$Z" run "$root/examples/ipod" --engine quickjs > quickjs.out 2>&1
[ -n "$UPDATE" ] || [ "$(hash_at 30 quickjs.out)" = "$(head -1 "$gold/hashes.txt")" ] || { echo "ipod_demo: QuickJS's overview differs: $(hash_at 30 quickjs.out) $(tail -2 quickjs.out)"; fail=1; }
# left alone on the overview: nothing is painted once it is shown (frame 30: ZINC_PROFILE_SKIP leaves out the frames that open it), though
# the app looks for iPods every 3 s
ZINC_FRAMES=330 ZINC_PROFILE=1 ZINC_PROFILE_SKIP=30 timeout 120 "$Z" run --interp "$root/examples/ipod" > idle.out 2>&1
grep -q 'zinc profile: paint p50=0.00 p99=0.00 max=0.00' idle.out || { echo "ipod_demo: frames are painted while idle: $(grep 'profile: paint' idle.out || tail -3 idle.out)"; fail=1; }
# the session: the pages above, then the Backups page checked, two files dropped on the window (one the iPod cannot play) after
# Allow changes, an album downloaded into the test's folder, the transfers and the log, then Optimise: analyse, keep the other copy
# of the first group, merge (the question answered by system.script), the merge job opened
mkdir -p "$tmp/drop" && cp "$tmp/song.wav" "$tmp/drop/new-song.wav" && printf 'fLaC' > "$tmp/drop/track.flac"
printf '0 dialog-answer 0\n1330 drop %s\n1331 drop %s\n' "$tmp/drop/new-song.wav" "$tmp/drop/track.flac" > system.script   # the answer: Merge, to the merge's question
frames="30 60 90 120 150 180 210 240 270 300 330 360 420 442 448 480 510 570 600 650"
IPOD_DEMO_DOWNLOADS="$tmp/dl" ZINC_SYSTEM_SCRIPT="$tmp/system.script" ZINC_FRAMES=650 ZINC_INPUT="$root/tests/data/ipod-demo/session.input" \
  ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/page.png" ZINC_SHOT_FRAMES=$(echo $frames | tr ' ' ',') timeout 120 "$Z" run --interp "$root/examples/ipod" > session.out 2>&1 \
  || { echo "ipod_demo: the session failed: $(tail -5 session.out)"; exit 1; }
for f in $frames; do hash_at "$f" session.out; done > hashes.txt
[ -n "$UPDATE" ] && cp hashes.txt "$gold/hashes.txt"
cmp -s hashes.txt "$gold/hashes.txt" || { echo "ipod_demo: frames $(tr '\n' ' ' < hashes.txt), recorded $(tr '\n' ' ' < "$gold/hashes.txt")"; fail=1; }
# what it did on disk: the album downloaded as Artist/Album/NN Title.ext, the song added and the flac refused, every operation in the log
log=$tmp/backups/logs/demo.log
ls "$tmp/dl"/*/*/[0-9][0-9]\ *.* >/dev/null 2>&1 || { echo "ipod_demo: the album was not downloaded: $(find "$tmp/dl" -type f 2>/dev/null | head -3)"; fail=1; }
for op in 'Opened Zinc Pod' 'Check Zinc Pod' 'Allow changes turned on' '1 added (32 KB), 1 refused' 'Download “' 'copied (128 KB), 0 already there' 'Analyse Zinc Pod' '3 duplicate groups' 'Merge 3 duplicate groups' '3 copies removed'; do
  grep -q "$op" "$log" || { echo "ipod_demo: '$op' is not in the log file: $(tail -3 "$log")"; fail=1; }
done
# unmounted while open, then mounted again: the app closes it and says so, then opens it by itself (seen in the log)
count() { grep -c "$1" "$log" 2>/dev/null; }
wait_for() { i=0; while [ "$(count "$1")" -lt "$2" ] && [ $i -lt 300 ]; do sleep 0.1; i=$((i + 1)); done; [ "$(count "$1")" -ge "$2" ]; }
opened=$(count 'Opened Zinc Pod')
ZINC_FRAMES=100000000 timeout 60 "$Z" run --interp "$root/examples/ipod" > live.out 2>&1 &
app=$!
if wait_for 'Opened Zinc Pod' $((opened + 1)) && hdiutil detach "$pod" -quiet -force && wait_for 'Zinc Pod disconnected' 1 \
  && hdiutil attach "$tmp/pod.dmg" -mountpoint "$pod" -nobrowse -quiet && wait_for 'Opened Zinc Pod' $((opened + 2)); then :
else echo "ipod_demo: unmounting and mounting again were not followed: $(tail -3 "$log")"; fail=1; fi
kill $app 2>/dev/null; wait $app 2>/dev/null
[ $fail -eq 0 ] && echo "ipod_demo: ok"
exit $fail
