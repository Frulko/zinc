/* LVGL's configuration for zinc:lvgl (vendor/lvgl, PIN): what differs from LVGL's defaults (vendor/lvgl/include/lvgl/config/
   lv_conf_internal.h holds the rest). The same on the computer and on the ESP32 but for the memory (below): 16-bit colour, no OS (one task
   calls LVGL), the software renderer with ThorVG for the Lottie animations, and the widgets and fonts the module offers. */
#ifndef LV_CONF_H
#define LV_CONF_H

#define LV_COLOR_FORMAT_DEFAULT LV_COLOR_FORMAT_RGB565
/* Memory: on the board LVGL takes the heap (malloc), shared with the JavaScript runtime: the real limit, with no pool to fragment it. On the
   computer (the window and `zinc check --target esp32`) LVGL gets a pool of what the board leaves it, about 138 KB once the JavaScript heap
   and the 28 KB stack are taken (esp32sim, 2026-10-22), in 64-bit objects: the same screen takes a like share of both (esp32-widgets'
   Lottie page, its heaviest: 75% of the pool, 71% of the board's heap), so a screen that would not fit the board does not fit the computer
   either. lv.stats() reports the pool's use and peak. ThorVG's objects (`new`) are outside the pool: a Lottie animation costs the board more. */
#ifdef ESP_PLATFORM
#define LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB
#else
#define LV_USE_STDLIB_MALLOC LV_STDLIB_BUILTIN
#define LV_MEM_SIZE (96 * 1024)
#define LV_MEM_POOL_INCLUDE <stdlib.h>
#define LV_MEM_POOL_ALLOC malloc
#endif
#define LV_USE_STDLIB_STRING LV_STDLIB_CLIB
#define LV_USE_STDLIB_SPRINTF LV_STDLIB_CLIB
#define LV_USE_OS LV_OS_NONE
#define LV_DEF_REFR_PERIOD 1 /* every turn: zinc's frame loop paces the redraws (60 Hz) */
/* the areas changed in a frame that LVGL keeps apart (default 32): past them it redraws the whole screen, and every object that moves
   adds two (where it was, where it is), so 16 moving objects sent 76,800 pixels a frame; 17 bytes each */
#define LV_INV_BUF_SIZE 128
#define LV_DPI_DEF 160        /* a 2.2" 240x320 panel: the default theme's paddings come out small enough */

/* the software renderer, for RGB565 (the panel's), the A8 masks and fonts, and ARGB8888 premultiplied: the buffer ThorVG draws a Lottie
   animation into (lv_lottie, on a canvas). Plain ARGB8888 stays on: LVGL 9.6's blend to A8 does not compile with the premultiplied format
   alone (lv_draw_sw_blend_to_a8.c calls argb8888_image_blend, which it declares only for ARGB8888) */
#define LV_DRAW_SW_SUPPORT_RGB565_SWAPPED 0
#define LV_DRAW_SW_SUPPORT_RGB565A8 0
#define LV_DRAW_SW_SUPPORT_RGB888 0
#define LV_DRAW_SW_SUPPORT_XRGB8888 0
#define LV_DRAW_SW_SUPPORT_ARGB8888_PREMULTIPLIED 1
#define LV_DRAW_SW_SUPPORT_L8 0
#define LV_DRAW_SW_SUPPORT_AL88 0
#define LV_DRAW_SW_SUPPORT_I1 0
#define LV_DRAW_LAYER_SIMPLE_BUF_SIZE (8 * 1024)
#define LV_USE_FLOAT 1           /* ThorVG works in floats */
#define LV_USE_MATRIX 1
#define LV_USE_VECTOR_GRAPHIC 1
#define LV_USE_THORVG 1          /* the copy LVGL carries (src/libs/thorvg, ThorVG 0.15), its software rasteriser only */
#define LV_USE_THORVG_INTERNAL 1
#define LV_USE_LOTTIE 1

#define LV_USE_LOG 0
#define LV_USE_ASSERT_NULL 0
#define LV_USE_ASSERT_MALLOC 0
#define LV_USE_ASSERT_STYLE 0
#define LV_USE_ASSERT_MEM_INTEGRITY 0
#define LV_USE_ASSERT_OBJ 0
#define LV_USE_OBSERVER 0

#define LV_FONT_MONTSERRAT_12 1
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_20 1
#define LV_FONT_MONTSERRAT_28 1

#define LV_THEME_DEFAULT_DARK 1
#define LV_USE_THEME_SIMPLE 0
#define LV_USE_THEME_MONO 0
#define LV_USE_GRID 0

/* the widgets of zinc:lvgl (index.ts); the others are not compiled */
#define LV_USE_ANIMIMG 0
#define LV_USE_ARCLABEL 0
#define LV_USE_CALENDAR 0
#define LV_USE_DROPDOWN 0
#define LV_USE_IMAGEBUTTON 0
#define LV_USE_KEYBOARD 0
#define LV_USE_LIST 0
#define LV_USE_MENU 0
#define LV_USE_MSGBOX 0
#define LV_USE_SPAN 0
#define LV_USE_SPINBOX 0
#define LV_USE_TEXTAREA 0
#define LV_USE_TABLE 0
#define LV_USE_TABVIEW 0
#define LV_USE_TILEVIEW 0
#define LV_USE_WIN 0

#endif
