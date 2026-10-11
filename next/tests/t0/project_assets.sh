#!/bin/sh
# zinc.json's game keys (ZN-435): the parser's unit checks (each key, each error, the merge of profiles), `zinc assets info` prints the profile
# and budgets in force on each target, the assets directory, rules and groups of zinc.json drive `zinc assets build`, a malformed key stops
# it, and a project without the keys (or with only the string form, or only loading and launcher) builds the same packs (a splash adds its
# entry to boot.zpk: tests/t1/splash.sh).
BUILD=${BUILD:-build}
[ -x "$BUILD/project_test" ] || { echo "skipped: project_test is not built"; exit 77; }
out=$("$BUILD/project_test" 2>&1)
echo "$out" | grep -q 'all checks passed' || { echo "$out" | tail -20; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
svg() { printf '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="%s"/></svg>' "$1"; }
mkdir -p "$tmp/p/art/data"
svg '#ff0000' > "$tmp/p/art/a.svg"; svg '#00ff00' > "$tmp/p/art/b.svg"; echo level > "$tmp/p/art/data/x.txt"
cat > "$tmp/p/zinc.json" <<'JSON'
{ "name": "p",
  "assets": { "dir": "art",
    "rules": [{ "match": "*.svg", "format": "rgb565" }, { "match": "data/**", "as": "copy" }],
    "groups": { "boot": { "include": ["*.svg"], "exclude": ["b.svg"] } },
    "profiles": { "desktop": { "pack": "lz4", "maxSize": 2048 } },
    "budgets": { "macos": { "gpu": "256MB" } } },
  "splash": "art/a.svg",
  "targets": { "macos": { "assets": { "profile": "desktop", "pot": true } } } }
JSON
info=$("$ZINC" assets info "$tmp/p") || { echo "assets info failed: $info"; exit 1; }
for want in "assets: art, 2 rules, 1 group (boot)" \
            "macos: profile desktop, audio opus, maxSize 2048, pack lz4, pot true, sfx opus, texture bc7|bc1|rgba8; budgets boot 32MB, gpu 256MB, ram 1GB" \
            "rpi1: profile default, audio vorbis, maxSize 2048, pack lz4, pot false, sfx qoa, texture etc1|rgba4444|rgba5551|rgb565|rgba8; budgets boot 4MB, gpu 40MB, ram 150MB" \
            "esp32: profile default, audio adpcm:16000, maxSize 320, pack lz4, pot false, sfx adpcm:16000, texture rgb565; budgets boot 16KB, flash 2MB, ram 96KB"; do
  echo "$info" | grep -qxF "$want" || { echo "assets info: no line \"$want\""; echo "$info"; exit 1; }
done
[ "$(echo "$info" | wc -l)" -ge 10 ] || { echo "assets info: not one line per target"; echo "$info"; exit 1; }
one=$("$ZINC" assets info "$tmp/p" --target wasm) && [ "$(echo "$one" | sed 1d)" = "wasm: profile default, audio opus, maxSize 4096, pack none, pot false, sfx qoa, split group, texture ktx2:uastc|rgba8; budgets boot 3MB, download 40MB, gpu 256MB, ram 512MB" ] ||
  { echo "assets info --target wasm: $one"; exit 1; }
"$ZINC" assets info "$tmp/p" --target nes >/dev/null 2>&1; [ $? -eq 2 ] || { echo "an unknown target is not refused"; exit 1; }

# rules, groups and the directory of zinc.json drive the build
"$ZINC" assets build "$tmp/p" >/dev/null || exit 1
report=$(cat "$tmp"/p/build/assets/*/report.json)
for row in '"name": "a.svg", "importer": "image", "group": "boot"' '"name": "b.svg", "importer": "image", "group": "default"' '"name": "data/x.txt", "importer": "copy", "group": "default"'; do
  echo "$report" | grep -qF "$row" || { echo "report: no $row"; echo "$report"; exit 1; }
done

# a malformed key stops the build and names its line
sed 's/"pack": "lz4"/"pack": "rar"/' "$tmp/p/zinc.json" > "$tmp/z" && cp "$tmp/z" "$tmp/p/zinc.json"
err=$("$ZINC" assets build "$tmp/p" 2>&1); code=$?
[ $code -eq 2 ] && case "$err" in *"zinc.json: line 5: assets.profiles.desktop.pack must be"*) true ;; *) false ;; esac || { echo "a bad key: exit $code: $err"; exit 1; }

# without the keys: the same packs as with only the string form, a dir object, or only loading and launcher (dev and release)
mkdir -p "$tmp/q"; cp -R "$tmp/p/art" "$tmp/q/assets"
for manifest in '' '{ "assets": "assets" }' '{ "assets": { "dir": "assets" } }' \
                '{ "loading": { "screen": "bar" }, "launcher": { "entry": "l.ts", "targets": [] } }'; do
  rm -rf "$tmp/q/build" "$tmp/q/zinc.json"
  [ -n "$manifest" ] && echo "$manifest" > "$tmp/q/zinc.json"
  for profile in "" --release; do
    "$ZINC" assets build "$tmp/q" $profile >/dev/null || { echo "build with $manifest failed"; exit 1; }
    sum=$(cat "$tmp"/q/build/assets/*/*.zpk | cksum) key=${profile#--}
    if [ -z "$manifest" ]; then eval "base_$key=\$sum"
    else eval "want=\$base_$key"; [ "$sum" = "$want" ] || { echo "packs differ with $manifest $profile"; exit 1; }; fi
  done
done
exit 0
