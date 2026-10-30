#!/bin/sh
# Each project keeps its own store (<zinc home>/apps/<zinc.json name>/storage.kv) on every engine and whatever file runs: two projects
# never see each other's keys under the interpreter, native (AOT), QuickJS, and zinc dev's wrapper entry build/.zinc-dev/main.ts (which
# once ran QuickJS programs on the shared <zinc home>/storage.kv). A file without a project keeps a store named after it.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_FRAMES=1
unset ZINC_APP_NAME ZINC_STORAGE ZINC_APP_DATA
for p in alpha beta; do
  mkdir -p "$tmp/$p/src" "$tmp/$p/build/.zinc-dev"
  printf '{ "name": "%s", "entry": "src/main.ts" }\n' "$p" > "$tmp/$p/zinc.json"
  cat > "$tmp/$p/src/main.ts" <<TS
import * as storage from 'zinc:storage';
storage.set('$p.' + (storage.keys().length + 1), '1');
console.log('keys=' + storage.keys().join(','));
TS
  printf "import '../../src/main.ts';\n" > "$tmp/$p/build/.zinc-dev/main.ts"   # as zinc dev writes it (without zinc:devtools: no frame loop)
done
fail=0
check() {   # check <what> <want> <zinc run args...>
  what=$1 want=$2; shift 2
  got=$("$ZINC" run "$@" 2>&1 | sed -n 's/^keys=//p')
  [ "$got" = "$want" ] || { echo "$what: keys '$got', not '$want'"; fail=1; }
}
check "interpreter" "alpha.1" --interp "$tmp/alpha"
check "interpreter, wrapper entry" "alpha.1,alpha.2" --interp "$tmp/alpha/build/.zinc-dev/main.ts"
check "QuickJS" "beta.1" "$tmp/beta" --engine quickjs
check "QuickJS, wrapper entry" "beta.1,beta.2" "$tmp/beta/build/.zinc-dev/main.ts" --engine quickjs
check "native" "alpha.1,alpha.2,alpha.3" --native "$tmp/alpha"
check "native, wrapper entry" "beta.1,beta.2,beta.3" --native "$tmp/beta/build/.zinc-dev/main.ts"
[ -e "$ZINC_HOME/storage.kv" ] && { echo "the shared store was written: $(cat "$ZINC_HOME/storage.kv")"; fail=1; }
[ $fail -eq 0 ] && echo "app storage engines: ok"
exit $fail
