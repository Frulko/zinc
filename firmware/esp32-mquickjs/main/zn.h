/* What the firmware's parts share (main.c and the mod_*.c modules): the JavaScript context, the queue that brings other tasks' events to
   the JavaScript task, and the signature of the functions of the ROM table (zn_stdlib.c). JavaScript runs on one task only: a module's
   callbacks from Wi-Fi, BLE or an interrupt post an event instead of calling into the engine. */
#pragma once
#include <stddef.h>
#include <stdint.h>

#include "mquickjs.h"

#define ZN_FN(name) JSValue name(JSContext *ctx, JSValue *this_val, int argc, JSValue *argv)

/* the `kind` of __zincEvent(kind, a, b, text) in js/runtime.js, which hands it to the module that registered it with __zincOn */
enum { ZN_EV_GPIO = 1, ZN_EV_WIFI, ZN_EV_BLE, ZN_EV_ESPNOW, ZN_EV_OTA };

extern JSContext *zn_ctx;

/* From any task: queue an event for the JavaScript task; `text` is copied (NULL for none). From an interrupt: zn_post_isr, no text. An
   event that finds the queue full is dropped and counted (the figures line). */
void zn_post(int kind, int a, int b, const void *text, size_t len);
void zn_post_isr(int kind, int a, int b);

/* Argument `v` as a NUL-terminated UTF-8 string in buf (cut at size - 1 bytes); its length, or -1 with an exception pending. */
int zn_str(JSContext *ctx, JSValue v, char *buf, size_t size);
/* Integer argument `i` (0 when missing); -1 with an exception pending, else 0. */
int zn_int(JSContext *ctx, int argc, JSValue *argv, int i, int *out);

/* The panel for a plugin's native code that draws itself (zinc:lvgl): a buffer the panel's bus can read (240 x 32 pixels at most, NULL
   above), and an area [x0, x1) x [y0, y1) of RGB565 pixels, high byte first, sent while the caller renders the next one (the call waits
   for the previous area's transfer). From the first area on, the program's zinc:gfx display list is not shown; an error takes the panel back. */
void *zn_panel_buffer(size_t bytes);
void zn_panel_flush(int x0, int y0, int x1, int y1, const void *pixels);
/* 1 when zn_panel_flush has copied the pixels by the time it returns (the board's 8-bit i80 bus: its driver reformats them), so the next
   area can be rendered into the same buffer and one is enough; 0 when the bus still reads them (SPI, the emulator's board): two. */
int zn_panel_copies(void);
/* A quarter turn of the panel (0 as started, 1 to 3 clockwise; MADCTL): the areas sent after it are in the turned frame (320 x 240 for 1
   and 3), the touch stays in the panel's portrait pixels. An error turns it back. */
void zn_panel_rotate(int quarter);

/* The board for a plugin's native code (zinc:device): the backlight's PWM level 0..255, kept until the first frame lights the panel (1 when
   LEDC drives it, 0 for a plain on/off pin); whether the touch controller answered at start; the last frame's time in microseconds (the
   frame callback, the rendering and the transfer) and its zinc:gfx commands. main.c answers them. */
int zn_backlight(int level);
int zn_touch(void);
/* The touch's map from the CST820's pixels to the panel's portrait pixels: x = m[0] rx + m[1] ry + m[2], y = m[3] rx + m[4] ry + m[5]
   (coefficient i of it); the setter applies it from the next touch and keeps it in NVS (zinc.sys, "touch"), or returns 0 for a map the touch
   cannot use (not finite, a scale outside 0.5 to 2). */
float zn_touch_map(int i);
int zn_set_touch_map(const float m[6]);
/* Restarts the board into touch_calibrate (NVS zinc.sys "cal", taken at start); returns 0 only without a touch controller. */
int zn_calibrate_touch(void);
/* Turns the board off (deep sleep, the backlight, the panel and the touch asleep) until RST or the battery's power button: does not return. */
void zn_power_off(void);
/* The BOOT button (GPIO0) on a board whose backlight it also gates (the 2432S022): its level, 1 released and 0 pressed, read by main.c, which
   hands each change to zinc:gpio (zn_gpio_board_edge, mod_gpio.c: posted when pin 0 is watched). */
int zn_boot_level(void);
void zn_gpio_board_edge(int pin, int level);
void zn_frame_stats(int *frame_us, int *draw_cmds);
/* The mquickjs heap of the native call in progress: bytes in use and its size, as JS_DumpMemory's "heap size=used/size" (main/zn_native.c,
   so zinc-mqjs answers it too on the computer). */
void zn_js_heap(size_t *used, size_t *size);

/* The modules' parts the core calls: the GPIO pins the board's own peripherals use (refused to programs), NVS opened once. */
int zn_pin_reserved(int pin);
void zn_storage_init(void);

/* The program: 0 running, 1 ended, 2 failed, 3 none in the js partition (the update server reports it). zn_pause, from another task,
   stops the JavaScript task where it waits and shows `what` on the screen: for the flash to be written, before a restart. */
extern volatile int zn_program_state;
void zn_pause(const char *what);
#ifdef ZN_NET
/* The console's last ZN_LOG_SIZE bytes (print, console.log, errors), counted from the start: zn_log_read copies those from `from` on
   into out (ZN_LOG_SIZE bytes) and gives the count where they end. */
#define ZN_LOG_SIZE 4096
size_t zn_log_read(size_t from, char *out, size_t *end);

#include "esp_http_server.h"
/* the network image's parts (mod_wifi.c, mod_update.c): the radio's owner, Wi-Fi up once, the board's name, the update server */
int zn_radio(JSContext *ctx, int ble);
int zn_wifi_init(JSContext *ctx);
void zn_wifi_up(void);
void zn_wifi_auto(void);
const char *zn_board_name(void);
void zn_update_register(httpd_handle_t http);
void zn_update_announce(void);
esp_err_t zn_update_page(httpd_req_t *req);
#endif

/* the host calls of the modules, named in zn_stdlib.c's ROM table */
ZN_FN(js_gpio_setup);
ZN_FN(js_gpio_write);
ZN_FN(js_gpio_read);
ZN_FN(js_gpio_watch);
ZN_FN(js_storage_get);
ZN_FN(js_storage_set);
ZN_FN(js_storage_remove);
ZN_FN(js_storage_keys);
#ifdef ZN_NET
ZN_FN(js_wifi_start);
ZN_FN(js_wifi_connect);
ZN_FN(js_wifi_forget);
ZN_FN(js_wifi_stop);
ZN_FN(js_wifi_info);
ZN_FN(js_wifi_scan);
ZN_FN(js_wifi_clock);
ZN_FN(js_espnow_start);
ZN_FN(js_espnow_send);
ZN_FN(js_espnow_address);
ZN_FN(js_espnow_stop);
ZN_FN(js_ble_state);
ZN_FN(js_ble_advertise);
ZN_FN(js_ble_scan);
ZN_FN(js_ble_stop_scan);
ZN_FN(js_ble_send);
ZN_FN(js_ble_close);
ZN_FN(js_ble_stop);
#endif
#ifdef ZN_NATIVE
/* main/zn_native.c: the plugins' native modules (zinc:native), and their poll once per turn of the loop */
ZN_FN(js_native_open);
ZN_FN(js_native_call);
void zn_native_poll(uint64_t now_ms);
#endif
