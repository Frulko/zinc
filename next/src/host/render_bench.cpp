// Render benchmark host (ZN-171): replays a scene dump (ZINC_SCENE_DUMP) through the software raster N times on T band threads and reports the frame time.
// No zrt.h here (it clashes with <thread>): only the raster API, whose fonts and images zn::host::installResources filled.
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <thread>
#include <vector>

#include "zn/host.h"
#include "zn/scene.h"
#include "zrt_raster.h"

namespace zn::host {

bool benchScene(const char* scene, int runs, int threads, RenderBench& out) {
  std::ifstream f(scene, std::ios::binary);
  std::uint32_t head[8];
  if (!f.read(reinterpret_cast<char*>(head), sizeof head) || head[0] != 0x4e43535au || head[1] != 1 || head[4] != sizeof(zrt::raster::Cmd) || !head[2] || !head[3]) return false;
  std::vector<zrt::raster::Cmd> cmds(head[5]);
  std::vector<char> text(head[6] + 1);
  std::vector<float> pts(head[7] + 1);
  if (!f.read(reinterpret_cast<char*>(cmds.data()), static_cast<std::streamsize>(cmds.size() * sizeof(zrt::raster::Cmd))) || !f.read(text.data(), head[6]) || !f.read(reinterpret_cast<char*>(pts.data()), static_cast<std::streamsize>(head[7]) * 4)) return false;
  const int w = static_cast<int>(head[2]), h = static_cast<int>(head[3]);
  std::vector<std::uint32_t> px(static_cast<std::size_t>(w) * h);
  const zn::gfx::SceneList list{cmds.data(), head[5], text.data(), pts.data()};
  auto backend = zn::gfx::makeSoftwareBackend(px.data(), w, h, threads);
  auto once = [&] {
    std::fill(px.begin(), px.end(), 0u);
    backend->draw(&list, 1, zn::gfx::RectI{0, 0, w, h});
  };
  once();   // warm-up: glyph caches, runtime fonts
  std::vector<double> us;
  for (int i = 0; i < runs; ++i) {
    auto t0 = std::chrono::steady_clock::now();
    once();
    us.push_back(std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - t0).count());
  }
  std::sort(us.begin(), us.end());
  std::uint64_t hash = 1469598103934665603ull;
  for (std::uint32_t v : px) for (int b = 0; b < 4; ++b) { hash ^= (v >> (8 * b)) & 255; hash *= 1099511628211ull; }
  out = RenderBench{w, h, static_cast<int>(head[5]), us[us.size() / 2], us[us.size() * 99 / 100], hash};
  return true;
}

}  // namespace zn::host
