// Desktop reference implementation of ff_replay's backend, using the vendored SDL software renderer.
#pragma once
#include <memory>
#include "ff_replay.h"
namespace zn::ff {
class Cpu {
 public:
  // Pixels remain caller-owned, 0x00RRGGBB on return. Use on the main thread; one backend may be alive at a time.
  Cpu(uint32_t* pixels, int32_t w, int32_t h);
  ~Cpu();
  Cpu(const Cpu&) = delete;
  Cpu& operator=(const Cpu&) = delete;
  // False: unsupported command or SDL failure; output may be partial; the caller must rasterize the whole frame.
  bool render(const HalCmdList* const* lists, int32_t n);
 private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};
}
