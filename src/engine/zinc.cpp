// What an engine module takes from zinc (ZN-773, include/zn/engine.h): the variables and calls the driver and the bindings name, given their
// values from zn_engine_args, since zinc exports no C++ symbol for the module to bind to.
#include <functional>
#include <string>

#include "res/codec.h"
#include "zn/engine.h"
#include "zn/host.h"

namespace zn::frontend { std::function<bool(const std::string& module, std::string& err)> gNativeProvider; }

namespace zn::host {
HostCall hostGfx = nullptr, hostSys = nullptr, hostLayout = nullptr;
void (*redraw)() = nullptr;   // the module's own: the driver writes zinc's through zincRedraw
namespace { const void* (*gHooks)() = nullptr; }
const void* glPresentHooks() { return gHooks ? gHooks() : nullptr; }
}  // namespace zn::host

namespace zn::res {
namespace {
bool (*gDecode)(const uint8_t*, size_t, int&, int&, std::vector<uint8_t>&) = nullptr;
bool (*gSize)(const uint8_t*, size_t, int&, int&) = nullptr;
}  // namespace
bool decodeRgba(const uint8_t* data, size_t size, int& w, int& h, std::vector<uint8_t>& rgba) { return gDecode(data, size, w, h, rgba); }
bool imageSize(const uint8_t* data, size_t size, int& w, int& h) { return gSize(data, size, w, h); }
}  // namespace zn::res

namespace zn::engine {
void (**zincRedraw)() = nullptr;
void takeZinc(const zn_engine_args* a) {
  zn::host::hostGfx = reinterpret_cast<zn::host::HostCall>(a->host_gfx);
  zn::host::hostSys = reinterpret_cast<zn::host::HostCall>(a->host_sys);
  zn::host::hostLayout = reinterpret_cast<zn::host::HostCall>(a->host_layout);
  zincRedraw = a->redraw;
  if (a->native_provider) zn::frontend::gNativeProvider = *static_cast<const std::function<bool(const std::string&, std::string&)>*>(a->native_provider);
  zn::host::gHooks = a->gl_present_hooks;
  zn::res::gDecode = reinterpret_cast<decltype(zn::res::gDecode)>(a->decode_rgba);
  zn::res::gSize = reinterpret_cast<decltype(zn::res::gSize)>(a->image_size);
}
}  // namespace zn::engine
