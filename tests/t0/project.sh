#!/bin/sh
# zinc.json is read by `zinc run` (ZN-078): a directory argument finds its entry (zinc.json "entry" or "main", else src/main.ts), the window size of the
# target reaches the graphics host, relative file names are the project's whatever the working directory, unknown keys are reported, and
# growDrawCommands lifts the draw command pool limit (a program that draws 9000 rectangles drops commands without it).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/app/src" "$tmp/app/media" "$tmp/other"
echo "hello from media" > "$tmp/app/media/note.txt"
cat > "$tmp/app/src/main.ts" <<'TS'
import { onFrame, width, height } from 'zinc:gfx'
import { readText } from 'zinc:fs'
const note = readText('media/note.txt').trim()
onFrame((dt: number) => { console.log(width() + 'x' + height(), note) })
TS
cat > "$tmp/app/zinc.json" <<'JSON'
{ "name": "app", "entry": "src/main.ts", "colour": 1,
  "targets": { "macos": { "width": 123, "height": 45 }, "linux": { "width": 123, "height": 45 }, "sim": { "width": 123, "height": 45 } } }
JSON
run() { (cd "$2" && ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 "$ZINC" run "$1" 2>&1); }
out=$(run "$tmp/app" "$tmp/other")
case "$out" in *"123x45 hello from media"*) ;; *) echo "directory argument, window size or project cwd: $out"; fail=1 ;; esac
case "$out" in *'unknown key "colour"'*) ;; *) echo "an unknown key is not reported: $out"; fail=1 ;; esac
out=$(run "$tmp/app/src/main.ts" "$tmp/other")  # a file argument finds the project above it
case "$out" in *"123x45 hello from media"*) ;; *) echo "file argument does not find its zinc.json: $out"; fail=1 ;; esac
sed -i.bak 's/"entry": "src\/main.ts"/"main": "src\/main.ts"/' "$tmp/app/zinc.json"
out=$(run "$tmp/app" "$tmp/other")
case "$out" in *"123x45 hello from media"*) ;; *) echo '"main" is not honoured as the entry'; fail=1 ;; esac
# the draw command pool
cat > "$tmp/app/src/main.ts" <<'TS'
import { onFrame, rect, clear } from 'zinc:gfx'
onFrame((dt: number) => { clear(0); for (let i: i32 = 0; i < 9000; i++) rect(i % 100, 0, 1, 1, 0xffffff) })
TS
out=$(run "$tmp/app" "$tmp/other")
case "$out" in *"draw command pool is full"*) ;; *) echo "the pool limit is not reported without growDrawCommands: $out"; fail=1 ;; esac
cat > "$tmp/app/zinc.json" <<'JSON'
{ "name": "app", "entry": "src/main.ts", "targets": { "macos": { "growDrawCommands": true }, "linux": { "growDrawCommands": true }, "sim": { "growDrawCommands": true } } }
JSON
out=$(run "$tmp/app" "$tmp/other")
case "$out" in *"draw command pool is full"*) echo "growDrawCommands does not lift the pool limit: $out"; fail=1 ;; esac
# the "crash" key is gone (ZN-999): refused with J0001, which zinc explain knows
echo '{ "name": "app", "entry": "src/main.ts", "crash": "restart" }' > "$tmp/app/zinc.json"
out=$(run "$tmp/app" "$tmp/other")
case "$out" in *'"crash" is gone'*J0001*) ;; *) echo "zinc.json crash is not refused with J0001: $out"; fail=1 ;; esac
"$ZINC" explain J0001 | grep -q '^J0001: ' || { echo "zinc explain J0001 prints nothing"; fail=1; }
# zinc project --json (ZN-1021): the project as the engine reads it, from a zinc.json with a byte order mark, a comment and a trailing comma;
# the targets in file order with the permissions in force there, and the plugins the program loads
printf "import * as audio from 'zinc:audio';\nconsole.log('x');\n" > "$tmp/app/src/main.ts"
printf '\357\273\277{\n  // a comment\n  "name": "app", "entry": "src/main.ts", "permissions": ["menu"],\n  "targets": { "macos": { "width": 9, "permissions": ["tray"] }, "linux": { "width": 8 }, },\n}\n' > "$tmp/app/zinc.json"
out=$("$ZINC" project --json "$tmp/app" | tr -d ' \n')
case "$out" in *'"format":1,'*'"manifest":true,"name":"app",'*'"main":"src/main.ts",'*'"targets":[{"name":"macos","width":9,'*'"permissions":["menu","tray"]},{"name":"linux",'*'"plugins":[{"name":"audio","module":"zinc:audio",'*) ;;
  *) echo "zinc project --json does not print the project: $out"; fail=1 ;; esac
"$ZINC" project --json "$tmp/other" | tr -d ' \n' | grep -q '"manifest":false' || { echo "zinc project --json of a folder without zinc.json"; fail=1; }
exit $fail
