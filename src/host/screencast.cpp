// The inspector's Screen view (plugins/devtools, Page.startScreencast): the frames of the program, as small JPEGs, only when the screen
// changed. The way `zinc device screen --live` streams (mirror.cpp): a copy of the frame kept at present time by rendering only the damaged
// rows into it, then shrunk by a whole factor where it changed, and encoded once per frame asked for. Nothing runs before the first frame
// is asked for, nor after stop.
#include "hal.h"
#include "res/codec.h"
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

namespace zrt { extern void (*mirror_present)(const HalFrame* f); }
namespace zrt::gfx {
extern bool capturing;   // runtime/gfx.cpp: while set, the window-only overlays (the inspector's pause badge) are left out
bool windowSlot(int32_t i, int32_t* id, const char** title, int32_t* w, int32_t* h);   // the windows beside the main one (ZN-864)
const uint32_t* windowPixels(int32_t id, int32_t* pw, int32_t* ph, uint32_t* hash);
}

namespace zn::host {
namespace {
void (*nextPresent)(const HalFrame*) = nullptr;
void (*renderAll)(uint32_t*, int32_t, int32_t) = nullptr;   // the last frame's renderer: a first frame without waiting for a present
bool on = false, full = true;
int W = 0, H = 0, K = 1, dx0, dy0, dx1, dy1;   // the frame, the factor, the damage not sent yet (frame pixels)
std::vector<uint32_t> fb;
std::vector<uint8_t> small;

void damage(int x0, int y0, int x1, int y1) {
  if (x1 <= x0 || y1 <= y0) return;
  if (dx1 <= dx0) { dx0 = x0; dy0 = y0; dx1 = x1; dy1 = y1; return; }
  dx0 = x0 < dx0 ? x0 : dx0; dy0 = y0 < dy0 ? y0 : dy0; dx1 = x1 > dx1 ? x1 : dx1; dy1 = y1 > dy1 ? y1 : dy1;
}
void present(const HalFrame* f) {
  if (nextPresent) nextPresent(f);
  renderAll = f->render;
  if (f->w != W || f->h != H) { W = f->w; H = f->h; full = true; }
  if (!on || W <= 0 || H <= 0) return;
  zrt::gfx::capturing = true;
  if (full || f->move) { fb.assign(static_cast<size_t>(W) * H, 0); f->render(fb.data(), 0, H); damage(0, 0, W, H); full = false; }
  else if (f->x1 > f->x0 && f->y1 > f->y0) {
    (f->render_damage ? f->render_damage : f->render)(fb.data() + static_cast<size_t>(f->y0) * W, f->y0, f->y1);
    damage(f->x0, f->y0, f->x1, f->y1);
  }
  zrt::gfx::capturing = false;
}
std::string base64(const std::vector<uint8_t>& s) {
  static const char* t = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string r;
  r.reserve((s.size() + 2) / 3 * 4);
  for (size_t i = 0; i < s.size(); i += 3) {
    unsigned v = s[i] << 16;
    if (i + 1 < s.size()) v |= s[i + 1] << 8;
    if (i + 2 < s.size()) v |= s[i + 2];
    r += t[v >> 18]; r += t[(v >> 12) & 63];
    r += i + 1 < s.size() ? t[(v >> 6) & 63] : '=';
    r += i + 2 < s.size() ? t[v & 63] : '=';
  }
  return r;
}
// A window beside the main one (ZN-864: each window is a target of its own): its last frame is whole in the runtime, redrawn when its
// commands changed, so it is shrunk and encoded whole when its hash is not the one sent last.
int sentWin = 0, sentK = 0;
uint32_t sentHash = 0;
std::string sideFrame(int id, int mw, int mh, int quality, bool always) {
  int32_t pw = 0, ph = 0;
  uint32_t hash = 0;
  const uint32_t* px = zrt::gfx::windowPixels(id, &pw, &ph, &hash);
  if (!px || pw <= 0 || ph <= 0) return std::string();
  int k = 1;
  while ((mw > 0 && pw / k > mw) || (mh > 0 && ph / k > mh)) k++;
  if (!always && id == sentWin && hash == sentHash && k == sentK) return std::string();
  if (!always) { sentWin = id; sentHash = hash; sentK = k; }
  const int sw = pw / k, sh = ph / k;
  std::vector<uint8_t> out(static_cast<size_t>(sw) * sh * 3);
  const uint32_t kk = static_cast<uint32_t>(k * k);
  for (int y = 0; y < sh; y++) for (int x = 0; x < sw; x++) {
    uint32_t r = 0, g = 0, b = 0;
    for (int j = 0; j < k; j++) for (int i = 0; i < k; i++) { const uint32_t v = px[static_cast<size_t>(y * k + j) * pw + x * k + i]; r += v >> 16 & 255; g += v >> 8 & 255; b += v & 255; }
    uint8_t* o = &out[(static_cast<size_t>(y) * sw + x) * 3];
    o[0] = static_cast<uint8_t>(r / kk); o[1] = static_cast<uint8_t>(g / kk); o[2] = static_cast<uint8_t>(b / kk);
  }
  return base64(quality > 0 ? zn::res::encodeJpeg(out.data(), sw, sh, 3, quality) : zn::res::encodePng(out.data(), sw, sh, 3));
}
std::string jsonText(const char* t) {
  std::string r = "\"";
  for (; *t; t++) {
    const unsigned char c = static_cast<unsigned char>(*t);
    if (c == '"' || c == '\\') { r += '\\'; r += static_cast<char>(c); }
    else if (c < 0x20) { char e[8]; std::snprintf(e, sizeof e, "\\u%04x", c); r += e; }
    else r += static_cast<char>(c);
  }
  return r + "\"";
}
}  // namespace

/** zinc:__netlog op 16: the open windows beside the main one, by id, as a JSON array of {id, title, width, height} (the inspector lists each as
 *  a target). Op 17, "id": window id's frame as a base64 PNG, whole ('' when it has none). */
std::string windowList() {
  std::vector<std::pair<int32_t, std::string>> ws;
  int32_t id = 0, w = 0, h = 0;
  const char* t = nullptr;
  for (int32_t i = 0; zrt::gfx::windowSlot(i, &id, &t, &w, &h); i++)
    if (id > 0) ws.push_back({id, "{\"id\":" + std::to_string(id) + ",\"title\":" + jsonText(t) + ",\"width\":" + std::to_string(w) + ",\"height\":" + std::to_string(h) + "}"});
  std::sort(ws.begin(), ws.end());
  std::string r = "[";
  for (const auto& e : ws) r += (r.size() > 1 ? "," : "") + e.second;
  return r + "]";
}
std::string windowShot(const std::string& arg) { return sideFrame(std::atoi(arg.c_str()), 0, 0, 0, true); }

void installScreencast() { nextPresent = zrt::mirror_present; zrt::mirror_present = present; }   // after installMirror: both see each frame

/** zinc:__netlog op 13, "maxW maxH quality": the frame as base64 JPEG (PNG for quality 0), shrunk to fit maxW x maxH; '' when nothing changed
 *  since the last one. Op 14: stop. */
std::string screencastFrame(const std::string& arg) {
  int mw = 0, mh = 0, quality = 0, win = 0;
  std::sscanf(arg.c_str(), "%d %d %d %d", &mw, &mh, &quality, &win);
  if (win > 0) return sideFrame(win, mw, mh, quality, false);   // a window beside the main one: its own target
  if (!on) {   // the first frame: drawn whole now from the last frame's renderer, damage-only from then on
    on = true; full = true;
    if (renderAll && W > 0) { zrt::gfx::capturing = true; fb.assign(static_cast<size_t>(W) * H, 0); renderAll(fb.data(), 0, H); zrt::gfx::capturing = false; damage(0, 0, W, H); full = false; }
  }
  if (dx1 <= dx0 || W <= 0) return std::string();
  int k = 1;
  while ((mw > 0 && W / k > mw) || (mh > 0 && H / k > mh)) k++;
  const int sw = W / k, sh = H / k;
  if (k != K || small.size() != static_cast<size_t>(sw) * sh * 3) { K = k; small.assign(static_cast<size_t>(sw) * sh * 3, 0); dx0 = dy0 = 0; dx1 = W; dy1 = H; }
  // the damaged box, in whole cells of k x k frame pixels, box-averaged into the small picture
  const int cx0 = dx0 / k, cy0 = dy0 / k, cx1 = (dx1 + k - 1) / k < sw ? (dx1 + k - 1) / k : sw, cy1 = (dy1 + k - 1) / k < sh ? (dy1 + k - 1) / k : sh;
  const uint32_t kk = static_cast<uint32_t>(k * k);
  for (int y = cy0; y < cy1; y++) for (int x = cx0; x < cx1; x++) {
    uint32_t r = 0, g = 0, b = 0;
    for (int j = 0; j < k; j++) for (int i = 0; i < k; i++) {
      const uint32_t v = fb[static_cast<size_t>(y * k + j) * W + x * k + i];
      r += v >> 16 & 255; g += v >> 8 & 255; b += v & 255;
    }
    uint8_t* o = &small[(static_cast<size_t>(y) * sw + x) * 3];
    o[0] = static_cast<uint8_t>(r / kk); o[1] = static_cast<uint8_t>(g / kk); o[2] = static_cast<uint8_t>(b / kk);
  }
  dx0 = dy0 = dx1 = dy1 = 0;
  return base64(quality > 0 ? zn::res::encodeJpeg(small.data(), sw, sh, 3, quality) : zn::res::encodePng(small.data(), sw, sh, 3));
}
void screencastStop() { sentWin = 0; on = false; fb = {}; small = {}; dx0 = dy0 = dx1 = dy1 = 0; }
}  // namespace zn::host
