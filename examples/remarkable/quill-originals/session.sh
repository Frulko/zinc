#!/bin/sh
# Runs under the lease (xochitl stopped): the launcher, the chosen demo through the toolbar, the launcher again. Any other way out ends the session.
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd); cd "$HERE/bin" || exit 1
CHOICE=/tmp/quill-originals-choice
while :; do
  "$HERE/bin/home" "$HERE/demos.txt" "$CHOICE"
  [ $? -eq 42 ] || exit 0
  row=$(sed -n "$(cat "$CHOICE")p" "$HERE/demos.txt")
  title=${row%%|*} cmd=${row#*|}
  # the word splitting of $cmd is the point: a binary and its arguments, all relative to bin/
  QUILL_DEMO_TITLE=$title LD_PRELOAD="$HERE/bin/libbar.so" "$HERE"/bin/$cmd
  echo "quill-originals: $title exited $?"
done
