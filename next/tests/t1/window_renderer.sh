#!/bin/sh
# The window's renderer (ZN-412.02): ZINC_RENDERER=gl replays the command lists with OpenGL, cpu keeps the software raster behind SDL_Renderer,
# auto (the default) takes GL with a hardware context; ZINC_GL_STATS names the choice. A window run of tests/data/tiles; skipped without one.
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: the GL window is macOS only for now"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
fail=0
for r in gl cpu auto; do
  out=$(ZINC_RENDERER=$r ZINC_GL_STATS=1 ZINC_FRAMES=3 ZINC_RUN=interp env -u ZINC_HEADLESS -u ZINC_DETERMINISTIC timeout 60 "$ZINC" run tests/data/tiles 2>&1 | grep "window renderer")
  [ -n "$out" ] || { echo "skipped: no window here"; exit 77; }
  case "$r:$out" in
    gl:*"renderer gl ("*|cpu:*"renderer cpu"|auto:*"renderer gl ("*|auto:*"renderer cpu") ;;
    *) echo "window_renderer: ZINC_RENDERER=$r gave '$out'"; fail=1 ;;
  esac
done
exit $fail
