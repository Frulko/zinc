#!/bin/sh
# zinc:loro, the Loro CRDT with the loro-crdt API (plugins/loro): the plugin builds its Rust crate with cargo (once: the cache keeps it), and
# - tests/data/loro/edit.ts (imported as 'loro-crdt') edits a document through maps, lists, rich text and a movable tree, checks out
#   an old version and back, syncs three peers that edited one text at once by updates and a fourth live, round-trips version
#   vectors and presence, and prints tests/data/loro/edit.out on the interpreter, on QuickJS and compiled;
# - the same program reads a document Node's loro-crdt made (the committed fixture node.snapshot, then node.update on top of it);
# - with Node and loro-crdt at hand (LORO_CRDT: a directory whose node_modules has it), Node imports what Zinc exported and gets
#   the same JSON, then edits it as another peer and Zinc imports that update and gets Node's JSON.
cd "$(dirname "$0")/../.." || exit 2
command -v cargo >/dev/null 2>&1 || [ -x "$HOME/.cargo/bin/cargo" ] || { echo "loro: no cargo on this machine (rustup.rs)"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" plugin-build loro >"$tmp/plugin.log" 2>&1 || { echo "loro: the plugin does not build: $(tail -c 600 "$tmp/plugin.log")"; exit 1; }
d=tests/data/loro
LORO_DIR="$tmp" LORO_FIXTURE=$d "$ZINC" run $d/edit.ts >"$tmp/edit.out" 2>"$tmp/edit.err"
cmp -s "$tmp/edit.out" $d/edit.out || { echo "loro: edit.ts differs from edit.out:"; diff "$tmp/edit.out" $d/edit.out | head -20; fail=1; }
LORO_FIXTURE=$d "$ZINC" run $d/edit.ts --engine quickjs 2>/dev/null | cmp -s - $d/edit.out || { echo "loro: edit.ts differs from edit.out on QuickJS"; fail=1; }
"$ZINC" build $d/edit.ts -o "$tmp/edit" >"$tmp/build.log" 2>&1 && LORO_FIXTURE=$d "$tmp/edit" 2>&1 | cmp -s - $d/edit.out || { echo "loro: edit.ts differs from edit.out compiled: $(tail -c 300 "$tmp/build.log")"; fail=1; }
if [ -n "$LORO_CRDT" ] && command -v node >/dev/null 2>&1; then
  node $d/node.mjs check "$tmp" >"$tmp/node.log" 2>&1 || { echo "loro: loro-crdt reads Zinc's documents differently: $(cat "$tmp/node.log")"; fail=1; }
  LORO_DIR="$tmp" "$ZINC" run $d/edit.ts >/dev/null 2>&1
  node $d/node.mjs after "$tmp" >>"$tmp/node.log" 2>&1 || { echo "loro: Zinc reads loro-crdt's update differently: $(tail -3 "$tmp/node.log")"; fail=1; }
  [ $fail -eq 0 ] && echo "loro: loro-crdt $(node -p "require('$LORO_CRDT/node_modules/loro-crdt/package.json').version") agrees ($(grep -c same "$tmp/node.log") checks)"
fi
exit $fail
