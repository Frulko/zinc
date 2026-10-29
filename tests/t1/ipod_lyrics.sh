#!/bin/sh
# Lyrics in examples/ipod (services/lyrics.ts, components/LyricsPanel.tsx) and zinc:ipod's writeLyrics, on the fake iPod of
# tests/data/ipod-online, LRCLIB served by its stub.
#   1. the plugin: an MP3 and an M4A (made by ffmpeg) added, their lyrics written (ID3v2 USLT, the MP4 lyrics atom) and saved; after a
#      reopen each has the lyrics flag and readLyrics gives the text back; ffprobe finds it in the files;
#   2. the app: Songs, Sing Along double-clicked, the LCD's lyrics button (frame 120: the three synced lines, the first one sung), a click
#      in the progress bar at 1.25 s (150: the second line sung) and at 1.9 s (180: the third), Allow changes and Write to iPod (the song's
#      file then has the lyrics, its flag is set), Plain Song double-clicked (330: its plain lyrics); LRCLIB asked once per song.
#      The frames against tests/golden/ipod-demo/lyrics.txt (120, 150 and 180 differ: the line sung moves).
# Skips (77) without ffmpeg. KEEP=dir keeps the shots. UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
command -v ffmpeg >/dev/null || { echo "skipped: ffmpeg makes the MP3 and M4A"; exit 77; }
. tests/data/ipod-online/setup.sh
gold=$root/tests/golden/ipod-demo/lyrics.txt
ffmpeg -loglevel error -y -f lavfi -i sine=d=2 -q:a 9 lyric.mp3 && ffmpeg -loglevel error -y -f lavfi -i sine=d=2 -c:a aac -b:a 64k lyric.m4a \
  || { echo "ipod_lyrics: ffmpeg failed"; exit 1; }
# ---- 1. the plugin
ONLINE_MODE=lyrics timeout 120 "$Z" run "$root/tests/data/ipod-online/main.ts" > plugin.out 2>&1
for w in 'Mp3 Lyric | true | Words of mp3/Second line é | .mp3' 'M4a Lyric | true | Words of m4a/Second line é | .m4a'; do
  grep -qF "$w" plugin.out || { echo "ipod_lyrics: the plugin: no \"$w\": $(tail -5 plugin.out | tr '\n' '|')"; fail=1; }
done
for ext in mp3 m4a; do
  f=$(find "$pod/iPod_Control/Music" -name "*.$ext" | head -1)
  ffprobe -loglevel error -show_entries format_tags "$f" | grep -qi "lyrics.*=Words of $ext" || { echo "ipod_lyrics: ffprobe finds no lyrics in the $ext: $(ffprobe -loglevel error -show_entries format_tags "$f" | tr '\n' '|')"; fail=1; }
done
# ---- 2. the app
click() { printf '%s move %s %s\n%s down\n%s up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 2)); }
dbl() { printf '%s move %s %s\n%s down\n%s up\n%s down\n%s up\n' "$1" "$2" "$3" $(($1 + 1)) $(($1 + 2)) $(($1 + 3)) $(($1 + 4)); }
{ click 31 60 393; dbl 51 500 519; click 61 912 31; click 121 760 49; click 151 830 49; click 211 196 107; click 221 1104 733; dbl 281 500 451; } > session.input
app page 120,150,180,330 "$tmp/session.input"
for t in 'Lyrics' 'First line of the song' 'Second line comes now' 'Third and last line' 'Write to iPod'; do says page 120 "$t"; done
says page 330 'Only plain words'
[ "$(grep -c '"/api/get"' requests.jsonl)" = 2 ] || { echo "ipod_lyrics: LRCLIB asked $(grep -c '"/api/get"' requests.jsonl) times, want 2 (Sing Along, Plain Song)"; fail=1; }
podread | grep '^Sing Along' > db.out
[ "$(cat db.out)" = 'Sing Along | Lyric Band |  | 2020 | Pop | true | true | First line of the song/Second line comes now/Third and last line' ] \
  || { echo "ipod_lyrics: the iPod after Write to iPod: $(cat db.out)"; fail=1; }
for f in 120 150 180 330; do echo "$f $(hash_at page $f)"; done > lyrics.txt
[ "$(cut -d' ' -f2 lyrics.txt | head -3 | sort -u | wc -l | tr -d ' ')" = 3 ] || { echo "ipod_lyrics: the line sung did not move: $(tr '\n' ' ' < lyrics.txt)"; fail=1; }
[ -n "$UPDATE" ] && cp lyrics.txt "$gold"
cmp -s lyrics.txt "$gold" || { echo "ipod_lyrics: frames $(tr '\n' ' ' < lyrics.txt), recorded $(tr '\n' ' ' < "$gold" 2>/dev/null)"; fail=1; }
[ $fail -eq 0 ] && echo "ipod_lyrics: ok"
exit $fail
