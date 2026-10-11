#!/bin/sh
# Makes what the table says, from the texts of the project, with a voice synthesised by Piper (https://github.com/rhasspy/piper): the
# narration of every audio medium from its `transcript`, and the audio description of every medium that has an `audioDescription`, at the
# place `accessibility.descriptions` gives. One MP3 per language, and its subtitles (WebVTT, one cue per sentence, timed on the voice:
# each sentence is synthesised on its own).
#   examples/museum-table/tools/narration.sh [--no-voice] [--only narration|descriptions] [output directory, default ../assets]
# --no-voice writes the subtitles only, timed for a reading speed of 15 characters per second. --only makes one of the two kinds: the
# voice does not say a sentence twice in exactly the same way, so a run rewrites every clip it makes.
# Nothing is installed in the repository: the first run downloads Piper 2023.11.14-2 and the two voices (190 MB) to
# $NARRATION_HOME (default ~/.cache/zinc-museum-tts). Needs curl, jq and ffmpeg with libmp3lame. Run on macOS x86_64; the other
# archives of the same release (macOS arm64, Linux x86_64 and aarch64) are named below and were not tried.
# The voices, from https://huggingface.co/rhasspy/piper-voices (their model cards and licences: ../LICENSES.md):
#   fr  fr_FR-mls-medium, speaker 1840   en  en_GB-cori-medium
# Another voice: VOICE_FR / VOICE_EN / VOICE_<LANG> = "<path of the voice in piper-voices, without .onnx> <speaker number>". Check its
# licence first: many Piper voices were tuned from a voice whose data may not be redistributed.
# Nothing made with the Mac's `say` goes in the repository: Apple's licence keeps the system voices for personal use.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
project=$here/../assets/project.json
voice=1; only=
[ "${1:-}" = "--no-voice" ] && { voice=0; shift; }
[ "${1:-}" = "--only" ] && { only=$2; shift 2; }
out=${1:-$here/../assets}
home=${NARRATION_HOME:-$HOME/.cache/zinc-museum-tts}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
GAP=0.35   # seconds of silence between two sentences

voice_of() {  # language: the voice and the speaker
  name=$(printf 'VOICE_%s' "$1" | tr '[:lower:]' '[:upper:]')
  chosen=$(eval "printf '%s' \"\${$name:-}\"")
  [ -n "$chosen" ] && { echo "$chosen"; return; }
  case $1 in
    fr) echo "fr/fr_FR/mls/medium/fr_FR-mls-medium 0" ;;
    en) echo "en/en_GB/cori/medium/en_GB-cori-medium 0" ;;
    *) echo "no voice for \"$1\": set $name" >&2; exit 1 ;;
  esac
}
setup() {  # Piper and the voice of a language, downloaded once
  if [ ! -x "$home/piper/piper" ]; then
    case "$(uname -sm)" in
      "Darwin x86_64") arch=macos_x64 ;; "Darwin arm64") arch=macos_aarch64 ;;
      "Linux x86_64") arch=linux_x86_64 ;; "Linux aarch64") arch=linux_aarch64 ;;
      *) echo "no Piper release for $(uname -sm)" >&2; exit 1 ;;
    esac
    mkdir -p "$home"
    curl -fsSL "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_$arch.tar.gz" | tar -xz -C "$home"
    case $arch in macos_*)   # the macOS archives come without the libraries Piper loads: they are in the release of piper-phonemize
      curl -fsSL "https://github.com/rhasspy/piper-phonemize/releases/download/2023.11.14-4/piper-phonemize_$arch.tar.gz" | tar -xz -C "$home" ;;
    esac
  fi
  model=$home/voices/$(basename "$1")
  mkdir -p "$home/voices"
  for ext in onnx onnx.json; do
    [ -s "$model.$ext" ] || curl -fsSL -o "$model.$ext" "https://huggingface.co/rhasspy/piper-voices/resolve/main/$1.$ext"
  done
}
speak() {  # model, speaker, text, wav
  printf '%s\n' "$3" | sed "s/’/'/g" | DYLD_LIBRARY_PATH="$home/piper-phonemize/lib" "$home/piper/piper" --model "$1.onnx" --speaker "$2" \
    --espeak_data "$home/piper/espeak-ng-data" --output_file "$4" >/dev/null 2>"$tmp/piper.log" || { cat "$tmp/piper.log" >&2; exit 1; }
}
stamp() { LC_ALL=C awk -v t="$1" 'BEGIN { printf "%02d:%06.3f", int(t / 60), t - 60 * int(t / 60) }'; }

