/* zinc:storage (js/modules/storage.js): string values under string keys in the NVS partition, namespace "zinc". The Wi-Fi setup keeps
   its network in the namespace "zinc.wifi", out of the program's keys. */
#include <string.h>

#include "nvs.h"
#include "nvs_flash.h"
#include "zn.h"

static nvs_handle_t nvs;

void zn_storage_init(void)
{
    esp_err_t e = nvs_flash_init();
    if (e == ESP_ERR_NVS_NO_FREE_PAGES || e == ESP_ERR_NVS_NEW_VERSION_FOUND) { /* a partition of another layout: start it again */
        nvs_flash_erase();
        e = nvs_flash_init();
    }
    if (e != ESP_OK || nvs_open("zinc", NVS_READWRITE, &nvs) != ESP_OK) nvs = 0;
}

static int key_of(JSContext *ctx, JSValue v, char key[16])
{
    const int n = zn_str(ctx, v, key, 16 + 1);
    if (n < 0) return -1;
    if (n == 0 || n > 15) {
        JS_ThrowRangeError(ctx, "zinc:storage: a key is 1 to 15 bytes on the ESP32 (NVS), not %d", n);
        return -1;
    }
    if (!nvs) {
        JS_ThrowInternalError(ctx, "zinc:storage: the NVS partition cannot be opened");
        return -1;
    }
    return 0;
}

ZN_FN(js_storage_get)
{
    char key[17], value[1904];
    size_t len = sizeof value;
    if (key_of(ctx, argc ? argv[0] : JS_UNDEFINED, key)) return JS_EXCEPTION;
    if (nvs_get_str(nvs, key, value, &len) != ESP_OK) return JS_NewString(ctx, "");
    return JS_NewStringLen(ctx, value, len ? len - 1 : 0);
}

ZN_FN(js_storage_set)
{
    char key[17];
    static char value[1904];
    if (key_of(ctx, argc ? argv[0] : JS_UNDEFINED, key)) return JS_EXCEPTION;
    const int n = zn_str(ctx, argc > 1 ? argv[1] : JS_UNDEFINED, value, sizeof value);
    if (n < 0) return JS_EXCEPTION;
    if (n >= (int)sizeof value - 1) return JS_ThrowRangeError(ctx, "zinc:storage set: a value is %d bytes at most on the ESP32", (int)sizeof value - 2);
    if (nvs_set_str(nvs, key, value) != ESP_OK || nvs_commit(nvs) != ESP_OK) return JS_ThrowInternalError(ctx, "zinc:storage set: the NVS partition is full");
    return JS_UNDEFINED;
}

ZN_FN(js_storage_remove)
{
    char key[17];
    if (key_of(ctx, argc ? argv[0] : JS_UNDEFINED, key)) return JS_EXCEPTION;
    nvs_erase_key(nvs, key);
    nvs_commit(nvs);
    return JS_UNDEFINED;
}

/* the keys joined by '\n' (js/modules/storage.js splits them) */
ZN_FN(js_storage_keys)
{
    static char out[1024];
    size_t n = 0;
    nvs_iterator_t it = NULL;
    for (esp_err_t e = nvs_entry_find(NVS_DEFAULT_PART_NAME, "zinc", NVS_TYPE_STR, &it); e == ESP_OK; e = nvs_entry_next(&it)) {
        nvs_entry_info_t info;
        nvs_entry_info(it, &info);
        const size_t k = strlen(info.key);
        if (n + k + 1 >= sizeof out) break;
        if (n) out[n++] = '\n';
        memcpy(out + n, info.key, k);
        n += k;
    }
    nvs_release_iterator(it);
    return JS_NewStringLen(ctx, out, n);
}
