#!/bin/sh
# Museum table, the museum replaces the content remotely (ZN-650.11). The sample table packed as version 1.0.0 with an address in its
# project (kiosk.updateUrl), a local HTTP server on a port the system gives, and what `zinc publish` writes there: version 1.1.0, whose
# project starts on another sequence. Four runs of the 1.0.0 package, the story of each read:
#   no address    the same table with a project that names no address, while 1.1.0 is published: the server sees no request, the engine's
#                 network log (ZINC_HAR) has no entry
#   signature     the channel edited after it was signed: refused, nothing staged, 1.0.0 plays on
#   cut short     the package cut to half its size: refused by its SHA-256, nothing staged, 1.0.0 plays on
#   update        a visitor holds a finger on the table while 1.1.0 is downloaded and checked: nothing changes under the visit; at the reset
#                 that follows it the table starts again, plays the new project, and finds nothing newer
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
src=$PWD/../examples/museum-table
tmp=$(mktemp -d); srv=; trap '[ -n "$srv" ] && { kill $srv; wait $srv; } 2>/dev/null; [ -n "$ZN_KEEP" ] && echo "kept $tmp" || rm -rf "$tmp"' EXIT   # ZN_KEEP=1 keeps the files of the runs
# a home of its own for what an update stages (apps/), the toolchain and the caches of the machine's home
real=${ZINC_HOME:-$HOME/.zinc}; mkdir -p "$tmp/home"
for f in "$real"/*; do [ -e "$f" ] && [ "$(basename "$f")" != apps ] && ln -s "$f" "$tmp/home/"; done
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1920x1080
id=org.zinc.test.museum-update; staged="$ZINC_HOME/apps/$id/staged"
eval "$("$Z" update-keygen | sed 's/^/k_/')"
mkdir "$tmp/www"
(cd "$tmp/www" && exec python3 -u -m http.server 0 --bind 127.0.0.1 > "$tmp/srv.out" 2>> "$tmp/requests") & srv=$!
port=
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  port=$(sed -n 's/.* port \([0-9][0-9]*\).*/\1/p' "$tmp/srv.out" | head -1); [ -n "$port" ] && break; sleep 0.25
done
[ -n "$port" ] || { echo "museum_update: no local server"; exit 2; }

