#!/bin/sh
# Museum table, anonymous statistics (ZN-650.12). The sample project with a reset after 5 seconds, no attract loop and a visit of two
# stages plays one scripted session (tests/data/museum_stats/visits.input), on the interpreter, with --statistics <directory>:
#   a first visit, in French: a print seen in full, its audio description, the sequence of the vase, a point of interest opened by
#     "Next point"; the visitor leaves and the visit is forgotten;
#   a second one, in English: the guided visit, watched to its end without a touch;
#   then the staff: two fingers held in two opposite corners show the counts of the day (a frame, golden/museum-stats/frames.txt), and a
#     touch closes them. Those touches are not a visit.
# The directory then holds one file, the day's, equal to golden/museum-stats/day.csv: two sessions and their seconds up to the last
# touch, the hour they began in, their languages, each sequence with its seconds, the picture, the description, the point, the
# presentation started and ended. Checked on the file: every line is `what,count,seconds,id` with whole numbers, the only time of day
# is the hour of a session, and no coordinate of the scripted touches is in it. What the player says is visits.story.
# Compiled, the same session writes the same file. Without --statistics nothing is written.
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
d=$PWD/tests/data/museum_stats; g=$PWD/tests/golden/museum-stats
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd examples/museum-table || exit 2
fail=0
mkdir -p "$g" "$tmp/assets"
for part in audio models panoramas photos video; do ln -s "$PWD/assets/$part" "$tmp/assets/$part"; done
sed -e 's/"attractAfter": 60,/"attractAfter": 0,/' -e 's/"resetAfter": 120,/"resetAfter": 5,/' \
  -e 's/"path": \["ukiyo-e", "wave", "japonisme", "porcelain", "garden"\]/"path": ["ukiyo-e", "wave"]/' assets/project.json > "$tmp/assets/project.json"
play() {  # frames, mode, directory of the statistics ('' for none): the story on stdout, the hash of the last frame in $tmp/hash
  TZ=UTC ZINC_ASSETS="$tmp/assets" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080 ZINC_INPUT="$d/visits.input" ZINC_FRAMES=$1 ZINC_FRAMEHASH=last \
    "$ZINC" run $2 . -- --story ${3:+--statistics "$3"} 2>"$tmp/err"
  sed -n 's/^zinc: framehash //p' "$tmp/err" > "$tmp/hash"
}
same() {  # what, file, golden
  [ -z "$ZN_UPDATE_GOLDEN" ] || cp "$2" "$3"
  cmp -s "$2" "$3" || { echo "museum_stats: $1 differs from $3"; diff "$2" "$3" | head -12; fail=1; }
}
play 5895 --interp "$tmp/seen" > /dev/null
same "the frame of the staff's summary" "$tmp/hash" "$g/frames.txt"
play 5960 --interp "$tmp/stats" > "$tmp/story"
same "the story of the two visits" "$tmp/story" "$d/visits.story"
day=$tmp/stats/1970-01-01.csv
[ "$(ls "$tmp/stats" | tr '\n' ' ')" = "1970-01-01.csv " ] || { echo "museum_stats: the directory holds $(ls "$tmp/stats" | tr '\n' ' '), not the file of the day"; fail=1; }
same "the statistics of the day" "$day" "$g/day.csv"
# what the criteria name
for line in 'session,2,81,' 'language,1,,fr' 'language,1,,en' 'sequence,1,30,wave' 'medium,1,,kanbara-snow' 'description,1,,kanbara-snow' 'point,1,,vase/lady' \
  'presentation,1,,tour' 'presentation-ended,1,,tour'; do
  grep -qxF -- "$line" "$g/day.csv" || { echo "museum_stats: day.csv has no \"$line\""; fail=1; }
done
for line in ' visit start' ' visit end' ' presentation tour end' ' summary open' ' summary close'; do
  grep -qF -- "$line" "$d/visits.story" || { echo "museum_stats: visits.story has no \"$line\""; fail=1; }
done
# nothing finer than the session, nothing of the touches: whole numbers, one hour per session as the only time of day, no coordinate
LC_ALL=C awk -F, 'NR == 1 { if ($0 != "what,count,seconds,id") { print "museum_stats: the file begins with " $0; bad = 1 } next }
  $2 !~ /^[0-9]+$/ || $3 !~ /^[0-9]*$/ { print "museum_stats: not whole numbers: " $0; bad = 1 }
  $1 == "hour" { hours += $2; if ($4 !~ /^[0-2][0-9]$/) { print "museum_stats: an hour finer than an hour: " $0; bad = 1 } }
  $1 == "session" { sessions = $2 }
  $1 != "session" && $1 != "sequence" && $3 != "" { print "museum_stats: a time on something that is not a session or a sequence: " $0; bad = 1 }
  /[:.T]/ { print "museum_stats: something like a time or a fraction: " $0; bad = 1 }
  END { if (hours != sessions) { print "museum_stats: " hours + 0 " hours for " sessions + 0 " sessions"; bad = 1 } exit bad }' "$day" || fail=1
for xy in $(awk '$2 == "touch" { print $4; print $5 }' "$d/visits.input" | sed 's/\.0$//' | sort -u); do
  grep -qw -- "$xy" "$day" && { echo "museum_stats: the coordinate $xy of a touch is in the file"; fail=1; }
done
# the staff's touches were not a visit, and the file of the day is what the summary showed: the same counts before and after it
cmp -s "$tmp/seen/1970-01-01.csv" "$day" || { echo "museum_stats: the staff's gesture changed the statistics"; fail=1; }

play 5960 "" "$tmp/compiled" > /dev/null
cmp -s "$tmp/compiled/1970-01-01.csv" "$g/day.csv" || { echo "museum_stats (compiled): the statistics differ"; diff "$tmp/compiled/1970-01-01.csv" "$g/day.csv" | head -6; fail=1; }
play 300 --interp "" > /dev/null
[ "$(find . "$tmp" -name '1970-01-01.csv' | wc -l | tr -d ' ')" = 3 ] || { echo "museum_stats: a table without --statistics wrote a file"; fail=1; }
[ $fail = 0 ] && echo "museum_stats: ok"
exit $fail
