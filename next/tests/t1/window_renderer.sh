#!/bin/sh
# The window's renderer (ZN-412.02): ZINC_RENDERER=gl replays the command lists with OpenGL, cpu keeps the software raster behind SDL_Renderer,
# auto (the default) takes GL with a hardware context; ZINC_GL_STATS names the choice. A window run of tests/data/tiles; skipped without one. Linux
# (ZN-412.06): on Mesa's llvmpipe, gl still replays (forced) and auto keeps the software raster.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
fail=0
for r in gl cpu auto; do
  log=$(ZINC_RENDERER=$r ZINC_GL_STATS=1 ZINC_FRAMES=3 ZINC_RUN=interp env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC timeout 60 "$ZINC" run tests/data/tiles 2>&1)
  out=$(printf '%s\n' "$log" | grep "window renderer")
  [ -n "$out" ] || { echo "skipped: no window here"; exit 77; }
  case "$r:$out" in gl:*"renderer gl ("*) printf '%s\n' "$log" | grep -q "renderer gl: [1-9][0-9]* frames replayed" || { echo "window_renderer: the GL window replayed no frame"; fail=1; } ;; esac
  case "$r:$out" in gl:*llvmpipe*|gl:*softpipe*) soft=1 ;; esac
  case "${soft:-0}:$r:$out" in 1:auto:*"renderer gl ("*) echo "window_renderer: auto took the software GL renderer: '$out'"; fail=1 ;; esac
  case "$r:$out" in
    gl:*"renderer gl ("*|cpu:*"renderer cpu"|auto:*"renderer gl ("*|auto:*"renderer cpu") ;;
    *) echo "window_renderer: ZINC_RENDERER=$r gave '$out'"; fail=1 ;;
  esac
done
exit $fail
