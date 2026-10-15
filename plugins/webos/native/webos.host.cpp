// zinc:webos: the PDK library of webOS 3, loaded with dlopen so that a build needs no PDK and the same program runs elsewhere (not available).
// PDL_ServiceCall sends a request on the Luna bus as the application the system started (its id gives its permissions).
#define ZRT_HOSTED_CPP   // zrt.h takes <new> from the standard library, which <string> includes too
#include "zinc_native_webos.h"
#include <dlfcn.h>
#include <string>

namespace {
int (*pdl_init)(unsigned);
int (*pdl_call)(const char*, const char*);
const char* (*pdl_error)();
int (*pdl_timeout)(int);   // PDL_ScreenTimeoutEnable, PDL_bool as an int
std::string last;   // why the last call failed
// The library, once. PDL_Init wants the screen open (SDL_Init done): it is called before each request until it has succeeded.
bool load() {
  static int state = 0;   // 0 not tried, 1 there, -1 not webOS
  if (!state) {
    state = -1;
    if (void* so = dlopen("libpdl.so", RTLD_NOW | RTLD_GLOBAL)) {
      pdl_init = reinterpret_cast<int (*)(unsigned)>(dlsym(so, "PDL_Init"));
      pdl_call = reinterpret_cast<int (*)(const char*, const char*)>(dlsym(so, "PDL_ServiceCall"));
      pdl_error = reinterpret_cast<const char* (*)()>(dlsym(so, "PDL_GetError"));
      pdl_timeout = reinterpret_cast<int (*)(int)>(dlsym(so, "PDL_ScreenTimeoutEnable"));
      if (pdl_init && pdl_call) state = 1;
    }
    else if (const char* e = dlerror()) last = std::string("libpdl.so: ") + e;
    if (state < 0 && last.empty()) last = "libpdl.so has no PDL_Init or PDL_ServiceCall";
  }
  return state > 0;
}
// PDL_Init wants the screen open: tried before each request until it has succeeded.
bool started() { static bool ok = false; if (!ok) ok = pdl_init(0) == 0; return ok; }
zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
}  // namespace

struct HostWebos : NativeWebos {
  bool available() override { return load(); }
  bool call(zrt::String uri, zrt::String params) override {
    if (!load()) return false;
    const bool init = started();
    const int rc = pdl_call(std::string(uri.ptr(), uri.bytes()).c_str(), std::string(params.ptr(), params.bytes()).c_str());
    last = rc == 0 ? "" : std::string("PDL error ") + std::to_string(rc) + (init ? "" : " (PDL_Init failed)") + (pdl_error && pdl_error() ? std::string(": ") + pdl_error() : "");
    return rc == 0;
  }
  zrt::String error() override { return str(last); }
  bool screenTimeout(bool enable) override {
    if (!load() || !pdl_timeout) return false;
    started();
    const int rc = pdl_timeout(enable ? 1 : 0);
    last = rc == 0 ? "" : std::string("PDL_ScreenTimeoutEnable error ") + std::to_string(rc);
    return rc == 0;
  }
};

NativeWebos* zinc_create_Webos() {
  static HostWebos inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
