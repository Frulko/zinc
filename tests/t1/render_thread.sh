#!/bin/sh
# The render thread (D182, runtime/gfx.cpp): the same pixels with it on and off.
# 1. Headless and deterministic, ZINC_RENDER_THREAD=1 forces the handoff (the null HAL presents on the thread): the frame hashes of a
#    UI demo and a game equal those of the inline run, frame by frame.
# 2. A window (skipped without one): with the thread on, each present's buffer equals a full redraw of its frame (ZINC_PRESENT_VERIFY,
#    the Metal window of macOS), so no damage was lost between the threads, and the presents ran on the render thread.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
fail=0
for d in examples/hero examples/breakout; do
  for t in 0 1; do
    ZINC_RENDER_THREAD=$t ZINC_FRAMEHASH=1 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=40 timeout 120 "$ZINC" run --interp "$d" 2>&1 >/dev/null |
      grep '^zinc: framehash' > "$tmp/h$t"
  done
  n=$(wc -l < "$tmp/h0" | tr -d ' ')
  [ "$n" -ge 40 ] || { echo "$d: $n frame hashes without the thread"; fail=1; }
  cmp -s "$tmp/h0" "$tmp/h1" || { echo "$d: frame hashes differ with the render thread"; diff "$tmp/h0" "$tmp/h1" | head -4; fail=1; }
done
[ "$(uname)" = Darwin ] || { [ $fail -eq 0 ] && echo "render_thread: ok (no window check off macOS)"; exit $fail; }
log=$(ZINC_RENDER_THREAD=1 ZINC_PRESENT_VERIFY=1 ZINC_BACKGROUND=1 ZINC_FRAMES=150 env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC timeout 60 \
  "$ZINC" run --interp examples/hero 2>&1)
v=$(printf '%s\n' "$log" | grep '^zinc present verify')
if [ -z "$v" ]; then
  echo "skipped: no Metal window here"
  [ $fail -eq 0 ] && exit 77
else
  printf '%s\n' "$v" | grep -q 'render thread' || { echo "render_thread: no present ran on the render thread"; fail=1; }
  printf '%s\n' "$v" | grep -v ': 0 stale pixels' | grep -q . && { echo "render_thread: stale pixels:"; printf '%s\n' "$v" | grep -v ': 0 stale' | head -3; fail=1; }
fi
[ $fail -eq 0 ] && echo "render_thread: ok"
exit $fail
