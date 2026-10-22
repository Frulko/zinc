#!/bin/sh
# Vendors LVGL into vendor/lvgl, trimmed (PIN): every header, and the C files of the core, the software renderer, the widgets and the
# fonts zinc:lvgl uses; then prints the "sources" list of plugin.json. Usage: vendor/update.sh <a checkout of lvgl at the pinned tag>
set -eu
src=$1
out=$(cd "$(dirname "$0")" && pwd)/lvgl
rm -rf "$out" && mkdir -p "$out"
cp "$src/LICENCE.txt" "$out/"
cd "$src"
{
  ls lvgl.h lvgl_private.h lv_version.h; find include src -name '*.h'
  find src/core src/display src/draw/sw src/indev src/layouts src/misc src/tick src/widgets src/image src/fs src/themes/default -name '*.c'
  ls src/draw/*.c src/draw/convert/*.c src/lv_init.c src/osal/lv_os.c src/osal/lv_os_none.c src/stdlib/lv_mem.c src/stdlib/clib/*.c src/stdlib/builtin/lv_mem_core_builtin.c src/stdlib/builtin/lv_tlsf.c src/themes/lv_theme.c
  ls src/libs/thorvg/*.cpp src/libs/thorvg/LICENSE.txt   # ThorVG, LVGL's vector renderer: zinc:lvgl's Lottie animations
  ls src/font/lv_font.c src/font/fmt_txt/*.c src/font/lv_font_montserrat_12.c src/font/lv_font_montserrat_14.c src/font/lv_font_montserrat_20.c src/font/lv_font_montserrat_28.c
} | sort -u | while read -r f; do mkdir -p "$out/$(dirname "$f")"; cp "$f" "$out/$f"; done
cd "$out/.." && find lvgl -name '*.c' -o -name '*.cpp' | sort | sed 's|^|vendor/|'
