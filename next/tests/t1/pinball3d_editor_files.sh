#!/bin/sh
# The table editor of the 3D pinball, the files of a table's folder (ZN-649.13, examples/pinball3d-editor/src/files.ts): a file field of
# the format is a choice among the files of the folder, not a path to type. The session (tests/golden/pinball3d-editor/files.input) runs
# on the test's table in a folder this script fills (its files are written here: a PNG, an OBJ and a WAV need no tool):
#   - the board's painting is chosen among the images of the folder, a sound's file among its sounds (and heard), a model's mesh among
#     its models; a second sound takes a file from elsewhere through "Import…" (the system's file dialog, answered by the script): the
#     file is copied into the folder's sounds/ and named by the field. The saved table equals files.json and the game's loader accepts it;
#   - a file changed on disk shows after a refresh: another paint.png dropped on the window replaces the folder's (after a question),
#     the editor reads the folder again, and the top view and the 3D pane, which showed the first painting (frame 26), show the second
#     (frame 76) exactly as a run that had the second one from the start. (No test can change a file from outside at a known frame of a
#     run: the drop is the editor's own copy, and Refresh, Cmd+R, is the same reading again.)
#   - Refresh says how many files the folder holds and which ones nothing names; a file reached by its name says what names it, with
#     what is known of it (the triangles of a model).
# ZN_UPDATE_GOLDEN=1 rewrites files.json from this run.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
ex=$PWD/../examples/pinball3d-editor; g=$PWD/tests/golden/pinball3d-editor
game=$PWD/../examples/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# the top view and the pane beside it, in a window of 1440 x 900: x, y, width, height
CROP=386,48,714,820

python3 - "$tmp" "$g/table.json" <<'PY'
import os, struct, sys, wave, zlib
tmp, table = sys.argv[1], sys.argv[2]
def png(path, a, b):   # 32 x 64, two colours in bands: a painting that cannot be taken for another
    rows = b''.join(b'\x00' + bytes(a if (y // 8) % 2 == 0 else b) * 32 for y in range(64))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 32, 64, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
def wav(path, hz):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
        w.writeframes(b''.join(struct.pack('<h', 12000 if (i * hz // 4000) % 2 else -12000) for i in range(2000)))
for d in ('files/art', 'files/sounds', 'second/art', 'second/sounds', 'outside'): os.makedirs(f'{tmp}/{d}')
for folder in ('files', 'second'):
    open(f'{tmp}/{folder}/table.json', 'w').write(open(table).read())
    png(f'{tmp}/{folder}/art/spare.png', (40, 40, 40), (90, 90, 90))
    open(f'{tmp}/{folder}/art/pyramid.obj', 'w').write('v 0 0 0\nv 1 0 0\nv 0 0 1\nv 0 1 0\nf 1 3 2\nf 1 2 4\nf 2 3 4\nf 3 1 4\n')
    wav(f'{tmp}/{folder}/sounds/tick.wav', 880)
png(f'{tmp}/files/art/paint.png', (200, 30, 30), (240, 200, 40))      # the first painting: red and yellow
png(f'{tmp}/outside/paint.png', (30, 160, 60), (40, 60, 200))        # the one dropped on the window: green and blue
png(f'{tmp}/second/art/paint.png', (30, 160, 60), (40, 60, 200))     # a folder that had it from the start
wav(f'{tmp}/outside/clink.wav', 1760)
PY

edit() {  # table folder, system script: the session, the editor's --log on $tmp/out, frames 26 and 76 as $tmp/<name of the folder>-<frame>.png
  PINBALL_EDITOR_LANG=en ZINC_SYSTEM_SCRIPT=$2 ZINC_INPUT="$g/files.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=138 \
    ZINC_SHOT="$tmp/$(basename "$1").png" ZINC_SHOT_FRAMES=26,76 "$ZINC" run "$ex" -- "$1" --log >"$tmp/out" 2>"$tmp/err" || { echo "the editor failed on files.input: $(head -c 300 "$tmp/err")"; fail=1; }
}
# the answers of the system, in the order they are asked for: yes to replacing paint.png, then the file to import; the drop comes in the
# pause of the session (frames 23 to 80: the system's script counts passes of the event loop, between 1.5 and 2 a frame)
printf '0 dialog-answer 0\n0 dialog-answer %s\n80 drop %s\n' "$tmp/outside/clink.wav" "$tmp/outside/paint.png" > "$tmp/files.script"
edit "$tmp/files" "$tmp/files.script"
cp "$tmp/out" "$tmp/files.log"
[ -n "$ZN_UPDATE_GOLDEN" ] && cp "$tmp/files/table.json" "$g/files.json"
cmp -s "$tmp/files/table.json" "$g/files.json" || { echo "the files session: table.json differs from $g/files.json"; diff "$tmp/files/table.json" "$g/files.json" 2>/dev/null | head -10; fail=1; }
got=$("$ZINC" run "$game/tools/table.ts" -- check "$tmp/files" 2>&1)
case $got in *'is a valid table (version 1)'*) ;; *) echo "the game's loader refuses the table of the files session: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
for name in art/paint.png sounds/tick.wav sounds/clink.wav art/pyramid.obj; do
  grep -q "\"$name\"" "$tmp/files/table.json" || { echo "the saved table does not name $name"; fail=1; }
done
cmp -s "$tmp/files/sounds/clink.wav" "$tmp/outside/clink.wav" || { echo "Import did not copy the file into the folder's sounds/"; fail=1; }
cmp -s "$tmp/files/art/paint.png" "$tmp/outside/paint.png" || { echo "the file dropped on the window did not replace the folder's"; fail=1; }
for line in 'imported art/paint.png' 'preview: file sounds/tick.wav' 'imported sounds/clink.wav' 'files: 5 in the folder. 1 unused: art/spare.png.' 'art/pyramid.obj (4 triangles): named by models[1].mesh.'; do
  grep -qF "$line" "$tmp/files.log" || { echo "the files session does not say '$line': $(tr '\n' ';' < "$tmp/files.log" | head -c 400)"; fail=1; }
done
# the painting on the table: the first one, then the one dropped, which is the picture of a folder that had it from the start
printf '0 dialog-answer %s\n' "$tmp/outside/clink.wav" > "$tmp/second.script"
edit "$tmp/second" "$tmp/second.script"
tools/pngdiff "$tmp/files-26.png" "$tmp/files-76.png" --crop $CROP >/dev/null && { echo "the painting changed on disk does not show: the table is the same picture before and after"; fail=1; }
tools/pngdiff "$tmp/files-76.png" "$tmp/second-76.png" --crop $CROP >/dev/null || { echo "after the refresh the table is not the picture of the new painting: $(tools/pngdiff "$tmp/files-76.png" "$tmp/second-76.png" --crop $CROP 2>&1 | head -1)"; fail=1; }
tools/pngdiff "$tmp/files-26.png" "$tmp/second-26.png" --crop $CROP >/dev/null && { echo "the two paintings give the same picture: the test proves nothing"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_editor_files: ok"
exit $fail
