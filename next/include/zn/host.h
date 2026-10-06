#pragma once
// The host's graphics surface (zinc:gfx) as the runtime calls it. The Rt::HostGfx* entries of runtime.h list the functions with
// their parameter letters; the engine decodes the arguments into HostArg values and calls `hostGfx` with the entry's id (an
// `zn::Rt` value). `src/host` provides the function by linking the existing runtime (runtime/gfx.cpp, raster, zrt). When none is
// installed the calls trap with a clear message.
#include <cstddef>
#include <cstdint>

namespace zn::host {

// One argument or result; only the field of the parameter's letter is set: d (f64), i (i32, u32, boolean), p and n (string: bytes
// and length; f64 array: elements and count).
struct HostArg {
  double d = 0;
  std::int64_t i = 0;
  const void* p = nullptr;
  std::uint32_t n = 0;
};
using HostCall = void (*)(int id, const HostArg* args, HostArg* result);

// Installed by the host library at startup; null in an engine built without one.
extern HostCall hostGfx;
// Provided by src/host (built with ZN_HOST_GFX): installs `hostGfx`; the runtime itself starts on the first HostGfxFrames call.
void installGfx();
// Installs the baked fonts and images (the blob of src/res) in the tables of the runtime's rasterizer; the data is copied. Before the program runs.
bool installResources(const std::uint8_t* blob, std::size_t size);

}  // namespace zn::host
