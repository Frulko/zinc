// zinc:webos: the PDK library of webOS 3, loaded with dlopen so that a build needs no PDK and the same program runs elsewhere (not available).
// PDL_ServiceCall sends a request on the Luna bus as the application the system started (its id gives its permissions).
#include "zinc_native_webos.h"
#include <dlfcn.h>
#include <string>

namespace {
int (*pdl_init)(unsigned);
int (*pdl_call)(const char*, const char*);
bool load() {
  static int state = 0;   // 0 not tried, 1 there, -1 not webOS
  if (!state) {
    state = -1;
    if (void* so = dlopen("libpdl.so", RTLD_NOW | RTLD_GLOBAL)) {
      pdl_init = reinterpret_cast<int (*)(unsigned)>(dlsym(so, "PDL_Init"));
      pdl_call = reinterpret_cast<int (*)(const char*, const char*)>(dlsym(so, "PDL_ServiceCall"));
      if (pdl_init && pdl_call && pdl_init(0) == 0) state = 1;
    }
  }
  return state > 0;
}
}  // namespace

struct HostWebos : NativeWebos {
  bool available() override { return load(); }
  bool call(zrt::String uri, zrt::String params) override {
    if (!load()) return false;
    return pdl_call(std::string(uri.ptr(), uri.bytes()).c_str(), std::string(params.ptr(), params.bytes()).c_str()) == 0;
  }
};

NativeWebos* zinc_create_Webos() {
  static HostWebos inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
