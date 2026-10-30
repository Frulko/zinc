#!/bin/sh
# examples/photo-sorter: a library of two folders (the museum's pictures, the imageio fixtures with EXIF) sorted by a scripted session.
# Moved in place: a folder added through the dialog, a picture filed by key into "À imprimer", the next into "À garder" then undone (it is
# back, the empty album folder gone) and thrown away (it waits in .trieur-trash), the next into "À retoucher"; Finish, then the summary empties the
# trash into the system's (the freedesktop trash of the simulator, under XDG_DATA_HOME). Copied elsewhere: the sources stay whole and the
# albums appear in the other folder. The last frames are hashed (tests/golden/photo-sorter/hashes.txt).
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_STEPS=0 LANG=fr_FR.UTF-8
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
library() {   # library <dir>
  mkdir -p "$1/Vacances" "$1/Divers"
  cp examples/museum-table/assets/photos/*.jpg "$1/Vacances/"
  cp tests/data/imageio/portrait.jpg tests/data/imageio/plain.png tests/data/imageio/photo.webp "$1/Divers/"
  m=10; for f in "$1"/Divers/* "$1"/Vacances/*; do touch -t 2024010112$m "$f"; m=$((m + 1)); done   # the pile is oldest first: by name here
}
run() {   # run <name> <frames> <dialog answers...>; the input script is $tmp/<name>.input
  name=$1 frames=$2; shift 2
  : > "$tmp/$name.script"; for a in "$@"; do printf '0 dialog-answer %s\n' "$a" >> "$tmp/$name.script"; done
  out=$(cd examples/photo-sorter && XDG_DATA_HOME="$tmp/xdg" ZINC_SYSTEM_SCRIPT="$tmp/$name.script" ZINC_STORAGE="$tmp/$name.kv" ZINC_FRAMES=$frames \
    ZINC_INPUT="$tmp/$name.input" ZINC_FRAMEHASH=last "$ZINC" run . 2>&1)
  echo "$out" | grep -q Uncaught && { echo "photo-sorter $name: $(echo "$out" | grep -A3 Uncaught)"; fail=1; }
  got=$(echo "$out" | grep framehash | awk '{print $5}')
  want=$(grep "^$name " tests/golden/photo-sorter/hashes.txt | awk '{print $2}')
  [ "$got" = "$want" ] || { echo "photo-sorter $name: frame $got, recorded $want"; fail=1; }
}
has() { [ -e "$1" ] || { echo "photo-sorter: missing ${1#$tmp/}"; fail=1; }; }
hasnt() { [ ! -e "$1" ] || { echo "photo-sorter: still there: ${1#$tmp/}"; fail=1; }; }

library "$tmp/move"
printf '5 move 370 296\n6 down\n7 up\n20 move 700 826\n21 down\n22 up\n60 key s\n100 key a\n140 key Backspace\n170 key j\n200 key d\n240 move 1170 86\n241 down\n242 up\n270 move 412 528\n271 down\n272 up\n' > "$tmp/move.input"
run move 300 "$tmp/move"
has "$tmp/move/À imprimer/photo.webp"; hasnt "$tmp/move/Divers/photo.webp"
hasnt "$tmp/move/À garder"                                                              # plain.png filed there, then undone...
hasnt "$tmp/move/Divers/plain.png"; hasnt "$tmp/move/Divers/.trieur-trash"              # ...then thrown away, and the trash emptied
has "$tmp/xdg/Trash/files/plain.png"; has "$tmp/xdg/Trash/info/plain.png.trashinfo"     # into the system's trash
has "$tmp/move/À retoucher/portrait.jpg"; has "$tmp/move/Vacances/ejiri.jpg"

library "$tmp/copy"; mkdir -p "$tmp/albums"
printf '5 move 370 296\n6 down\n7 up\n15 move 464 539\n16 down\n17 up\n25 move 600 451\n26 down\n27 up\n40 move 700 826\n41 down\n42 up\n80 key s\n120 key f\n' > "$tmp/copy.input"
run copy 160 "$tmp/copy" "$tmp/albums"
has "$tmp/albums/À imprimer/photo.webp"; has "$tmp/copy/Divers/photo.webp"
has "$tmp/albums/Famille/plain.png"; has "$tmp/copy/Divers/plain.png"
[ "$(stat -f %m "$tmp/albums/Famille/plain.png" 2>/dev/null || stat -c %Y "$tmp/albums/Famille/plain.png")" = "$(stat -f %m "$tmp/copy/Divers/plain.png" 2>/dev/null || stat -c %Y "$tmp/copy/Divers/plain.png")" ] || { echo "photo-sorter: the copy lost its date"; fail=1; }
[ $fail -eq 0 ] && echo "photo sorter: ok"
exit $fail
