// zinc:{{id}} on macOS and Linux (and the Linux boards it is cross-built for): Native{{ident}} comes from native/{{id}}.spec.ts.
// Plain C++17. A system library: plugin.json targets.<target>.pkg, libs or frameworks; more files: targets.<target>.sources.
#include "zinc_native_{{ident}}.h"
#include <cstdint>

namespace {   // internal names: two plugins in one program never share a class

struct Impl : Native{{ident}} {
  int32_t fnv1a(zrt::String text) override {
    uint32_t h = 2166136261u;
    const unsigned char* p = reinterpret_cast<const unsigned char*>(text.ptr());
    for (uint32_t i = 0; i < text.bytes(); i++) h = (h ^ p[i]) * 16777619u;
    return static_cast<int32_t>(h);
  }
};

}  // namespace

Native{{ident}}* zinc_create_{{ident}}() {
  static Impl one;
  one.rc = zrt::IMMORTAL;   // one instance for the life of the program
  return &one;
}
