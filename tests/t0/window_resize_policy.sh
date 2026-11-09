#!/bin/sh
# Exercise the actual HAL policy transition with SDL mocked; no window or display is needed.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp/policy.cpp" <<'PY'
from pathlib import Path
import sys
source = Path('targets/macos/hal_sdl.cpp').read_text()
start = source.index('extern "C" void hal_set_resize(int32_t on) {')
body = source[start:source.index('\n}', start) + 2]
Path(sys.argv[1]).write_text('''#include <cassert>
#include <cstdint>
static bool gfx_on = true, resize_fixed = false, det = false, fill = false, resize_pending = false, wcfg_set = false;
static void* hal_display = nullptr;
static void* win = reinterpret_cast<void*>(1);
static int W = 800, H = 500, calls = 0;
static struct { float aspect = 0; } wcfg;
static float lo = 1.6f, hi = 1.6f;
static bool SDL_SetWindowAspectRatio(void* w, float a, float b) {
  assert(w == win); ++calls; lo = a; hi = b; return true;
}
''' + body + '''
int main() {
  hal_set_resize(1);
  assert(fill && resize_pending && lo == 0 && hi == 0 && calls == 1);
  resize_pending = false;
  hal_set_resize(1);
  assert(!resize_pending && calls == 1);
  hal_set_resize(0);
  assert(!fill && resize_pending && lo == 1.6f && hi == 1.6f && calls == 2);
  wcfg_set = true; wcfg.aspect = 1.25f;
  hal_set_resize(1);
  assert(fill && lo == 1.25f && hi == 1.25f && calls == 3);
  hal_set_resize(0);
  assert(!fill && lo == 1.25f && hi == 1.25f && calls == 4);
  hal_set_resize(1);
  assert(fill && lo == 1.25f && hi == 1.25f && calls == 5);
  for (int guard = 0; guard < 4; ++guard) {
    resize_fixed = guard == 0; det = guard == 1; hal_display = guard == 2 ? win : nullptr; gfx_on = guard != 3;
    resize_pending = false;
    hal_set_resize(0);
    assert(fill && !resize_pending && calls == 5);
  }
}
''')
PY
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror "$tmp/policy.cpp" -o "$tmp/policy"
timeout 5 "$tmp/policy"
