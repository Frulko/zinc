/* zinc:device on the native ABI (include/zn/native.h, the export table of zinc_native_device_abi.h that zinc generates from device.spec.ts),
   for the mquickjs firmware of the ESP32 (firmware/esp32-mquickjs) and its check on the computer (zinc-mqjs). zinc's own engines on the
   computer use device.host.cpp, the AOT firmware device.esp32.cpp. On the board the backlight, the touch probe and the frame figures are
   the firmware's (main/zn.h, answered by main.c); the JavaScript heap is answered by main/zn_native.c, in the firmware and in zinc-mqjs. */
#include <stdio.h>
#include <string.h>

#include "zinc_native_device_abi.h"

/* the mquickjs heap in use and its size (main/zn_native.c); weak: a host without it leaves it null */
__attribute__((weak)) void zn_js_heap(size_t *used, size_t *size);

#ifdef ESP_PLATFORM
#include "esp_app_desc.h"
#include "esp_chip_info.h"
#include "esp_flash.h"
#include "esp_idf_version.h"
#include "esp_private/esp_clk.h"
#include "esp_system.h"
/* the firmware's (main/zn.h) */
int zn_backlight(int level);
int zn_touch(void);
float zn_touch_map(int i);
int zn_set_touch_map(const float m[6]);
void zn_frame_stats(int *frame_us, int *draw_cmds);
#endif

static const ZnHostApi *host;

static int32_t ret_int(ZnVal *ret, int64_t v)
{
    ret->i = v;
    return ZN_OK;
}

static int32_t ret_text(ZnCtx *cx, ZnVal *ret, const char *s, int n)
{
    ret->s = host->ret_str(cx, s, (uint32_t)(n < 0 ? 0 : n));
    return ZN_OK;
}

int32_t zn_device_setBacklight(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx;
#ifdef ESP_PLATFORM
    return ret_int(ret, zn_backlight((int)args[0].i));
#else
    (void)args;
    return ret_int(ret, 0); /* no backlight on the computer: index.ts keeps the level */
#endif
}

int32_t zn_device_hasTouch(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
#ifdef ESP_PLATFORM
    return ret_int(ret, zn_touch());
#else
    return ret_int(ret, 1); /* the mouse stands in */
#endif
}

int32_t zn_device_touchMap(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx;
    const int i = (int)args[0].i;
#ifdef ESP_PLATFORM
    ret->d = i >= 0 && i < 6 ? zn_touch_map(i) : 0;
#else
    ret->d = i == 0 || i == 4; /* the mouse: the identity */
#endif
    return ZN_OK;
}

int32_t zn_device_setTouchMap(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx;
#ifdef ESP_PLATFORM
    const float m[6] = {(float)args[0].d, (float)args[1].d, (float)args[2].d, (float)args[3].d, (float)args[4].d, (float)args[5].d};
    return ret_int(ret, zn_set_touch_map(m));
#else
    (void)args;
    return ret_int(ret, 0);
#endif
}

int32_t zn_device_heapFree(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
#ifdef ESP_PLATFORM
    return ret_int(ret, esp_get_free_heap_size());
#else
    return ret_int(ret, -1);
#endif
}

int32_t zn_device_heapMinFree(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
#ifdef ESP_PLATFORM
    return ret_int(ret, esp_get_minimum_free_heap_size());
#else
    return ret_int(ret, -1);
#endif
}

static int64_t js_heap(int which)
{
    size_t v[2] = {0, 0};
    if (!zn_js_heap) return -1;
    zn_js_heap(&v[0], &v[1]);
    return (int64_t)v[which];
}

int32_t zn_device_zincHeapUsed(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
    return ret_int(ret, js_heap(0));
}

int32_t zn_device_zincHeapSize(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
    return ret_int(ret, js_heap(1));
}

static int64_t frame(int which)
{
#ifdef ESP_PLATFORM
    int v[2];
    zn_frame_stats(&v[0], &v[1]);
    return v[which];
#else
    (void)which;
    return -1; /* the check on the computer draws no frame of its own */
#endif
}

int32_t zn_device_frameUs(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
    return ret_int(ret, frame(0));
}

int32_t zn_device_drawCmds(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
    return ret_int(ret, frame(1));
}

int32_t zn_device_cpuMhz(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
#ifdef ESP_PLATFORM
    return ret_int(ret, esp_clk_cpu_freq() / 1000000);
#else
    return ret_int(ret, 0);
#endif
}

int32_t zn_device_chip(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)args;
#ifdef ESP_PLATFORM
    esp_chip_info_t c;
    char b[48];
    esp_chip_info(&c);
    const int n = snprintf(b, sizeof b, "%s rev %d.%d, %d core%s", c.model == CHIP_ESP32S3 ? "ESP32-S3" : "ESP32", c.revision / 100, c.revision % 100,
                           c.cores, c.cores > 1 ? "s" : "");
    return ret_text(cx, ret, b, n < (int)sizeof b ? n : (int)sizeof b - 1);
#else
    return ret_text(cx, ret, "mquickjs on the computer", 24);
#endif
}

int32_t zn_device_flashSize(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)cx, (void)args;
#ifdef ESP_PLATFORM
    uint32_t size = 0;
    return ret_int(ret, esp_flash_get_size(NULL, &size) == ESP_OK ? (int64_t)size : -1);
#else
    return ret_int(ret, -1);
#endif
}

int32_t zn_device_idfVersion(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)args;
#ifdef ESP_PLATFORM
    const char *v = esp_get_idf_version();
    return ret_text(cx, ret, v, (int)strlen(v));
#else
    return ret_text(cx, ret, "", 0);
#endif
}

/* as main.c prints it at start ("mqjs: firmware <name> <sha>"): the project's name and the first bytes of the ELF's SHA-256 */
int32_t zn_device_firmware(void *self, ZnCtx *cx, const ZnVal *args, ZnVal *ret)
{
    (void)self, (void)args;
#ifdef ESP_PLATFORM
    const esp_app_desc_t *d = esp_app_get_description();
    char b[48];
    const int n = snprintf(b, sizeof b, "%s %02x%02x%02x%02x", d->project_name, d->app_elf_sha256[0], d->app_elf_sha256[1], d->app_elf_sha256[2],
                           d->app_elf_sha256[3]);
    return ret_text(cx, ret, b, n < (int)sizeof b ? n : (int)sizeof b - 1);
#else
    return ret_text(cx, ret, "", 0);
#endif
}

static int32_t init(const ZnHostApi *h, void **self)
{
    host = h;
    *self = 0;
    return ZN_OK;
}

static const ZnExport exports[] = {ZN_device_EXPORTS};

const ZnModule *zn_module_Device(void)
{
    static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Device", exports, sizeof exports / sizeof exports[0], 0, 0, 0, init, 0, 0};
    return &m;
}
