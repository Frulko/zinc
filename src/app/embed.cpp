#include "zn/embed.h"
#include "zn/app.h"
#include "../../runtime/zrt_raster.h"
#include <algorithm>
#include <cstring>
#include <vector>

namespace {
// shortcut: one process-global surface matches app.cpp; use instances when app.cpp does.
struct Surface {
  int w = 0, h = 0, scale = 1; bool installed = false, paused = false, transparent = false;
  uint64_t serial = 0; HalInput input{};
  std::vector<uint32_t> pixels, white;
  std::vector<zrt::raster::Cmd> commands;
} surface;
void size(int32_t* w, int32_t* h) { *w = surface.w; *h = surface.h; }
int scale() { return surface.scale; }
int init(const HalConfig*) { return 1; }
void poll(HalInput* in) {
  *in = surface.input;
  surface.input.nkeys = surface.input.ntext = surface.input.nbtn = 0;
  surface.input.wheel = surface.input.wheel_x = 0;
}
void present(const HalFrame* f) {
  if (f->w != surface.w * surface.scale || f->h != surface.h * surface.scale) return;
  if (f->x1 <= f->x0 || f->y1 <= f->y0) return;
  auto& pixels = surface.pixels;
  if (surface.transparent && f->frames) {
    const HalCmdList* lists[8];
    int count = f->frames(lists, 8);
    for (int pass = 0; pass < 2; ++pass) {
      auto& dst = pass ? surface.white : pixels;
      std::fill(dst.begin(), dst.end(), pass ? 0xFFFFFFu : 0u);
      for (int k = 0; k < count; ++k) {
        const auto& list = *lists[k];
        const auto* cmds = static_cast<const zrt::raster::Cmd*>(list.cmds);
        surface.commands.assign(cmds, cmds + list.count);
        for (auto& cmd : surface.commands) if (cmd.kind == zrt::raster::CLEAR) cmd.c1 = pass ? 0xFFFFFFu : 0u;
        zrt::raster::render({surface.commands.data(), list.count, list.text, list.pts}, dst.data(), f->w, 0, f->h, {0, 0, f->w, f->h});
      }
    }
    for (size_t i = 0; i < pixels.size(); ++i) pixels[i] = hal_layer_pixel(pixels[i], surface.white[i]);
  } else {
    f->render(pixels.data(), 0, f->h);
    for (auto& pixel : pixels) pixel |= 0xFF000000u;
  }
  ++surface.serial;
}
HalDisplay display{init, present, poll, nullptr, 1, 0, scale, nullptr, size, nullptr, size};
bool dimensions(int w, int h, int k) { return w > 0 && h > 0 && k >= 1 && k <= 4 && int64_t(w) * h * k * k <= 16777216; }
}
extern "C" int zn_embed_resize(int w, int h, int k) {
  if (!surface.installed || !dimensions(w, h, k)) return -1;
  if (surface.w == w && surface.h == h && surface.scale == k && !surface.pixels.empty()) return 0;
  surface.w = w; surface.h = h; surface.scale = k;
  surface.pixels.assign(size_t(w) * h * k * k, 0);
  surface.white.resize(surface.pixels.size());
  return 0;
}
extern "C" int zn_embed_install(int w, int h, int k) {
  if (surface.installed || hal_display || !dimensions(w, h, k)) return -1;
  surface.installed = true; hal_display = &display;
  return zn_embed_resize(w, h, k);
}
extern "C" void zn_embed_pause(int paused) { surface.paused = paused != 0; }
extern "C" void zn_embed_transparent(int on) { surface.transparent = on != 0; }
extern "C" int zn_embed_tick() { return !surface.installed ? -1 : surface.paused ? 0 : zn_app_iterate(); }
extern "C" int zn_embed_frame(ZnEmbedFrame* f) {
  if (!f || !surface.installed) return 0;
  *f = {surface.pixels.data(), surface.w * surface.scale, surface.h * surface.scale, surface.w * surface.scale * 4, surface.serial};
  return 1;
}
extern "C" int zn_embed_event(const ZnEmbedEvent* e) {
  if (!e || !surface.installed || e->kind < ZN_EMBED_MOVE || e->kind > ZN_EMBED_BLUR) return 0;
  auto& in = surface.input;
  if (e->kind == ZN_EMBED_BLUR) { in = {}; return 1; }
  if (e->kind <= ZN_EMBED_UP) {
    if (e->kind != ZN_EMBED_MOVE && (e->key < 0 || e->key > 2 || in.nbtn == HAL_MAX_BUTTON_EVENTS)) return 0;
    in.px = e->x; in.py = e->y;
    if (e->kind != ZN_EMBED_MOVE) {
      uint32_t bit = e->key == 0 ? 1u : e->key == 1 ? 4u : 2u;
      bool down = e->kind == ZN_EMBED_DOWN;
      in.pbuttons = down ? in.pbuttons | bit : in.pbuttons & ~bit;
      in.pdown = (in.pbuttons & 1) != 0;
      in.btn[in.nbtn++] = {e->x, e->y, e->key, down};
    }
  } else if (e->kind == ZN_EMBED_WHEEL) { in.wheel += e->value; in.wheel_x += e->x; }
  else {
    if (in.nkeys == HAL_MAX_KEYS) return 0;
    size_t n = e->kind == ZN_EMBED_TEXT ? strnlen(e->text, sizeof e->text) : 0;
    if (n == sizeof e->text || n > size_t(HAL_TEXT_BYTES - in.ntext)) return 0;
    int kind = e->kind == ZN_EMBED_TEXT ? HAL_KEY_TEXT : e->kind - ZN_EMBED_KEY_DOWN;
    in.keys[in.nkeys++] = {e->key, e->mods, kind, uint16_t(in.ntext), uint16_t(n)};
    if (n) memcpy(in.text + in.ntext, e->text, n);
    in.ntext += int(n); in.mods = e->mods;
  }
  return 1;
}
extern "C" void zn_embed_quit() {
  if (!surface.installed) return;
  zn_app_quit(); hal_shutdown(); hal_display = nullptr; surface = Surface{};
}