say() {  # what it is, language, text, clip, subtitles ('' for none): writes the clip and its subtitles in the output directory
  what=$1; lang=$2; text=$3; file=$4; subtitles=$5
  [ -n "$text" ] || return 0
  mkdir -p "$(dirname "$out/$file")"
  printf '%s\n' "$text" | sed 's/\([.!?]\) /\1\
/g' > "$tmp/sentences"
  : > "$tmp/list"; : > "$tmp/cues"; at=0; n=0
  if [ $voice = 1 ]; then
    set -- $(voice_of "$lang"); setup "$1"; model=$home/voices/$(basename "$1"); speaker=$2
    ffmpeg -v error -y -f lavfi -i anullsrc=r=22050:cl=mono -t $GAP -c:a pcm_s16le "$tmp/gap.wav"
  fi
  while IFS= read -r sentence; do
    [ -n "$sentence" ] || continue
    n=$((n + 1))
    if [ $voice = 1 ]; then
      speak "$model" "$speaker" "$sentence" "$tmp/$n.wav"
      seconds=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$tmp/$n.wav")
      [ $n = 1 ] || echo "file '$tmp/gap.wav'" >> "$tmp/list"
      echo "file '$tmp/$n.wav'" >> "$tmp/list"
    else
      seconds=$(printf '%s' "$sentence" | LC_ALL=C awk '{ n += length($0) } END { printf "%.3f", n / 15 }')
    fi
    [ $n = 1 ] || at=$(LC_ALL=C awk -v a="$at" -v g="$([ $voice = 1 ] && echo $GAP || echo 0)" 'BEGIN { printf "%.3f", a + g }')
    to=$(LC_ALL=C awk -v a="$at" -v d="$seconds" 'BEGIN { printf "%.3f", a + d }')
    printf '\n%s --> %s\n%s\n' "$(stamp "$at")" "$(stamp "$to")" "$sentence" >> "$tmp/cues"
    at=$to
  done < "$tmp/sentences"
  # mono, 22.05 kHz (the rate of the voices), MP3 at a variable rate: speech takes about 4 kB per second
  [ $voice = 1 ] && ffmpeg -v error -y -f concat -safe 0 -i "$tmp/list" -ac 1 -ar 22050 -c:a libmp3lame -q:a 7 -map_metadata -1 -fflags +bitexact "$out/$file"
  [ -n "$subtitles" ] && { echo WEBVTT; cat "$tmp/cues"; } > "$out/$subtitles"
  echo "$what $lang: $at s, $n sentences, $file $subtitles"
}

field() { jq -r --arg id "$id" --arg lang "$lang" ".media[] | select(.id == \$id) | $1 // \"\" | gsub(\"\\\\{lang\\\\}\"; \$lang)" "$project"; }  # of the medium $id, in $lang
descriptions=$(jq -r '.accessibility.descriptions // ""' "$project")
for lang in $(jq -r '.languages[]' "$project"); do
  [ "$only" = descriptions ] || for id in $(jq -r '.media[] | select(.kind == "audio") | .id' "$project"); do
    say "$id" "$lang" "$(field ".transcript[\$lang]")" "$(field .file)" "$(field .subtitles)"
  done
  [ "$only" = narration ] || [ -z "$descriptions" ] || for id in $(jq -r '.media[] | select(.audioDescription != null) | .id' "$project"); do
    file=$(printf '%s' "$descriptions" | sed "s/{id}/$id/g; s/{lang}/$lang/g")
    say "$id, description" "$lang" "$(field ".audioDescription[\$lang]")" "$file" "${file%.*}.vtt"
  done
done
