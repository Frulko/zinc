#!/bin/sh
# What a photo manager does to files: zinc:system/opener trash() moves a file to the freedesktop.org trash of the simulator ($XDG_DATA_HOME/Trash:
# files/ and info/<name>.trashinfo with its original path), a second file of the same name gets a free name, a missing file is false; and
# zinc:fs copyFile keeps the source's modification time. On the interpreter and on QuickJS.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1
mkdir -p "$tmp/p"
printf '{ "name": "files", "entry": "main.ts", "permissions": ["opener", "fs"] }\n' > "$tmp/p/zinc.json"
cat > "$tmp/p/main.ts" <<'EOF'
import { trash } from 'zinc:system/opener';
import { copyFile, stat, exists } from 'zinc:fs';
import { env } from 'zinc:sys';
const d = env('FILES_DIR');
console.log(`trash ${trash(d + '/a b.jpg')} ${exists(d + '/a b.jpg')}`);
console.log(`again ${trash(d + '/sub/a b.jpg')}`);
console.log(`missing ${trash(d + '/none.jpg')}`);
copyFile(d + '/old.jpg', d + '/copy.jpg');
console.log(`copy ${stat(d + '/copy.jpg').mtimeMs === stat(d + '/old.jpg').mtimeMs} ${Math.floor(stat(d + '/copy.jpg').mtimeMs / 1000)}`);
EOF
want="trash true false
again true
missing false
copy true 1704067200"
for engine in interp quickjs; do
  rm -rf "$tmp/f" "$tmp/xdg"; mkdir -p "$tmp/f/sub"
  echo one > "$tmp/f/a b.jpg"; echo two > "$tmp/f/sub/a b.jpg"; echo old > "$tmp/f/old.jpg"
  TZ=UTC touch -t 202401010000 "$tmp/f/old.jpg"
  flag=; [ $engine = quickjs ] && flag="--engine quickjs"
  got=$(cd "$tmp/p" && FILES_DIR="$tmp/f" XDG_DATA_HOME="$tmp/xdg" ZINC_SYSTEM_LOG="$tmp/log" timeout 60 "$ZINC" run . $flag 2>&1)
  [ "$got" = "$want" ] || { echo "$engine: the file operations differ: $got"; fail=1; continue; }
  [ "$(cat "$tmp/xdg/Trash/files/a b.jpg")" = one ] && [ "$(cat "$tmp/xdg/Trash/files/a b.jpg.2")" = two ] || { echo "$engine: the trash does not hold both files: $(ls "$tmp/xdg/Trash/files")"; fail=1; }
  real=$(cd "$tmp/f" && pwd -P)
  grep -qx "Path=$(echo "$real" | sed 's/ /%20/g')/a%20b.jpg" "$tmp/xdg/Trash/info/a b.jpg.trashinfo" && grep -q '^DeletionDate=[0-9-]*T[0-9:]*$' "$tmp/xdg/Trash/info/a b.jpg.trashinfo" \
    || { echo "$engine: the trash info is wrong: $(cat "$tmp/xdg/Trash/info/a b.jpg.trashinfo")"; fail=1; }
done
exit $fail