table() {  # directory, version, start sequence, address ("" for none): the sample table with its project changed
  mkdir "$tmp/$1"; cp -R "$src/src" "$src/assets" "$src/zinc.json" "$tmp/$1/"
  rm "$tmp/$1"/assets/photos/* "$tmp/$1"/assets/panoramas/*   # the pictures make a package of 100 MB: without them the download is short
  python3 - "$tmp/$1" "$2" "$3" "$4" "$id" "$k_public" <<'PY'
import json, sys
d, version, start, url, app, key = sys.argv[1:]
z = json.load(open(d + '/zinc.json')); z['app'] = {'id': app, 'version': version}; z['update'] = {'publicKey': key}
json.dump(z, open(d + '/zinc.json', 'w'))
p = json.load(open(d + '/assets/project.json')); p['start'] = start
p['kiosk'] = {'fullscreen': True, 'attractAfter': 0, 'resetAfter': 2}
if url: p['kiosk']['updateUrl'] = url
json.dump(p, open(d + '/assets/project.json', 'w'))
PY
}
table v1 1.0.0 ukiyo-e "http://127.0.0.1:$port/"
table v2 1.1.0 wave "http://127.0.0.1:$port/"
"$Z" pack "$tmp/v1" -o "$tmp/table.zapp" > "$tmp/pack.log" 2>&1 || { echo "museum_update: pack failed: $(tail -3 "$tmp/pack.log")"; exit 1; }
"$Z" publish "$tmp/v2" --key "$k_seed" -o "$tmp/www" > "$tmp/pack.log" 2>&1 || { echo "museum_update: publish failed: $(tail -3 "$tmp/pack.log")"; exit 1; }
cp "$tmp/www/stable.manifest" "$tmp/good.manifest"; cp "$tmp/www/museum-table-1.1.0.zapp" "$tmp/good.zapp"
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null "http://127.0.0.1:$port/stable.manifest" && break; sleep 0.3; done
# a finger down from the second frame to frame 8000, in a corner where nothing is. The frames of a headless run do not wait for the clock
# and the download does: the visit lasts several times what the check and the package need (it is there near frame 1200 on the
# development Mac; a refusal near frame 700)
printf '2 touch 1 20.0 20.0\n8000 touchup 1\n' > "$tmp/visit.input"
fail=0
play() {  # frames, then the environment of the run: the story in $tmp/story, the error output in $tmp/err
  : > "$tmp/requests"; rm -rf "$ZINC_HOME/apps"
  frames=$1; shift
  env ZINC_FRAMES="$frames" "$@" "$Z" run "$tmp/table.zapp" -- --story > "$tmp/story" 2> "$tmp/err"
}
at() { grep -n -m1 -F -- "$1" "$tmp/story" | cut -d: -f1; }   # the line of the story where this is first said
kept() {  # what: version 1 played to the end and nothing was staged
  grep -q ' sequence wave' "$tmp/story" && { echo "museum_update ($1): the table plays the new project"; fail=1; }
  grep -q ' sequence ukiyo-e' "$tmp/story" || { echo "museum_update ($1): version 1 does not play: $(head -c 300 "$tmp/err")"; fail=1; }
  [ -e "$staged" ] && { echo "museum_update ($1): something was staged: $(cat "$staged")"; fail=1; }
  grep -q 'starting again' "$tmp/story" && { echo "museum_update ($1): the table started again"; fail=1; }
}

# no address: no request, though a newer version is published
mkdir "$tmp/quiet"; for f in "$tmp/v1/assets"/*; do ln -s "$f" "$tmp/quiet/"; done
rm "$tmp/quiet/project.json"; sed 's|, "updateUrl": "[^"]*"||' "$tmp/v1/assets/project.json" > "$tmp/quiet/project.json"
grep -q updateUrl "$tmp/quiet/project.json" && { echo "museum_update: the project without an address still has one"; exit 2; }
play 600 ZINC_ASSETS="$tmp/quiet" ZINC_HAR="$tmp/har"
kept "no address"
[ -s "$tmp/requests" ] && { echo "museum_update (no address): the server was asked: $(head -2 "$tmp/requests")"; fail=1; }
grep -q '"entries": *\[\]' "$tmp/har" || grep -q '"entries":\[\]' "$tmp/har" || { echo "museum_update (no address): the network log is not empty: $(head -c 300 "$tmp/har")"; fail=1; }
grep -q ' update' "$tmp/story" && { echo "museum_update (no address): the table looked for an update"; fail=1; }

# a channel edited after it was signed
sed 's/^version=1\.1\.0$/version=1.2.0/' "$tmp/good.manifest" > "$tmp/www/stable.manifest"
play 4200
kept "signature"
grep ' update: ' "$tmp/story" | grep -q -i 'signature' || { echo "museum_update (signature): the refusal is not in the story: $(grep ' update' "$tmp/story" | head -3)"; fail=1; }
grep -q 'museum-table: update: .*[Ss]ignature' "$tmp/err" || { echo "museum_update (signature): the refusal is not written for the staff"; fail=1; }

# a package cut short
cp "$tmp/good.manifest" "$tmp/www/stable.manifest"
head -c $(($(wc -c < "$tmp/good.zapp") / 2)) "$tmp/good.zapp" > "$tmp/www/museum-table-1.1.0.zapp"
play 4200
kept "cut short"
grep ' update: ' "$tmp/story" | grep -q -i -E 'sha-?256|checksum' || { echo "museum_update (cut short): the refusal is not in the story: $(grep ' update' "$tmp/story" | head -3)"; fail=1; }
grep -q 'museum-table-1.1.0.zapp' "$tmp/requests" || { echo "museum_update (cut short): the package was not asked for"; fail=1; }

# the update: downloaded under a visit, taken at the reset that follows it
cp "$tmp/good.zapp" "$tmp/www/museum-table-1.1.0.zapp"
play 8200 ZINC_INPUT="$tmp/visit.input"
old=$(at ' sequence ukiyo-e'); visit=$(at ' visit start'); got=$(at ' update: downloaded and verified'); end=$(at ' visit end')
reset=$(at ' reset: '); again=$(at ' update: the table is idle'); new=$(at ' sequence wave'); last=$(at ' update: museum-table 1.1.0 is up to date')
if [ -z "$old" ] || [ -z "$visit" ] || [ -z "$got" ] || [ -z "$end" ] || [ -z "$reset" ] || [ -z "$again" ] || [ -z "$new" ] || [ -z "$last" ]; then
  echo "museum_update (update): the story lacks a step (1.0.0 $old, visit $visit, downloaded $got, visit end $end, reset $reset, again $again, 1.1.0 $new, up to date $last):"
  grep -E ' (sequence|visit|reset|update)' "$tmp/story" | head -12; head -c 300 "$tmp/err"; fail=1
elif ! { [ "$old" -lt "$visit" ] && [ "$visit" -lt "$got" ] && [ "$got" -lt "$end" ] && [ "$end" -lt "$reset" ] && [ "$reset" -lt "$again" ] && [ "$again" -lt "$new" ] && [ "$new" -lt "$last" ]; }; then
  echo "museum_update (update): out of order: 1.0.0 $old, visit $visit, downloaded $got, visit end $end, reset $reset, again $again, 1.1.0 $new, up to date $last"; fail=1
fi
grep -q 'museum-table: update: the table is idle' "$tmp/err" || { echo "museum_update (update): the switch is not written for the staff"; fail=1; }
[ -f "$ZINC_HOME/apps/$id/current" ] && [ ! -e "$ZINC_HOME/apps/$id/trial" ] || { echo "museum_update (update): 1.1.0 was not kept"; fail=1; }
[ $fail = 0 ] && echo "museum_update: ok"
exit $fail
