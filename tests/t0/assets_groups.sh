#!/bin/sh
# zinc:assets v2 (ZN-436, src/host/assets_host.h) on a project with four asset groups and a ram budget of 256 KB (tests/data/assets_groups):
# zinc run builds its dev packs and mounts them; three groups load with monotone byte progress ending at 1, a fourth over the budget fails
# naming the group and the budget, a handle outlives its group, the v1 calls read through the packs, unloading frees every byte (zinc mem
# reports nothing resident at exit); the frames of a program that draws while it loads are the same on every deterministic run, on the
# libuv pool and decoded on the main thread; a pack mounted in front overrides the base one.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p="$tmp/proj"
mkdir -p "$p"
cp tests/data/assets_groups/* "$p/"
mk() { mkdir -p "$(dirname "$p/assets/$1")"; yes "$2" | head -c "$3" > "$p/assets/$1"; }
mk boot/hello.txt hello 6
mk boot/tiles.bin tile 40000
mk level1/a.bin level-one 65536
mk level1/b.json '{"level":1}' 12
mk level2/c.bin level-two 30000
mk level2/d.bin d 20000
mk big/huge.bin huge 300000
mk note.txt note 5
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 HOME="$tmp" ZINC_HOME="$tmp/.zinc"
unset ZINC_ASSETS ZINC_PACKS ZINC_ASSET_RAM ZINC_ASSET_THREADS ZINC_ASSET_TURN
fail=0
want() { printf '%s\n' "$2" | grep -qxF -- "$3" || { echo "assets_groups: $1: no line '$3' in:"; printf '%s\n' "$2" | head -30; fail=1; }; }

out=$(cd "$p" && "$Z" run . 2>&1)
want run "$out" "groups big boot default level1 level2"
want run "$out" "assets: 'level1/b.json' is not loaded: load its group 'level1' first"
want run "$out" "boot: several reports, monotone true, ends at 1, loaded true"
want run "$out" "level1: several reports, monotone true, ends at 1, loaded true"
want run "$out" "level2: several reports, monotone true, ends at 1, loaded true"
want run "$out" "resident 155554 of 262144, groups 3, packs 5, pending 0"
want run "$out" 'handle level1/b.json: {"level":1}, 12 bytes'
want run "$out" "assets: group 'big' needs 300000 bytes: over the ram budget of 262144 bytes (155554 in use)"
want run "$out" "assets: no group 'nope' in the mounted packs (groups: big, boot, default, level1, level2)"
want run "$out" "v1: hello, 30000 bytes, exists true, 8 names"
want run "$out" 'level1 unloaded: resident 90018, the handle still reads {"level":1}'
want run "$out" "handle released: resident 90006"
want run "$out" "all unloaded: resident 0, peak 155554, groups 0"

# the QuickJS engine: the same module source (type-stripped), the same lines
q=$(cd "$p" && "$Z" run main.ts --engine quickjs 2>&1)
[ "$q" = "$out" ] || { echo "assets_groups: quickjs differs:"; printf '%s\n' "$out" > "$tmp/i"; printf '%s\n' "$q" > "$tmp/q"; diff "$tmp/i" "$tmp/q" | head -40; fail=1; }

# a .zapp of the project carries its group packs (packs/<group>.zpk) and runs the same
"$Z" pack "$p" -o "$tmp/g.zapp" >/dev/null || { echo "assets_groups: zinc pack failed"; fail=1; }
tar tf "$tmp/g.zapp" | grep -qx 'packs/level1.zpk' || { echo "assets_groups: the .zapp has no packs/level1.zpk"; fail=1; }
z=$(cd "$tmp" && "$Z" run "$tmp/g.zapp" 2>&1)
[ "$z" = "$out" ] || { echo "assets_groups: the .zapp run differs:"; printf '%s\n' "$out" > "$tmp/i"; printf '%s\n' "$z" > "$tmp/z"; diff "$tmp/i" "$tmp/z" | head -20; fail=1; }

# zinc mem: the bytes the groups held, none left at exit
mem=$(cd "$p" && ZINC_PACKS="$p/build/assets/$(uname | sed 's/Darwin/macos/;s/Linux/linux/')" ZINC_ASSET_RAM=262144 "$Z" mem main.ts 2>/dev/null)
want mem "$mem" "          assets: peak 155554 bytes resident, 0 at exit"

# frames: the same lines and hashes on every deterministic run, with the decoding on the libuv pool or on the main thread (16 KB a turn)
frames() { (cd "$p" && env ZINC_FRAMES=40 ZINC_FRAMEHASH=all ZINC_ASSET_TURN=16384 "$@" "$Z" run frames.ts 2>&1); }
a=$(frames); b=$(frames); c=$(frames ZINC_ASSET_THREADS=0)
[ -n "$DEBUG" ] && echo "$a"
want frames "$a" "frame 0: level1 65536 of 65548"
want frames "$a" "frame 1: level2 30000 of 50000"
want frames "$a" "frame 2: level2 loaded"
[ "$(printf '%s\n' "$a" | grep -c framehash)" = 40 ] || { echo "assets_groups: frames: not 40 frame hashes"; fail=1; }
[ "$a" = "$b" ] || { echo "assets_groups: frames: two deterministic runs differ"; printf '%s\n' "$a" > "$tmp/a"; printf '%s\n' "$b" > "$tmp/b"; diff "$tmp/a" "$tmp/b" | head; fail=1; }
[ "$a" = "$c" ] || { echo "assets_groups: frames: the pool and the main thread differ"; printf '%s\n' "$a" > "$tmp/a"; printf '%s\n' "$c" > "$tmp/c"; diff "$tmp/a" "$tmp/c" | head; fail=1; }

# a mod: level1.zpk of another project, mounted in front of the base packs
m="$tmp/mod"
mkdir -p "$m/assets/level1" "$p/mods"
printf '{ "name": "mod", "assets": { "groups": { "level1": { "include": ["level1/**"] } } } }\n' > "$m/zinc.json"
printf '{"level":"mod"}\n' > "$m/assets/level1/b.json"
"$Z" assets build "$m" >/dev/null && cp "$m"/build/assets/*/level1.zpk "$p/mods/" || { echo "assets_groups: the mod's pack did not build"; fail=1; }
out=$(cd "$p" && "$Z" run overlay.ts 2>&1)
want overlay "$out" 'before: {"level":1}'
want overlay "$out" 'mounted 1'
want overlay "$out" 'after: {"level":"mod"}'
want overlay "$out" 'loaded: {"level":"mod"}, a.bin 65536 bytes from the base'
want overlay "$out" 'assets: cannot open nothing.zpk'

[ $fail -eq 0 ] && echo "assets groups: ok"
exit $fail
