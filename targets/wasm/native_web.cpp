// Browser-only registry: the page registers exports that its plugin backends actually implement.
#include "zn/native.h"
#include <cstdio>
#include <cstring>
#include <deque>
#include <string>

extern "C" __attribute__((import_module("zn"), import_name("native_call")))
int32_t browser_native_call(const char*, const char*, const char*, const ZnVal*, ZnVal*, char*, size_t);
static_assert(sizeof(ZnVal) == 8, "browser glue must match the wasm32 native ABI");
namespace {
struct Export { std::string module, name, sig; ZnExport value; };
std::deque<Export> exports;
bool supported(const char* sig) {
  if (!sig) return false;
  const char* p = sig;
  while (*p && *p != '>') { if (!std::strchr("siubdfBIUDS", *p) || p - sig >= 12) return false; ++p; }
  return *p == '>' && p[1] && std::strchr("nsiubdfBID", p[1]) && !p[2];
}
}
extern "C" {
__attribute__((export_name("zn_native_reset"))) void zn_native_reset() { exports.clear(); }
__attribute__((export_name("zn_native_add"))) int32_t zn_native_add(const char* module, const char* name, const char* sig) {
  if (!module || !*module || !name || !*name || !supported(sig) || exports.size() >= 4096 || zn_native_find(module, name)) return -1;
  exports.push_back({module, name, sig, {}});
  auto& e = exports.back();
  e.value = {e.name.c_str(), e.sig.c_str(), nullptr, 0}; // never the scalar fast path: every call uses the checked import
  return 0;
}
const ZnExport* zn_native_find(const char* module, const char* name) {
  if (module && name) for (const auto& e : exports) if (e.module == module && e.name == name) return &e.value;
  return nullptr;
}
int32_t zn_native_has_module(const char* module) {
  if (module) for (const auto& e : exports) if (e.module == module) return 1;
  return 0;
}
int32_t zn_native_call(const char* module, const char* name, const char* sig, const ZnVal* args, ZnVal* ret, char* err, size_t size) {
  const auto* e = zn_native_find(module, name);
  const int status = !e ? -1 : sig && std::strcmp(sig, e->sig) ? -2 : 0;
  if (status) { if (err && size) std::snprintf(err, size, "%s", status == -1 ? "browser native export is not available" : "browser native signature mismatch"); return status; }
  return browser_native_call(module, name, e->sig, args, ret, err, size);
}
}
