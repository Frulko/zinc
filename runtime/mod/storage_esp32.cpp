// zinc:storage esp32 — NVS ("zinc" namespace): nvs_get_str/nvs_set_str per key, nvs_entry_find for keys().
#include "zrt.h"
#include "mod/storage.h"
#include "nvs_flash.h"
#include "nvs.h"
#include <string.h>

namespace zrt { namespace storage {
// ponytail: NVS keys are capped at 15 bytes (IDF limit) so long zinc keys are truncated; switch to
// a hashed-key + stored-original-name scheme if the app needs long or colliding key names.
struct CKey {
  char buf[16];
  CKey(const String& s) {
    uint32_t n = s.bytes(); if (n > 15) n = 15;
    memcpy(buf, s.ptr(), n); buf[n] = 0;
  }
};
static bool ready = false;
static nvs_handle_t h;
static void ensure() {
  if (ready) return;
  ready = true;
  esp_err_t e = nvs_flash_init();
  if (e == ESP_ERR_NVS_NO_FREE_PAGES || e == ESP_ERR_NVS_NEW_VERSION_FOUND) { nvs_flash_erase(); e = nvs_flash_init(); }
  nvs_open("zinc", NVS_READWRITE, &h);
}
String get(const String& key) {
  ensure();
  CKey k(key);
  size_t len = 0;
  if (nvs_get_str(h, k.buf, nullptr, &len) != ESP_OK || len <= 1) return String();
  char* buf = (char*)alloc(len);
  if (nvs_get_str(h, k.buf, buf, &len) != ESP_OK) { mfree(buf); return String(); }
  String r = String::from(buf, (uint32_t)(len ? len - 1 : 0));  // len includes the NUL terminator
  mfree(buf);
  return r;
}
void set(const String& key, const String& value) {
  ensure();
  CKey k(key);
  StrBuilder sb; sb.raw(value.ptr(), value.bytes()); sb.ch('\0');
  nvs_set_str(h, k.buf, sb.buf);
  nvs_commit(h);
}
void remove(const String& key) {
  ensure();
  CKey k(key);
  nvs_erase_key(h, k.buf);
  nvs_commit(h);
}
Array<String> keys() {
  ensure();
  Array<String> r = Array<String>::with_cap(0);
  nvs_iterator_t it = nullptr;
  if (nvs_entry_find(NVS_DEFAULT_PART_NAME, "zinc", NVS_TYPE_STR, &it) != ESP_OK) return r;
  while (it) {
    nvs_entry_info_t info;
    nvs_entry_info(it, &info);
    r.push(String::from(info.key, (uint32_t)strlen(info.key)));
    if (nvs_entry_next(&it) != ESP_OK) break;
  }
  if (it) nvs_release_iterator(it);
  return r;
}
}}
