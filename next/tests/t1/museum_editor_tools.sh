#!/bin/sh
# Museum table, the editor's tools for agencies (ZN-650.07.05, examples/museum-table/editor): menus, multi-selection, clipboard, nudging,
# recent projects, files dropped on the window.
#   the document without a window (selftest.ts with a directory): each command (align on six edges and axes, distribute across and down,
#                  nudge, cut, copy and paste on the same table, on another table, on the storyboard, into another project) leaves the file
#                  of golden/museum-editor/tools/<command>.json, is one step, and one Undo gives the bytes back
#   session.input  one scripted session on the project of the table session, with session.system for what the system does (the menu bar,
#                  the answers of the context menus, a dropped file): select all, align and distribute from the menu bar, nudge with the
#                  arrow keys, copy, paste, duplicate and cut by their keys on the storyboard and on a table, paste on another table, the
#                  context menus of a sequence and of a table, a picture dropped from outside the project copied into its folder and added
#                  to the library, Save: the file equals session.json, the player's loader accepts it, one frame (three pasted sequences
#                  selected together) equals its golden
#   recent.input   the editor started with no project: File > Open recent lists the project of that session first; chosen there, it
#                  opens; a new sequence and Save: the file equals recent.json
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/museum-table; g=$PWD/tests/golden/museum-editor/tools
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
same() {  # what, file, golden
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$2" "$3"; return; fi
  cmp -s "$2" "$3" || { echo "$1: $(basename "$2") differs from $3"; diff "$2" "$3" 2>/dev/null | head -10; fail=1; }
}
edit() {  # project file ('' for none), input file, system script, frames, [frames to capture]
  sed "s|@TMP@|$tmp|g" "$3" > "$tmp/system.script"
  MUSEUM_EDITOR_LANG=en MUSEUM_EDITOR_DATA="$tmp/data" ZINC_SYSTEM_SCRIPT="$tmp/system.script" ZINC_SYSTEM_LOG="$tmp/system.log" ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 \
    ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$4 ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=${5:-0} "$ZINC" run "$ex/editor" -- $1 >"$tmp/out" 2>&1 \
    || { echo "the editor failed on $(basename "$2"): $(head -c 300 "$tmp/out")"; fail=1; }
}

mkdir -p "$tmp/commands"
out=$("$ZINC" run "$ex/editor/selftest.ts" -- "$ex/assets/project.json" "$tmp/commands" 2>&1) || fail=1
case $out in *FAILED*|*panic*|*error*) fail=1 ;; esac
[ $fail = 0 ] || { echo "the document's self-test:"; printf '%s\n' "$out" | grep -v '^ok: ' | head -20; }
for c in align-left align-centre align-right align-top align-middle align-bottom distribute-across distribute-down nudge nudge-sequences \
         cut-items cut-sequences paste-items paste-items-elsewhere paste-sequences paste-other-project; do
  same "the command $c" "$tmp/commands/$c.json" "$g/$c.json"
done

# the session: the project in a folder with its photograph, a picture outside of it, and a directory of its own for what the editor keeps
mkdir -p "$tmp/project/photos" "$tmp/outside" "$tmp/data"
cp "$g/../table.json" "$tmp/project/project.json"; printf x > "$tmp/project/photos/vague.jpg"; printf x > "$tmp/outside/estampe.png"
edit "$tmp/project/project.json" "$g/session.input" "$g/session.system" 92 18
same "the session" "$tmp/project/project.json" "$g/session.json"
if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/shot-18.png" "$g/session-18.png"
else tools/pngdiff "$tmp/shot-18.png" "$g/session-18.png" >/dev/null || { echo "the session: frame 18 differs from $g/session-18.png"; fail=1; }; fi
got=$("$ZINC" run "$ex/src/check.ts" -- "$tmp/project/project.json" 2>&1)
case $got in 'project.json: ok, "project" version 1, languages fr en, media: 2 photo, 1 text; 6 sequences, 6 items, 10 links, '*', canonical'*) ;; *) echo "the player's loader on the project of the session: $got"; fail=1 ;; esac
[ "$(grep -c '^\[system\] menu.popup ' "$tmp/system.log")" = 3 ] || { echo "the session did not open three context menus"; fail=1; }
cmp -s "$tmp/outside/estampe.png" "$tmp/project/estampe.png" || { echo "the dropped picture was not copied into the project folder"; fail=1; }
[ "$(cat "$tmp/data/recent" 2>/dev/null)" = "$tmp/project/project.json" ] || { echo "the list of recent projects is not the project of the session: $(cat "$tmp/data/recent" 2>&1)"; fail=1; }

# the recent projects: no project named, the first of File > Open recent
edit '' "$g/recent.input" "$g/recent.system" 16
grep -q "\"label\":\"$tmp/project/project.json\",\"id\":\"recent:0\"" "$tmp/system.log" || { echo "File > Open recent does not list the project of the session"; fail=1; }
same "the recent project, opened from the menu" "$tmp/project/project.json" "$g/recent.json"
cmp -s "$g/session.json" "$g/recent.json" && { echo "the project opened from File > Open recent was not changed and saved"; fail=1; }

[ $fail = 0 ] && echo "museum_editor_tools: ok"
exit $fail
