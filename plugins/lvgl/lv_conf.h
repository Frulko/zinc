/* LVGL's configuration for zinc:lvgl (vendor/lvgl, PIN): what differs from LVGL's defaults (vendor/lvgl/include/lvgl/config/
   lv_conf_internal.h holds the rest). The same on the computer and on the ESP32: 16-bit colour, the C library's malloc (the ESP32's heap,
   no pool of LVGL's own), no OS (one task calls LVGL), the software renderer, and the widgets and fonts the module offers. */
#ifndef LV_CONF_H
#define LV_CONF_H

#define LV_COLOR_FORMAT_DEFAULT LV_COLOR_FORMAT_RGB565
#define LV_USE_STDLIB_MALLOC LV_STDLIB_CLIB
#define LV_USE_STDLIB_STRING LV_STDLIB_CLIB
#define LV_USE_STDLIB_SPRINTF LV_STDLIB_CLIB
#define LV_USE_OS LV_OS_NONE
#define LV_DEF_REFR_PERIOD 1 /* every turn: zinc's frame loop paces the redraws (60 Hz) */
#define LV_DPI_DEF 160        /* a 2.2" 240x320 panel: the default theme's paddings come out small enough */

/* the software renderer, for RGB565 only (the panel's) and the A8 masks and fonts */
#define LV_DRAW_SW_SUPPORT_RGB565_SWAPPED 0
#define LV_DRAW_SW_SUPPORT_RGB565A8 0
#define LV_DRAW_SW_SUPPORT_RGB888 0
#define LV_DRAW_SW_SUPPORT_XRGB8888 0
#define LV_DRAW_SW_SUPPORT_ARGB8888 0
#define LV_DRAW_SW_SUPPORT_ARGB8888_PREMULTIPLIED 0
#define LV_DRAW_SW_SUPPORT_L8 0
#define LV_DRAW_SW_SUPPORT_AL88 0
#define LV_DRAW_SW_SUPPORT_I1 0
#define LV_DRAW_LAYER_SIMPLE_BUF_SIZE (8 * 1024)

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
#define LV_USE_CANVAS 0
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
