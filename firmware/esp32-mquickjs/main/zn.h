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
