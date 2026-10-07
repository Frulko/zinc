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

namespace {
struct Loaded { std::uint32_t head[8]; std::vector<zrt::raster::Cmd> cmds; std::vector<char> text; std::vector<float> pts; };
bool load(const char* scene, Loaded& l) {
  std::ifstream f(scene, std::ios::binary);
  std::uint32_t* head = l.head;
  if (!f.read(reinterpret_cast<char*>(head), 32) || head[0] != 0x4e43535au || head[1] != 1 || head[4] != sizeof(zrt::raster::Cmd) || !head[2] || !head[3]) return false;
  l.cmds.resize(head[5]); l.text.resize(head[6] + 1); l.pts.resize(head[7] + 1);
  return f.read(reinterpret_cast<char*>(l.cmds.data()), static_cast<std::streamsize>(l.cmds.size() * sizeof(zrt::raster::Cmd))) && f.read(l.text.data(), head[6]) && f.read(reinterpret_cast<char*>(l.pts.data()), static_cast<std::streamsize>(head[7]) * 4);
}
}  // namespace

bool damageCheck(const char* before, const char* now, int& rects, bool& same) {
  Loaded a, b;
  if (!load(before, a) || !load(now, b) || a.head[2] != b.head[2] || a.head[3] != b.head[3]) return false;
  const int w = static_cast<int>(a.head[2]), h = static_cast<int>(a.head[3]);
  const zrt::raster::Frame fa{a.cmds.data(), a.head[5], a.text.data(), a.pts.data()}, fb{b.cmds.data(), b.head[5], b.text.data(), b.pts.data()};
  zrt::raster::Rect full[8], sig[8];
  std::vector<zrt::raster::CmdSig> sigs(a.head[5] + 1);
  zrt::raster::sign_frame(fa, w, h, sigs.data());
  const int nf = zrt::raster::diff_rects(fa, fb, w, h, full, 8), ns = zrt::raster::diff_rects_sig(sigs.data(), a.head[5], fb, w, h, sig, 8);
  rects = nf;
  same = nf == ns;
  for (int i = 0; same && i < nf; ++i) same = full[i].x0 == sig[i].x0 && full[i].y0 == sig[i].y0 && full[i].x1 == sig[i].x1 && full[i].y1 == sig[i].y1;
  return true;
}

bool benchScene(const char* scene, int runs, int threads, RenderBench& out) {
  Loaded l;
  if (!load(scene, l)) return false;
  std::uint32_t* head = l.head;
  std::vector<zrt::raster::Cmd>& cmds = l.cmds;
  std::vector<char>& text = l.text;
  std::vector<float>& pts = l.pts;
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
