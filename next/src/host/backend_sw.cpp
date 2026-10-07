// The software raster behind zn::gfx::Backend (ZN-174). Same calls as the HAL band renderer: no pixel changes.
// No zrt.h here (it clashes with <thread>): only the raster API.
#include <algorithm>
#include <cstring>
#include <thread>
#include <vector>

#include "zn/scene.h"
#include "zrt_raster.h"

namespace zn::gfx {
namespace {

static_assert(sizeof(zrt::raster::Cmd) == 48, "Scene v1 is the 48-byte Cmd");

class SoftwareBackend final : public Backend {
 public:
  SoftwareBackend(std::uint32_t* px, int w, int h, int threads) : px_(px), w_(w), h_(h), threads_(std::max(1, threads)) {}
  Caps caps() const override { Caps c; c.tier = Tier::T0; std::strcpy(c.api, "sw"); std::strcpy(c.renderer, "zrt raster"); c.partialPresent = true; c.threadedBands = true; return c; }
  bool begin(const FrameInfo& f) override { return f.width == w_ && f.height == h_; }
  void draw(const SceneList* lists, int n, const RectI& d) override {
    const int y0 = std::max(0, d.y0), y1 = std::min(h_, d.y1);
    if (y1 <= y0 || d.x1 <= d.x0) return;
    const int t = std::min(threads_, y1 - y0);
    auto band = [&](int a, int b) {
      const zrt::raster::Rect r{std::max(0, d.x0), a, std::min(w_, d.x1), b};
      for (int i = 0; i < n; ++i)
        zrt::raster::render(zrt::raster::Frame{static_cast<const zrt::raster::Cmd*>(lists[i].cmds), lists[i].count, lists[i].text, lists[i].pts}, px_ + static_cast<std::size_t>(a) * w_, w_, a, b, r);
    };
    if (t == 1) { band(y0, y1); return; }
    std::vector<std::thread> pool;   // ponytail: a thread per band per frame, the HAL keeps workers
    for (int k = 0; k < t; ++k) pool.emplace_back(band, y0 + (y1 - y0) * k / t, y0 + (y1 - y0) * (k + 1) / t);
    for (auto& th : pool) th.join();
  }
  void present() override {}
  bool read(const RectI& r, std::uint32_t* rgb) override {
    if (r.x0 < 0 || r.y0 < 0 || r.x1 > w_ || r.y1 > h_ || r.x1 <= r.x0 || r.y1 <= r.y0) return false;
    for (int y = r.y0; y < r.y1; ++y) std::memcpy(rgb + static_cast<std::size_t>(y - r.y0) * (r.x1 - r.x0), px_ + static_cast<std::size_t>(y) * w_ + r.x0, static_cast<std::size_t>(r.x1 - r.x0) * 4);
    return true;
  }
  void lost() override {}   // the pixels are CPU memory

 private:
  std::uint32_t* px_;
  int w_, h_, threads_;
};

}  // namespace

std::unique_ptr<Backend> makeSoftwareBackend(std::uint32_t* pixels, int width, int height, int threads) { return std::make_unique<SoftwareBackend>(pixels, width, height, threads); }

std::unique_ptr<Backend> makeBackend(const char* renderer, std::uint32_t* pixels, int width, int height) {
  if (renderer && std::strcmp(renderer, "cpu") == 0) return makeSoftwareBackend(pixels, width, height);
  return nullptr;
}

}  // namespace zn::gfx
