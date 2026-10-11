// The engine splash (ZN-446, docs/reports/games/toolchain-assets-loading.md 7.3): the first frame of the window, shown before the program is
// compiled, its fonts baked or its plugins loaded. Its bytes are the splash entry the asset build makes (ZSP1, docs/reports/zinc-next-assets.md):
// from ZINC_SPLASH (a file of those bytes: zinc run makes it from zinc.json) or the `.splash` entry of the base packs' boot.zpk, mapped in place.
// The frame goes through the HAL's own present (hal_present with rows only, no command lists), so every window HAL shows it unchanged.
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

#include <algorithm>
#include <string>
#include <vector>

#include "hal.h"
#include "zn/host.h"
#include "zn/log.h"
#include "zpk/zpk.h"
#include "zrt_assets_dir.h"

extern "C" int zn_hal_wants_window(void);   // hal_dispatch.cpp: not a headless run, and the window host is there
extern "C" void zn_hal_hold(std::uint64_t untilUs);   // hal_dispatch.cpp: the next present waits until then

namespace zn::host {
namespace {

constexpr std::size_t kHeader = 20, kImageHeader = 16;

// What the rows of the one splash present read: the HAL's render callback takes no context, and the band threads call it at once.
// ponytail: file state for one call; a context argument if HalFrame ever grows one.
struct Frame {
  const std::uint8_t* px = nullptr;   // rgba8, premultiplied
  int w = 0, h = 0, pw = 0;
  std::uint32_t bg = 0;               // 0x00RRGGBB
  int x0 = 0, x1 = 0, y0 = 0, y1 = 0;   // the image's rectangle in surface pixels
  std::vector<int> col, row;          // per surface pixel of the rectangle: the left (top) texel, and the weight of the next one in 1/256
  std::vector<std::uint8_t> colW, rowW;
} gFrame;

std::uint32_t le32(const std::uint8_t* p) { return p[0] | p[1] << 8 | p[2] << 16 | static_cast<std::uint32_t>(p[3]) << 24; }

/** The texel to the left of each surface pixel's centre and the weight of the one after it (bilinear, clamped at the edges). */
void axis(int from, int to, double origin, double scale, int texels, std::vector<int>& at, std::vector<std::uint8_t>& w) {
  at.resize(static_cast<std::size_t>(std::max(0, to - from)));
  w.resize(at.size());
  for (int p = from; p < to; ++p) {
    double u = (p + 0.5 - origin) / scale - 0.5;
    u = std::clamp(u, 0.0, static_cast<double>(texels - 1));
    const int i = std::min(static_cast<int>(u), texels - 1);
    at[p - from] = i;
    w[p - from] = static_cast<std::uint8_t>(std::min(255.0, (u - i) * 256));
  }
}

void rows(std::uint32_t* out, std::int32_t y0, std::int32_t y1) {
  const Frame& f = gFrame;
  for (std::int32_t y = y0; y < y1; ++y, out += f.pw) {
    if (y < f.y0 || y >= f.y1 || !f.px) { std::fill(out, out + f.pw, f.bg); continue; }
    std::fill(out, out + f.x0, f.bg);
    std::fill(out + f.x1, out + f.pw, f.bg);
    const int r = f.row[y - f.y0], r1 = std::min(r + 1, f.h - 1);
    const unsigned fy = f.rowW[y - f.y0];
    const std::uint8_t *top = f.px + static_cast<std::size_t>(r) * f.w * 4, *bot = f.px + static_cast<std::size_t>(r1) * f.w * 4;
    for (int x = f.x0; x < f.x1; ++x) {
      const int c = f.col[x - f.x0], c1 = std::min(c + 1, f.w - 1);
      const unsigned fx = f.colW[x - f.x0];
      unsigned v[4];
      for (int k = 0; k < 4; ++k) {
        const unsigned t = top[c * 4 + k] * (256 - fx) + top[c1 * 4 + k] * fx, b = bot[c * 4 + k] * (256 - fx) + bot[c1 * 4 + k] * fx;
        v[k] = (t * (256 - fy) + b * fy + 32768) >> 16;
      }
      const unsigned keep = 255 - v[3];   // premultiplied: the image over the background
      auto ch = [&](int k, int shift) { return std::min(255u, v[k] + (((f.bg >> shift) & 255) * keep + 127) / 255) << shift; };
      out[x] = ch(0, 16) | ch(1, 8) | ch(2, 0);
    }
  }
}

/** The splash entry of the first boot.zpk of the base packs (ZINC_PACKS, else beside a built program), mapped: `map` and `size` to unmap. */
const std::uint8_t* fromPacks(std::size_t& n, void*& map, std::size_t& size) {
  std::string list;
  if (const char* p = std::getenv("ZINC_PACKS")) list = p;
  else {
    const char* t = std::getenv("ZINC_PACK_TARGET");
#ifdef __APPLE__
    list = zrt_program_packs_dir(t ? t : "macos");
#else
    list = zrt_program_packs_dir(t ? t : "linux");
#endif
  }
  for (std::size_t at = 0; at < list.size();) {
    std::size_t end = list.find(':', at);
    if (end == std::string::npos) end = list.size();
    std::string file = list.substr(at, end - at);
    at = end + 1;
    if (zrt_is_dir(file)) file += "/boot.zpk";
    else if (file.size() < 8 || file.compare(file.size() - 8, 8, "boot.zpk") != 0) continue;
    const int fd = open(file.c_str(), O_RDONLY);
    struct stat st;
    if (fd < 0) continue;
    void* m = fstat(fd, &st) == 0 && st.st_size > 0 ? mmap(nullptr, static_cast<std::size_t>(st.st_size), PROT_READ, MAP_PRIVATE, fd, 0) : MAP_FAILED;
    close(fd);
    if (m == MAP_FAILED) continue;
    zn::zpk::Reader r;
    std::string err;
    const long i = r.open(m, static_cast<std::size_t>(st.st_size), err) ? r.find(".splash") : -1;
    const std::uint8_t* bytes = i >= 0 ? r.view(static_cast<std::size_t>(i), err) : nullptr;
    if (bytes) { n = r.entry(static_cast<std::size_t>(i)).size; map = m; size = static_cast<std::size_t>(st.st_size); return bytes; }
    munmap(m, static_cast<std::size_t>(st.st_size));
  }
  return nullptr;
}

/** Composes the splash for the surface and presents it; false when `p` is not a splash entry. */
bool present(const std::uint8_t* p, std::size_t n) {
  if (n < kHeader || memcmp(p, "ZSP1", 4) != 0) return false;
  Frame& f = gFrame;
  f.bg = le32(p + 4) & 0xffffff;
  const int fit = p[8];
  const std::uint8_t* zim = p + kHeader;
  const std::size_t zimSize = n - kHeader;
  f.px = nullptr;
  int scale = 1;
  if (zimSize) {   // the image: ZIM1 rgba8
    if (zimSize < kImageHeader || memcmp(zim, "ZIM1", 4) != 0 || zim[4] != 1) return false;
    f.w = static_cast<int>(le32(zim + 8)); f.h = static_cast<int>(le32(zim + 12)); scale = std::max(1, static_cast<int>(zim[5]));
    if (f.w <= 0 || f.h <= 0 || zimSize != kImageHeader + static_cast<std::size_t>(f.w) * f.h * 4) return false;
    f.px = zim + kImageHeader;
  }
  { zn::log::Phase timed("run", "splash: window open", zn::log::Debug); startGfx(); }   // the window, as the program's first graphics call would open it
  int w = 0, h = 0;
  hal_surface_size(&w, &h);
  const int k = hal_pixel_scale();
  f.pw = w * k;
  const int ph = h * k;
  if (f.px) {
    const double sx = static_cast<double>(f.pw) / f.w, sy = static_cast<double>(ph) / f.h;
    const double s = fit == 1 ? std::max(sx, sy) : fit == 2 ? static_cast<double>(k) / scale : std::min(sx, sy);   // cover, center (its own size), contain
    const double ox = (f.pw - f.w * s) / 2, oy = (ph - f.h * s) / 2;
    f.x0 = std::max(0, static_cast<int>(ox)); f.x1 = std::min(f.pw, static_cast<int>(ox + f.w * s + 0.5));
    f.y0 = std::max(0, static_cast<int>(oy)); f.y1 = std::min(ph, static_cast<int>(oy + f.h * s + 0.5));
    axis(f.x0, f.x1, ox, s, f.w, f.col, f.colW);
    axis(f.y0, f.y1, oy, s, f.h, f.row, f.rowW);
  }
  HalFrame frame = {f.pw, ph, 0, 0, f.pw, ph, rows, nullptr, nullptr};
  { zn::log::Phase timed("run", "splash: present", zn::log::Debug); hal_present(&frame); }
  f.px = nullptr;
  if (const std::uint32_t minMs = le32(p + 12)) zn_hal_hold(hal_time_us() + minMs * 1000ull);   // fadeMs (p + 16) is the loader stage's (ZN-447)
  return true;
}

}  // namespace

bool showSplash() {
  static bool asked = false;   // once per process: the run path may ask again after a compile
  if (asked) return false;
  asked = true;
  const char* file = std::getenv("ZINC_SPLASH");
  std::string bytes;
  void* map = nullptr;
  std::size_t mapSize = 0, n = 0;
  const std::uint8_t* p = nullptr;
  if (file && *file) {
    if (FILE* in = fopen(file, "rb")) {
      char buf[65536];
      for (std::size_t got; (got = fread(buf, 1, sizeof buf, in)) > 0;) bytes.append(buf, got);
      fclose(in);
    }
    p = reinterpret_cast<const std::uint8_t*>(bytes.data());
    n = bytes.size();
  } else p = fromPacks(n, map, mapSize);
  bool shown = false;
  if (p && n && zn_hal_wants_window() && !hal_display) shown = present(p, n);
  if (map) munmap(map, mapSize);
  if (shown && zn::log::on("run", zn::log::Info)) {   // the wall clock too: a launcher compares it with the time it started the process (tools/splash-time)
    timeval now;
    gettimeofday(&now, nullptr);
    char at[64];
    snprintf(at, sizeof at, "splash on screen at %ld.%06ld,", static_cast<long>(now.tv_sec), static_cast<long>(now.tv_usec));
    zn::log::write("run", zn::log::Info, std::string(at) + " after start", zn::log::since(zn::log::state().t0));
  }
  return shown;
}

}  // namespace zn::host
