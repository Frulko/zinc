#include "ff_cpu.h"
#include "zrt_raster.h"
#include <SDL3/SDL.h>
#include <array>
#include <map>
#include <stdexcept>
#include <vector>

namespace zn::ff {
namespace {
struct Texture {
  SDL_Texture* ptr{};
  uint32_t version{}, identity{};
  ~Texture() { SDL_DestroyTexture(ptr); }
};
struct Context {
  SDL_Surface* surface{};
  SDL_Renderer* renderer{};
  std::array<std::array<uint8_t, kAtlasW * kAtlasH>, 2> coverage{};
  Texture atlases[2];
  std::map<int32_t, Texture> images;
  std::vector<uint32_t> upload;
  uint32_t* pixels{};
  int32_t w{}, h{};
  bool failed{}, pending{};
  ~Context() {
    images.clear();
    for (auto& t : atlases) { SDL_DestroyTexture(t.ptr); t.ptr = nullptr; }
    SDL_DestroyRenderer(renderer); SDL_DestroySurface(surface);
  }
};
Context* current;
bool make(Texture& t, int32_t w, int32_t h) {
  SDL_DestroyTexture(t.ptr);
  t.ptr = SDL_CreateTexture(current->renderer, SDL_PIXELFORMAT_ARGB8888, SDL_TEXTUREACCESS_STATIC, w, h);
  if (t.ptr && SDL_SetTextureBlendMode(t.ptr, SDL_BLENDMODE_BLEND)) return true;
  SDL_DestroyTexture(t.ptr); t.ptr = nullptr;
  return false;
}
}
struct Cpu::Impl : Context {};
Cpu::Cpu(uint32_t* pixels, int32_t w, int32_t h) : impl(std::make_unique<Impl>()) {
  if (current) throw std::logic_error("ff CPU backend already active");
  if (!pixels || w <= 0 || h <= 0 || w > 16384 || h > 16384) throw std::invalid_argument("invalid ff CPU surface");
  impl->pixels = pixels; impl->w = w; impl->h = h;
  impl->surface = SDL_CreateSurfaceFrom(w, h, SDL_PIXELFORMAT_XRGB8888, pixels, w * 4);
  if (impl->surface) impl->renderer = SDL_CreateSoftwareRenderer(impl->surface);
  if (!impl->renderer || !SDL_SetRenderDrawBlendMode(impl->renderer, SDL_BLENDMODE_BLEND)) throw std::runtime_error(SDL_GetError());
  current = impl.get();
  reset_cache();
}
Cpu::~Cpu() { reset_cache(); current = nullptr; }
bool Cpu::render(const HalCmdList* const* lists, int32_t n) {
  begin_frame();
  impl->failed = impl->pending = false;
  for (auto it = impl->images.begin(); it != impl->images.end();) {
    int32_t w, h;
    if (!zrt::raster::image_size(it->first, &w, &h)) it = impl->images.erase(it); else ++it;
  }
  bool ok = n >= 0 && (n == 0 || lists);
  for (int32_t i = 0; ok && i < n; i++) ok = lists[i] && (!lists[i]->count || lists[i]->cmds);
  if (ok) ok = drawable(lists, n);
  if (ok) for (int32_t i = 0; i < n; i++) replay(lists[i], impl->w, impl->h, 1, 0, 0);
  if (!SDL_FlushRenderer(impl->renderer)) impl->failed = true;
  impl->pending = false;
  for (size_t i = 0; i < (size_t)impl->w * impl->h; i++) impl->pixels[i] &= 0xFFFFFF;
  end_frame();
  if (impl->failed) reset_cache();
  return ok && !impl->failed;
}
const void* texture(int32_t id, int32_t* w, int32_t* h) {
  using namespace zrt::raster;
  if (!image_size(id, w, h)) return nullptr;
  Texture& t = current->images[id];
  const uint32_t version = image_version(id), identity = image_identity(id);
  if (t.ptr && t.version == version && t.identity == identity) return &t;
  const int32_t tw = id >= 0 && id < image_count ? images[id].w : *w;
  const int32_t th = id >= 0 && id < image_count ? images[id].h : *h;
  Texture uploaded;
  if (!make(uploaded, tw, th)) { current->failed = true; return nullptr; }
  current->upload.resize((size_t)tw * th);
  const uint32_t* pixels; int32_t dw, dh, stride;
  if (dyn_view(id, &pixels, &dw, &dh, &stride)) {
    const bool alpha = dyn_alpha(id);
    for (int32_t y = 0; y < *h; y++) for (int32_t x = 0; x < *w; x++) {
      const uint32_t p = pixels[(size_t)y * stride + x];
      current->upload[(size_t)y * *w + x] = alpha ? p : p | 0xFF000000;
    }
  } else if (id >= 0 && id < image_count && images[id].rgba) {
    const uint8_t* p = images[id].rgba;
    for (size_t i = 0; i < current->upload.size(); i++, p += 4)
      current->upload[i] = (uint32_t)p[3] << 24 | (uint32_t)p[0] << 16 | (uint32_t)p[1] << 8 | p[2];
  } else return nullptr;
  if (!SDL_UpdateTexture(uploaded.ptr, nullptr, current->upload.data(), tw * 4)) { current->failed = true; return nullptr; }
  std::swap(t.ptr, uploaded.ptr);
  t.version = version; t.identity = identity;
  return &t;
}
const void* atlas(int i) { return &current->atlases[i]; }
uint8_t* atlas_memory(int i) { return current->coverage[i].data(); }
void atlas_written(int i, int32_t x, int32_t y, int32_t w, int32_t h) {
  Texture& t = current->atlases[i];
  if (!t.ptr && !make(t, kAtlasW, kAtlasH)) { current->failed = true; return; }
  current->upload.resize((size_t)w * h);
  for (int32_t row = 0; row < h; row++) for (int32_t col = 0; col < w; col++)
    current->upload[(size_t)row * w + col] = (uint32_t)current->coverage[i][(size_t)(y + row) * kAtlasW + x + col] << 24 | 0xFFFFFF;
  const SDL_Rect r{x, y, w, h};
  if (!SDL_UpdateTexture(t.ptr, &r, current->upload.data(), w * 4)) current->failed = true;
}
bool quads_pending() { return current->pending; }
void draw_quad4(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, const uint32_t rgb[4], float a) {
  SDL_Texture* t = tex ? static_cast<const Texture*>(tex)->ptr : nullptr;
  if (tex && !t) { current->failed = true; return; }
  if (t && !SDL_SetTextureScaleMode(t, linear ? SDL_SCALEMODE_LINEAR : SDL_SCALEMODE_NEAREST)) current->failed = true;
  SDL_Vertex v[4];
  for (int i = 0; i < 4; i++) {
    v[i].position = SDL_FPoint{i & 1 ? x1 : x0, i & 2 ? y1 : y0};
    v[i].tex_coord = SDL_FPoint{i & 1 ? u1 : u0, i & 2 ? v1 : v0};
    v[i].color = SDL_FColor{(float)(rgb[i] >> 16 & 255) / 255, (float)(rgb[i] >> 8 & 255) / 255, (float)(rgb[i] & 255) / 255, a};
  }
  const int indices[] = {0, 2, 1, 1, 2, 3};
  if (!SDL_RenderGeometry(current->renderer, t, v, 4, indices, 6)) current->failed = true;
  current->pending = true;
}
void draw_quad(const void* tex, bool linear, float x0, float y0, float x1, float y1, float u0, float v0, float u1, float v1, uint32_t rgb, float a) {
  if (!tex) {
    const uint32_t colors[] = {rgb, rgb, rgb, rgb};
    draw_quad4(nullptr, linear, x0, y0, x1, y1, u0, v0, u1, v1, colors, a);
    return;
  }
  SDL_Texture* t = static_cast<const Texture*>(tex)->ptr;
  if (!t) { current->failed = true; return; }
  // SDL's software triangles sample nearest; its texture blitter also implements linear filtering.
  float tw, th;
  if (!SDL_GetTextureSize(t, &tw, &th)) { current->failed = true; return; }
  SDL_FlipMode flip = SDL_FLIP_NONE;
  if (u1 < u0) { const float u = u0; u0 = u1; u1 = u; flip = (SDL_FlipMode)(flip | SDL_FLIP_HORIZONTAL); }
  if (v1 < v0) { const float v = v0; v0 = v1; v1 = v; flip = (SDL_FlipMode)(flip | SDL_FLIP_VERTICAL); }
  const SDL_FRect src{u0 * tw, v0 * th, (u1 - u0) * tw, (v1 - v0) * th};
  const SDL_FRect dst{x0, y0, x1 - x0, y1 - y0};
  if (!SDL_SetTextureScaleMode(t, linear ? SDL_SCALEMODE_LINEAR : SDL_SCALEMODE_NEAREST) ||
      !SDL_SetTextureColorMod(t, (uint8_t)(rgb >> 16), (uint8_t)(rgb >> 8), (uint8_t)rgb) ||
      !SDL_SetTextureAlphaModFloat(t, a) ||
      !SDL_RenderTextureRotated(current->renderer, t, &src, &dst, 0, nullptr, flip)) current->failed = true;
  current->pending = true;
}
}
