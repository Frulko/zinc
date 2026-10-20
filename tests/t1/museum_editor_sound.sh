#!/bin/sh
# Museum table, the storyboard editor: narration, sound and film (ZN-650.07.04, examples/museum-table/editor).
#   sound.input  one scripted session on the project the first session saved (golden/museum-editor/built.json), in a folder that holds the
#                welcome of the sample in two languages (audio/welcome.fr.mp3, .en.mp3 and their .vtt) and its film (video/great-wave.mp4,
#                its picture, its .vtt in two languages): the French recording enters the library as one sound for every language with its
#                subtitles, what it says is typed in French and in English, it becomes the narration of the sequence and "Listen" plays
#                it (the editor says so with --log); the film enters the library with its picture and its subtitles and is put on the
#                table. Save: the file equals sound.json and the player's loader accepts it. Frame 112 equals its golden: the timeline
#                has a bar for the narration (18.6 s) and the film's bar is as long as the film (10 s of the 30 shown).
#   A deterministic run decodes no film (the stand-in of zinc:video): the film then lasts what its subtitles say, as on the table. With
#   FFmpeg's libraries the saved project is opened once more without the stand-in: the file itself says ten seconds, and the sound 18.6.
# The document's operations (narration, next sequence, files of a medium, loop) are lines of selftest.ts, run by museum_editor.sh.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/museum-table; g=$PWD/tests/golden/museum-editor
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/p/audio" "$tmp/p/video"
cp "$g/built.json" "$tmp/p/sound.json"; cp "$ex"/assets/audio/welcome.* "$tmp/p/audio/"; cp "$ex"/assets/video/great-wave.* "$tmp/p/video/"

MUSEUM_EDITOR_LANG=en ZINC_INPUT="$g/sound.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=118 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=112 \
  "$ZINC" run "$ex/editor" -- "$tmp/p/sound.json" --log >"$tmp/out" 2>&1 || { echo "the editor failed: $(head -c 300 "$tmp/out")"; fail=1; }
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/p/sound.json" "$g/sound.json"; cp "$tmp/shot-112.png" "$g/sound-112.png"; fi
cmp -s "$tmp/p/sound.json" "$g/sound.json" || { echo "the session: sound.json differs from $g/sound.json"; diff "$tmp/p/sound.json" "$g/sound.json" | head -10; fail=1; }
tools/pngdiff "$tmp/shot-112.png" "$g/sound-112.png" >/dev/null || { echo "the timeline: frame 112 differs from $g/sound-112.png"; fail=1; }
grep -qxF 'listen welcome audio/welcome.fr.mp3 18.6 s, playing' "$tmp/out" || { echo "the editor did not play the narration: $(grep '^listen' "$tmp/out")"; fail=1; }
# what the criteria name, in the file: one narration for two languages, its subtitles, the film with its picture
for line in '"file": "audio/welcome.{lang}.mp3"' '"subtitles": "audio/welcome.{lang}.vtt"' '"en": "Welcome to the cabinet."' '"narration": "welcome"' '"poster": "video/great-wave.jpg"' \
  '"subtitles": "video/great-wave.{lang}.vtt"' '{ "media": "great-wave", "x": 960, "y": 540, "width": 640 }'; do
  grep -qF -- "$line" "$g/sound.json" || { echo "sound.json has no $line"; fail=1; }
done
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/p/sound.json" 2>&1)
case $got in 'sound.json: ok, "project" version 1, languages fr en, media: 1 audio, 1 video; 3 sequences, 1 items, 3 links, '*', canonical') ;; *) echo "the player's loader on the saved project: $got"; fail=1 ;; esac

# the files themselves say how long they last: the editor without the stand-ins, until the film has opened (some frames after the sound)
if command -v pkg-config >/dev/null && pkg-config --exists libavformat libavcodec libavutil libswscale && command -v c++ >/dev/null; then
  printf '4 move 350 230\n5 down\n6 up\n7 down\n8 up\n' > "$tmp/open.input"
  env -u ZINC_DETERMINISTIC MUSEUM_EDITOR_LANG=en ZINC_NATIVE=real ZINC_INPUT="$tmp/open.input" ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=3000000 \
    timeout 30 "$ZINC" run "$ex/editor" -- "$tmp/p/sound.json" --log >"$tmp/real" 2>&1 &
  pid=$!
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30; do
    grep -q '^length video/' "$tmp/real" 2>/dev/null && break
    kill -0 $pid 2>/dev/null || break
    sleep 1
  done
  kill $pid 2>/dev/null; wait $pid 2>/dev/null
  for line in 'length audio/welcome.fr.mp3 18.6 s (file)' 'length video/great-wave.mp4 10 s (file)'; do
    grep -qxF "$line" "$tmp/real" || { echo "the files do not say their length ($line): $(head -c 300 "$tmp/real")"; fail=1; }
  done
else
  echo "note: no FFmpeg libraries or no compiler: the film's own length was not read, its subtitles gave it" >&2
fi

[ $fail = 0 ] && echo "museum_editor_sound: ok"
exit $fail
