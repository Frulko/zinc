#!/bin/sh
# Museum table, the editor's tools for agencies (ZN-650.07.05, examples/museum-table/editor): menus, multi-selection, clipboard, nudging.
#   the document without a window (selftest.ts with a directory): each command (align on six edges and axes, distribute across and down,
#                  nudge, cut, copy and paste on the same table, on another table, on the storyboard, into another project) leaves the file
#                  of golden/museum-editor/tools/<command>.json, is one step, and one Undo gives the bytes back
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/museum-table; g=$PWD/tests/golden/museum-editor/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
same() {  # what, file, golden
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$2" "$3"; return; fi
  cmp -s "$2" "$3" || { echo "$1: $(basename "$2") differs from $3"; diff "$2" "$3" 2>/dev/null | head -10; fail=1; }
}

mkdir -p "$tmp/commands"
out=$("$ZINC" run "$ex/editor/selftest.ts" -- "$ex/assets/project.json" "$tmp/commands" 2>&1) || fail=1
case $out in *FAILED*|*panic*|*error*) fail=1 ;; esac
[ $fail = 0 ] || { echo "the document's self-test:"; printf '%s\n' "$out" | grep -v '^ok: ' | head -20; }
for c in align-left align-centre align-right align-top align-middle align-bottom distribute-across distribute-down nudge nudge-sequences \
         cut-items cut-sequences paste-items paste-items-elsewhere paste-sequences paste-other-project; do
  same "the command $c" "$tmp/commands/$c.json" "$g/$c.json"
done

[ $fail = 0 ] && echo "museum_editor_tools: ok"
exit $fail
