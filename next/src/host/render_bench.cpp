// Render benchmark host (ZN-171): replays a scene dump (ZINC_SCENE_DUMP) through the software raster N times on T band threads and reports the frame time.
// No zrt.h here (it clashes with <thread>): only the raster API, whose fonts and images zn::host::installResources filled.
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstring>
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
  // the bulk damage (ZN-402) covers the exact one: diff_rects past its change threshold, and the union of everything the two frames draw
  zrt::raster::Rect bulk[8], ba = zrt::raster::bounds_all(fa, w, h), bb = zrt::raster::bounds_all(fb, w, h);
  const int nb = zrt::raster::diff_rects(fa, fb, w, h, bulk, 8, nullptr, 0);
  auto inside = [](const zrt::raster::Rect& r, const zrt::raster::Rect& o) { return o.x0 <= r.x0 && o.y0 <= r.y0 && o.x1 >= r.x1 && o.y1 >= r.y1; };
  for (int i = 0; same && i < nf; ++i) same = nb == 1 && inside(full[i], bulk[0]) && (inside(full[i], ba) || inside(full[i], bb) || inside(full[i], zrt::raster::Rect{std::min(ba.x0, bb.x0), std::min(ba.y0, bb.y0), std::max(ba.x1, bb.x1), std::max(ba.y1, bb.y1)}));
  return true;
}

// ZN-406: stroke_contours with the precomputed join circles gives the same floats as the per-vertex cosf/sinf it replaced (kept here as the
// reference), over random polylines of every join size. Returns the number of mismatching polylines (0 = identical).
namespace {
std::uint32_t strokeReference(const float* p, std::uint32_t n, float width, bool closed, float* out, std::uint32_t cap) {
  std::uint32_t used = 0, contours = 0;
  float r = width * 0.5f;
  auto emit = [&](const float* q, std::uint32_t cnt) {
    if (used + 1 + cnt * 2 > cap) return;
    float area = 0;
    for (std::uint32_t i = 0; i < cnt; i++) { std::uint32_t j = (i + 1) % cnt; area += q[i * 2] * q[j * 2 + 1] - q[j * 2] * q[i * 2 + 1]; }
    out[used++] = (float)cnt;
    for (std::uint32_t i = 0; i < cnt; i++) { std::uint32_t k = area < 0 ? cnt - 1 - i : i; out[used++] = q[k * 2]; out[used++] = q[k * 2 + 1]; }
    contours++;
  };
  std::uint32_t segs = closed ? n : n - 1;
  for (std::uint32_t i = 0; i < segs && n > 1; i++) {
    float ax = p[i * 2], ay = p[i * 2 + 1], bx = p[((i + 1) % n) * 2], by = p[((i + 1) % n) * 2 + 1];
    float dx = bx - ax, dy = by - ay, len = __builtin_sqrtf(dx * dx + dy * dy);
    if (len <= 0) continue;
    float nx = -dy / len * r, ny = dx / len * r;
    float q[8] = {ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny};
    emit(q, 4);
  }
  if (r >= 1.0f) {
    int seg = r < 3 ? 6 : r < 8 ? 10 : 16;
    for (std::uint32_t i = 0; i < n; i++) {
      if (closed || (i > 0 && i + 1 < n)) {
        std::uint32_t a = (i + n - 1) % n, b = (i + 1) % n;
        float ux = p[i * 2] - p[a * 2], uy = p[i * 2 + 1] - p[a * 2 + 1], vx = p[b * 2] - p[i * 2], vy = p[b * 2 + 1] - p[i * 2 + 1];
        float l2 = (ux * ux + uy * uy) * (vx * vx + vy * vy), cr = ux * vy - uy * vx;
        if (l2 > 0 && ux * vx + uy * vy > 0 && cr * cr * r * r < 0.1f * l2) continue;
      }
      float q[32];
      for (int k = 0; k < seg; k++) { float a = 6.2831853f * k / seg; q[k * 2] = p[i * 2] + __builtin_cosf(a) * r; q[k * 2 + 1] = p[i * 2 + 1] + __builtin_sinf(a) * r; }
      emit(q, (std::uint32_t)seg);
    }
  }
  return contours | (used << 16);
}
}  // namespace

int strokeCheck(int count) {
  std::uint64_t s = 0x9E3779B97F4A7C15ull;
  auto rnd = [&]() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return static_cast<float>(s % 100000) / 100.0f; };
  std::vector<float> pts, a(1 << 16), b(1 << 16);
  int bad = 0;
  for (int t = 0; t < count; ++t) {
    const std::uint32_t n = 2 + static_cast<std::uint32_t>(s % 40);
    pts.resize(n * 2);
    for (float& v : pts) v = rnd();
    const float width = 0.5f + static_cast<float>(t % 40) * 0.5f;   // every join size: < 2, < 6, < 16 and above
    const bool closed = t % 3 == 0;
    const std::uint32_t ra = zrt::raster::stroke_contours(pts.data(), n, width, closed, a.data(), static_cast<std::uint32_t>(a.size()));
    const std::uint32_t rb = strokeReference(pts.data(), n, width, closed, b.data(), static_cast<std::uint32_t>(b.size()));
    if (ra != rb || std::memcmp(a.data(), b.data(), (ra >> 16) * sizeof(float))) ++bad;
  }
  return bad;
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
