#!/bin/sh
# Makes the narration of every audio medium of the project from its `transcript`: a voice synthesised by the Mac's `say`, one file per
# language, and the subtitles (WebVTT, one cue per sentence, timed in proportion to its length).
#   examples/museum-table/tools/narration.sh [--no-voice] [output directory, default ../assets]
# --no-voice writes the subtitles only, timed for a reading speed of 15 characters per second (what the repository holds, beside a
# placeholder sound). Voices: VOICE_FR (Thomas), VOICE_EN (Daniel), or VOICE_<LANG> for another language. Needs jq, and say + ffmpeg for a voice.
# Do not commit the voice files: as we read Apple's software licence, the system voices are for personal, non-commercial use. A museum
# records a voice or uses a synthesiser whose licence allows publishing, under the same file names.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
project=$here/../assets/project.json
voice=1
[ "${1:-}" = "--no-voice" ] && { voice=0; shift; }
out=${1:-$here/../assets}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

for id in $(jq -r '.media[] | select(.kind == "audio") | .id' "$project"); do
  for lang in $(jq -r '.languages[]' "$project"); do
    field() { jq -r --arg id "$id" --arg lang "$lang" ".media[] | select(.id == \$id) | $1 // \"\" | gsub(\"\\\\{lang\\\\}\"; \$lang)" "$project"; }
    text=$(field ".transcript[\$lang]"); file=$(field .file); subtitles=$(field .subtitles)
    [ -n "$text" ] || continue
    mkdir -p "$(dirname "$out/$file")"
    seconds=$(printf '%s' "$text" | LC_ALL=C awk '{ n += length($0) } END { printf "%.3f", n / 15 }')
    if [ $voice = 1 ]; then
      name=$(printf 'VOICE_%s' "$lang" | tr '[:lower:]' '[:upper:]'); default=Daniel; [ "$lang" = fr ] && default=Thomas
      say -v "$(eval "printf '%s' \"\${$name:-$default}\"")" -o "$tmp/voice.aiff" "$text"
      ffmpeg -v error -y -i "$tmp/voice.aiff" -ac 1 -ar 22050 -c:a libmp3lame -b:a 40k -map_metadata -1 "$out/$file"
      seconds=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$file")
    fi
    [ -n "$subtitles" ] || continue
    TEXT=$text LC_ALL=C awk -v total="$seconds" '
      function stamp(t) { return sprintf("%02d:%06.3f", int(t / 60), t - 60 * int(t / 60)) }
      BEGIN {
        text = ENVIRON["TEXT"]; gsub(/[.!?] /, "&\n", text); n = split(text, cue, /\n/)
        for (i = 1; i <= n; i++) { sub(/ $/, "", cue[i]); all += length(cue[i]) }
        print "WEBVTT"
        for (i = 1; i <= n; i++) { d = total * length(cue[i]) / all; printf "\n%s --> %s\n%s\n", stamp(at), stamp(at + d), cue[i]; at += d }
      }' > "$out/$subtitles"
    echo "$id $lang: $seconds s, $file $subtitles"
  done
done
