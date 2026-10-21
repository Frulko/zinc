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

/* the host calls of the modules, named in zn_stdlib.c's ROM table */
ZN_FN(js_gpio_setup);
ZN_FN(js_gpio_write);
ZN_FN(js_gpio_read);
ZN_FN(js_gpio_watch);
ZN_FN(js_storage_get);
ZN_FN(js_storage_set);
ZN_FN(js_storage_remove);
ZN_FN(js_storage_keys);
