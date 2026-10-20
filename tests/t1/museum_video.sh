#!/bin/sh
# Museum table, a film in a sequence (ZN-650.08). One scripted visit on the sample project (tests/data/museum_video/film.input, opened on
# the sequence of the film), on the interpreter: the film of the Great Wave plays by itself in its card, with its subtitle; the language
# button puts the subtitle in English (a frame: the film playing); a touch on the card pauses it (a frame: the sign on the picture, the
# timeline stopped) and a second one starts it again; the link back to the prints leaves the sequence, and the film stops. What the player
# says of it is film.story, the two frames are golden/museum-video/frames.txt. Compiled, the paused frame has the same hash.
# A deterministic run decodes nothing (it gets the stand-in of zinc:video): the card keeps the film's poster, its first picture, under the
# timeline and the subtitles. With FFmpeg's libraries the clip of the sample is also decoded for real (seen.ts): it gives pictures, its
# time runs and it lasts its ten seconds; without them the test says so.
# The clip, its poster and its subtitles have their source and licence in the project and in LICENSES.md.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_video; g=$PWD/tests/golden/museum-video
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd ../examples/museum-table || exit 2
fail=0
play() {  # frames, mode: the story on stdout, the hash of the last frame added to $tmp/frames
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/film.input" ZINC_FRAMES=$1 ZINC_FRAMEHASH=last "$ZINC" run $2 . -- --story --sequence wave 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" >> "$tmp/frames"
}
same() {  # what, file, golden
  [ -z "$ZN_UPDATE_GOLDEN" ] || cp "$2" "$3"
  cmp -s "$2" "$3" || { echo "museum_video: $1 differs from $3"; diff "$2" "$3" | head -8; fail=1; }
}
mkdir -p "$g"
: > "$tmp/frames"
play 150 --interp > /dev/null; play 300 --interp > /dev/null
same "the frames of the film playing and paused" "$tmp/frames" "$g/frames.txt"
play 620 --interp > "$tmp/story"
same "the story of the film" "$tmp/story" "$d/film.story"
: > "$tmp/frames"; play 300 "" > /dev/null
[ -s "$tmp/frames" ] && grep -qxF "$(cat "$tmp/frames")" "$g/frames.txt" || { echo "museum_video (compiled): the paused frame is $(cat "$tmp/frames"), not the interpreter's"; fail=1; }
# what the criteria name: it plays, its subtitles follow the language, a touch pauses it, leaving the sequence stops it
for line in '0 film wave-film play' ' subtitle L’écume se termine en griffes.' ' language en' ' subtitle The foam ends in claws.' ' film wave-film pause' \
  ' link wave -> ukiyo-e none' ' film wave-film stop'; do
  grep -qF -- "$line" "$d/film.story" || { echo "museum_video: film.story has no \"$line\""; fail=1; }
done
# paused for 90 frames, the film says its last sentence 90 frames later than its subtitles time it (7.2 s: frame 432 without the pause)
grep -q '^243 film wave-film pause$' "$d/film.story" && grep -q '^333 film wave-film play$' "$d/film.story" || { echo "museum_video: the touches do not pause and restart the film"; fail=1; }
grep -q '^52[0-9] subtitle In the distance, Fuji waits.$' "$d/film.story" || { echo "museum_video: the film did not wait while it was paused: $(grep 'In the distance' "$d/film.story")"; fail=1; }

# the source and the licence of the clip
for f in video/great-wave.mp4 video/great-wave.jpg video/great-wave.fr.vtt video/great-wave.en.vtt; do
  [ -s "assets/$f" ] && grep -F "\`$f\`" LICENSES.md | grep -q 'CC0 1.0' || { echo "museum_video: $f is missing, or has no licence in LICENSES.md"; fail=1; }
done
sed -n '/"id": "wave-film"/,/"licenceUrl"/p' assets/project.json > "$tmp/medium"
grep -q '"source": "https://www.metmuseum.org/' "$tmp/medium" && grep -q '"licence": "CC0 1.0"' "$tmp/medium" || { echo "museum_video: the project does not say where the film comes from"; fail=1; }

# the clip, decoded for real
if command -v pkg-config >/dev/null && pkg-config --exists libavformat libavcodec libavutil libswscale && command -v c++ >/dev/null; then
  out=$(env -u ZINC_DETERMINISTIC ZINC_NATIVE=real ZINC_ASSETS="$PWD/assets" ZINC_HEADLESS=1 ZINC_FRAMES=3000000 timeout 60 "$ZINC" run "$d/seen.ts" -- wave-film 2>&1)
  case $out in 'wave-film: pictures, its time runs, 10.0 s, says "'*) ;; *) echo "museum_video: the clip is not decoded: $(printf '%s' "$out" | head -c 300)"; fail=1 ;; esac
else
  echo "note: no FFmpeg libraries or no compiler: the film is not decoded, its poster and its subtitles are all that was checked" >&2
fi
[ $fail = 0 ] && echo "museum_video: ok"
exit $fail
