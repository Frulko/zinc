#!/bin/sh
# zinc dev's recompile gives the bytes of a cold compile (ZN-1024): the caches a save reuses in the running process and the passes that run
# on several threads change nothing. A hot compile of hero and of the desktop-app template on one thread, then on the default threads with
# two more compiles in the same process (ZN_HOT_RECOMPILE: each must give the bytes of the first): the units (ZBC, keys, fonts and images) match.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
cp -R templates/desktop-app "$tmp/app"
find "$tmp/app" -type f \( -name '*.json' -o -name '*.ts' -o -name '*.tsx' \) -exec perl -pi -e 's/\{\{(name|id)\}\}/hotapp/g' {} +
export ZINC_DETERMINISTIC=1
for case in "examples/hero:src/main.tsx" "$tmp/app:src/main.tsx"; do
  dir=${case%%:*}; entry=${case#*:}; name=$(basename "$dir")
  (cd "$dir" && ZN_IR_THREADS=1 "$ZINC" --emit=hot "$entry" "$tmp/$name.one" > "$tmp/$name.one.log" 2>&1) || { echo "$name: one-thread compile failed: $(head -c 300 "$tmp/$name.one.log")"; fail=1; continue; }
  (cd "$dir" && ZN_HOT_RECOMPILE=2 "$ZINC" --emit=hot "$entry" "$tmp/$name.warm" > "$tmp/$name.warm.log" 2>&1) || { echo "$name: warm recompile failed or differed: $(grep -m1 'recompile\|error' "$tmp/$name.warm.log")"; fail=1; continue; }
  [ "$(grep -c 'same bytes' "$tmp/$name.warm.log")" = 2 ] || { echo "$name: expected two recompiles with the same bytes"; fail=1; }
  cmp -s "$tmp/$name.one" "$tmp/$name.warm" || { echo "$name: the threaded compile differs from the one-thread compile"; fail=1; }
done
[ $fail = 0 ] && echo "hot recompile: same bytes cold and warm, one thread and several"
exit $fail
