#!/bin/sh
# Responsive windows (ZN-608, macOS: the window is resized through zinc:system/window): a program that asks for resize events (zinc:gfx onResize,
# which every zinc:ui app does) gets a surface that follows the window and one callback with the new size; a program that asks nothing keeps its
# fixed surface, scaled; zinc.json's resize (here ZINC_RESIZE=letterbox, as zinc run passes it) wins over the request. A zinc:ui app (ui.tsx) follows
# without asking.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
d=tests/golden/macos/resize
run() { e=$1; shift; (cd "$d" && env -u ZINC_DETERMINISTIC -u ZINC_HEADLESS "$@" "$ZINC" run "$e" 2>&1 | grep -E "^(resized|surface)" | tr '\n' ';'); }
fail=0
got=$(run main.ts ASK=1); [ "$got" = "resized to 640 332;surface 640 332;" ] || { echo "window_resize: asked: $got"; fail=1; }
got=$(run main.ts ASK=0); [ "$got" = "surface 500 300;" ] || { echo "window_resize: not asked: $got"; fail=1; }
got=$(run main.ts ZINC_RESIZE=letterbox); [ "$got" = "surface 500 300;" ] || { echo "window_resize: letterbox: $got"; fail=1; }
got=$(run ui.tsx ZINC_RUN=native); [ "$got" = "surface 640 332;" ] || { echo "window_resize: zinc:ui app: $got"; fail=1; }   # compiled, as zinc run starts it
got=$(run ui.tsx ZINC_RESIZE=letterbox); [ "$got" = "surface 500 300;" ] || { echo "window_resize: zinc:ui app, letterbox: $got"; fail=1; }
# a program zinc build writes keeps zinc.json's resize: a copy of ui.tsx whose project says letterbox
mkdir -p "$tmp/built" && cp "$d/ui.tsx" "$tmp/built/" && sed 's/"width":500,"height":300}/"width":500,"height":300,"resize":"letterbox"}/' "$d/zinc.json" > "$tmp/built/zinc.json"
if (cd "$tmp/built" && "$ZINC" build ui.tsx -o app >/dev/null 2>&1); then
  got=$(cd "$tmp/built" && env -u ZINC_DETERMINISTIC -u ZINC_HEADLESS -u ZINC_RESIZE ./app 2>&1 | grep -E "^surface" | tr '\n' ';')
  [ "$got" = "surface 500 300;" ] || { echo "window_resize: built program, letterbox: $got"; fail=1; }
else echo "window_resize: zinc build failed"; fail=1; fi
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.resize.app" >/dev/null 2>&1
exit $fail
