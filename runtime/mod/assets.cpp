#include "zrt.h"
#include "mod/assets.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

struct ZincAsset { const char* name; const unsigned char* data; uint32_t size; };
extern const ZincAsset zinc_assets[];
extern const uint32_t zinc_asset_count;

namespace zrt { namespace assets {
static const ZincAsset* find(const String& name) {
  for (uint32_t i = 0; i < zinc_asset_count; i++)
    if (strlen(zinc_assets[i].name) == name.bytes() && !memcmp(zinc_assets[i].name, name.ptr(), name.bytes())) return &zinc_assets[i];
  return nullptr;
}
// development override: $ZINC_ASSETS/<name>
static bool from_disk(const String& name, StrBuilder& out) {
  const char* dir = getenv("ZINC_ASSETS");
  if (!dir) return false;
  StrBuilder p; p.cstr(dir); p.ch('/'); to_s(p, name); p.ch('\0');
  FILE* f = fopen(p.buf, "rb");
  if (!f) return false;
  char buf[4096]; size_t n;
  while ((n = fread(buf, 1, sizeof buf, f)) > 0) out.raw(buf, (uint32_t)n);
  fclose(f);
  return true;
}
static bool load(const String& name, StrBuilder& out) {
  if (from_disk(name, out)) return true;
  const ZincAsset* a = find(name);
  if (!a) { g_err = make<Error>(cat(String::from("asset not found: ", 17), name)); return false; }
  out.raw((const char*)a->data, a->size);
  return true;
}
String readText(const String& name) { StrBuilder sb; return load(name, sb) ? sb.build() : String(); }
Array<uint8_t> readBytes(const String& name) {
  StrBuilder sb; Array<uint8_t> r = Array<uint8_t>::with_cap(0);
  if (!load(name, sb)) return r;
  for (uint32_t i = 0; i < sb.len; i++) r.push((uint8_t)sb.buf[i]);
  return r;
}
bool exists(const String& name) { StrBuilder sb; return from_disk(name, sb) || find(name); }
Array<String> list() {
  Array<String> r = Array<String>::with_cap(0);
  for (uint32_t i = 0; i < zinc_asset_count; i++) r.push(String::from(zinc_assets[i].name, (uint32_t)strlen(zinc_assets[i].name)));
  return r;
}
}}
