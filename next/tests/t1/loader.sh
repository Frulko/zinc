#!/bin/sh
# The loader stage (ZN-447): zinc.json "loading" draws its screen every frame while the groups load, before the program's own modules start,
# then cross-fades into the program's frames. On tests/data/loader (groups boot and level, a splash) with 8 KB asset turns: the progress a
# screen is given is monotone, ends at 1 and main starts after it with boot resident (interpreter; QuickJS prints the same lines); the frames
# of the default screen (the splash with a thin bar) and of its fade are the golden (tests/golden/loader/frames.txt, ZN_UPDATE_GOLDEN=1
# rewrites it), the same with the decoding on the main thread and in the executable `zinc build` makes; a zinc:ui screen (zinc:loader/ui)
# runs; game-2d shows its loading bar while its assets load in small turns, then its title, and no loader when they load in the first turn.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 HOME="$tmp" ZINC_HOME="$tmp/.zinc"
unset ZINC_ASSETS ZINC_PACKS ZINC_ASSET_RAM ZINC_ASSET_THREADS ZINC_ASSET_TURN ZINC_SPLASH ZINC_FRAMES
fail=0
no() { echo "loader: $*"; fail=1; }
p="$tmp/proj"
mkdir -p "$p"
cp -R tests/data/loader/. "$p/"
mk() { mkdir -p "$(dirname "$p/assets/$1")"; yes "$2" | head -c "$3" > "$p/assets/$1"; }
mk boot/a.bin alpha 40000
mk boot/b.bin bravo 30000
mk boot/c.bin charlie 20000
mk boot/e.bin echo 16000
mk boot/f.bin foxtrot 12000
mk boot/d.json '{"boot":1}' 11
mk level/x.bin level 50000
screen() { sed "s#\"screen\": \"default\"#\"screen\": \"$1\"#" tests/data/loader/zinc.json > "$p/zinc.json"; }

# progress: a screen of the project's own prints what it is given each frame
screen src/screen.ts
out=$(cd "$p" && ZINC_FRAMES=30 ZINC_ASSET_TURN=8192 "$Z" run . 2>&1)
printf '%s\n' "$out" | awk '
  /^progress / { v = $2 + 0; if (seen && v < last) bad = bad " " last ">" v; last = v; seen = 1; if (started) late = 1; next }
  /^main: boot loaded/ { started = 1 }
  END { if (bad != "") print "not monotone:" bad; if (last != 1) print "ends at " last; if (!started) print "main never started"; if (late) print "a progress line after main started" }' > "$tmp/check"
n=$(printf '%s\n' "$out" | grep '^progress ' | sort -u | wc -l | tr -d ' ')
[ "$n" -ge 5 ] || echo "only $n values" >> "$tmp/check"
[ -s "$tmp/check" ] && no "progress: $(cat "$tmp/check"): $(printf '%s\n' "$out" | head -12)"
printf '%s\n' "$out" | grep -qxF 'main: boot loaded true, level loaded false, {"boot":1}' || no "main did not start with boot resident: $(printf '%s\n' "$out" | tail -5)"
q=$(cd "$p" && ZINC_FRAMES=30 ZINC_ASSET_TURN=8192 "$Z" run . --engine quickjs 2>&1)
[ "$q" = "$out" ] || { no "QuickJS prints other lines:"; printf '%s\n' "$out" > "$tmp/i"; printf '%s\n' "$q" > "$tmp/q"; diff "$tmp/i" "$tmp/q" | head -10; }

# the golden: the default screen (the splash, a thin bar), then its fade into main's frames
screen default
frames() { (cd "$p" && env ZINC_FRAMES=16 ZINC_FRAMEHASH=all ZINC_ASSET_TURN=8192 "$@" 2>&1 | grep framehash); }
a=$(frames "$Z" run .); b=$(frames ZINC_ASSET_THREADS=0 "$Z" run .)
g=tests/golden/loader/frames.txt
[ -n "$ZN_UPDATE_GOLDEN" ] && { mkdir -p "$(dirname "$g")"; printf '%s\n' "$a" > "$g"; }
[ "$a" = "$(cat "$g")" ] || { no "the frames differ from $g:"; printf '%s\n' "$a" | diff "$g" - | head -10; }
[ "$a" = "$b" ] || no "the frames differ with the decoding on the main thread"
if [ -n "$CXX" ] || command -v c++ >/dev/null; then   # built ahead of time: the same stage in the executable, the same frames
  if (cd "$p" && "$Z" build src/main.ts -o build/app >/dev/null 2>"$tmp/build.err"); then
    c=$(frames "$p/build/app")
    [ "$a" = "$c" ] || no "the built program's frames differ"
  else no "zinc build failed: $(head -c 300 "$tmp/build.err")"
  fi
fi

# minMs 190 with everything loaded in the first turn: the screen holds 12 frames of 1/60 s, then the fade starts
sed 's#"fadeMs": 100#"minMs": 190, "fadeMs": 100#' tests/data/loader/zinc.json > "$p/zinc.json"
m=$(frames ZINC_ASSET_TURN=4194304 "$Z" run . | awk '{ print $5 }')
[ "$(printf '%s\n' "$m" | head -12 | sort -u | wc -l | tr -d ' ')" = 1 ] && [ "$(printf '%s\n' "$m" | sed -n 13p)" != "$(printf '%s\n' "$m" | head -1)" ] || no "minMs 190: not 12 frames of the screen: $(printf '%s\n' "$m" | tr '\n' ' ')"

# a zinc:ui screen
screen src/uiscreen.tsx
u=$(cd "$p" && ZINC_FRAMES=8 ZINC_ASSET_TURN=8192 "$Z" run . 2>&1) || no "the zinc:ui screen failed: $(printf '%s\n' "$u" | head -5)"
printf '%s\n' "$u" | grep -qx 'main: 3 frames' || no "after the zinc:ui screen, main did not run: $(printf '%s\n' "$u" | head -5)"

# game-2d: its title frames are all the same; with small asset turns its loading bar comes first
"$Z" new game-2d "$tmp/g2d" >/dev/null || no "zinc new game-2d failed"
g2() { (cd "$tmp/g2d" && env ZINC_FRAMES=14 ZINC_FRAMEHASH=all "$@" "$Z" run . 2>&1 | awk '/framehash/ { print $5 }'); }
whole=$(g2); small=$(g2 ZINC_ASSET_TURN=2048)
title=$(printf '%s\n' "$whole" | head -1)
[ -n "$title" ] && [ "$(printf '%s\n' "$whole" | sort -u)" = "$title" ] || no "game-2d loaded in one turn: not 14 title frames (no loader expected): $whole"
[ "$(printf '%s\n' "$small" | head -1)" != "$title" ] || no "game-2d: no loading screen while its assets load"
[ "$(printf '%s\n' "$small" | tail -1)" = "$title" ] || no "game-2d: the title does not follow its loading screen"
[ $fail -eq 0 ] && echo "loader: ok"
exit $fail
