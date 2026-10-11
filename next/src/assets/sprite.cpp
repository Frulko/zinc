// Sprites and atlases (ZN-438): frames from images, Aseprite files and JSON sheets, trimmed and cached one file at a time, then packed into
// pages with stb_rect_pack when their pack is written. See sprite.h; the formats are in docs/reports/zinc-next-assets.md.
#include "assets/sprite.h"

#include "assets/assets.h"
#include "res/codec.h"
#include "res/res.h"
#include "yyjson.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <regex>

#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wunused-function"
#pragma clang diagnostic ignored "-Wunused-parameter"
#pragma clang diagnostic ignored "-Wsign-compare"
#pragma clang diagnostic ignored "-Wmissing-field-initializers"
#pragma clang diagnostic ignored "-Wunused-variable"   // cute_aseprite: what its asserts check, gone with NDEBUG
#pragma clang diagnostic ignored "-Wunused-but-set-variable"
#elif defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wunused-parameter"
#pragma GCC diagnostic ignored "-Wsign-compare"
#pragma GCC diagnostic ignored "-Wmissing-field-initializers"
#pragma GCC diagnostic ignored "-Wmaybe-uninitialized"
#pragma GCC diagnostic ignored "-Wunused-variable"
#pragma GCC diagnostic ignored "-Wunused-but-set-variable"
#endif
#include "stb_rect_pack.h"
// qsort is not stable: frames of one size would land where the C library's sort puts them, and the packs of one project must be the same
// bytes on every machine (docs/zpk.md)
static void znStableSort(void* base, size_t n, size_t, int (*cmp)(const void*, const void*)) {
  auto* r = static_cast<stbrp_rect*>(base);
  std::stable_sort(r, r + n, [cmp](const stbrp_rect& a, const stbrp_rect& b) { return cmp(&a, &b) < 0; });
}
#define STBRP_SORT znStableSort
#define STB_RECT_PACK_IMPLEMENTATION
#include "stb_rect_pack.h"
// an Aseprite warning (a blend mode it does not know) goes to the build's error output, not to its standard output
#define CUTE_ASEPRITE_WARNING(msg) std::fprintf(stderr, "zinc assets: aseprite: %s\n", msg)
#define CUTE_ASEPRITE_IMPLEMENTATION
#include "cute_aseprite.h"
#if defined(__clang__)
#pragma clang diagnostic pop
#elif defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

namespace fs = std::filesystem;

namespace zn::assets {
namespace {

using Opts = std::map<std::string, std::string>;

// A frame in the texels of its source: rgba holds w x h straight-alpha pixels at (ox, oy) of a source of sw x sh.
struct Frame {
  std::string name;
  int w = 0, h = 0, ox = 0, oy = 0, sw = 0, sh = 0, scale = 1, ms = 100;
  float px = 0.5f, py = 0.5f;   // the pivot, 0..1 of the source
  bool loose = false;           // a file of its own (its numbered siblings make an animation)
  std::vector<std::uint8_t> rgba;
};
enum Mode { Forward = 0, Reverse = 1, PingPong = 2 };
const char* const kModes[] = {"forward", "reverse", "pingpong"};
struct Anim { std::string name; int mode = Forward; std::vector<int> frames; };   // frames: indexes into the frames of the same source

int num(const Opts& o, const char* k, int def) { auto it = o.find(k); return it == o.end() ? def : std::atoi(it->second.c_str()); }
bool flag(const Opts& o, const char* k, bool def) { auto it = o.find(k); return it == o.end() ? def : it->second == "true" || it->second == "1"; }

void put32(std::string& o, std::uint32_t v) { for (int k = 0; k < 4; ++k) o += static_cast<char>((v >> (8 * k)) & 0xff); }
void putStr(std::string& o, const std::string& s) { put32(o, static_cast<std::uint32_t>(s.size())); o += s; }
void putF(std::string& o, float f) { std::uint32_t u; std::memcpy(&u, &f, 4); put32(o, u); }
struct In {
  const std::string& s;
  std::size_t at = 0;
  bool ok = true;
  std::uint32_t u32() {
    if (at + 4 > s.size()) { ok = false; return 0; }
    std::uint32_t v = 0;
    for (int k = 0; k < 4; ++k) v |= static_cast<std::uint32_t>(static_cast<unsigned char>(s[at + k])) << (8 * k);
    at += 4;
    return v;
  }
  int i() { return static_cast<int>(u32()); }
  float f() { const std::uint32_t u = u32(); float v; std::memcpy(&v, &u, 4); return v; }
  std::string str(std::size_t n) { if (at + n > s.size()) { ok = false; return {}; } at += n; return s.substr(at - n, n); }
};

/** Crops a frame to its texels that are not transparent and one transparent texel around them, where the source has one: drawn with linear
 *  filtering at a fractional position, a texel at the edge blends with its transparent neighbour exactly as in the whole image, and the
 *  destination rectangle still covers every pixel the whole image would touch (docs/reports/zinc-next-assets.md). */
void trimFrame(Frame& f, bool trim) {
  int x0 = 0, y0 = 0, x1 = f.w - 1, y1 = f.h - 1;
  if (trim) {
    x0 = f.w; y0 = f.h; x1 = y1 = -1;
    for (int y = 0; y < f.h; ++y)
      for (int x = 0; x < f.w; ++x)
        if (f.rgba[(static_cast<std::size_t>(y) * f.w + x) * 4 + 3]) { x0 = std::min(x0, x); x1 = std::max(x1, x); y0 = std::min(y0, y); y1 = std::max(y1, y); }
    if (x1 < 0) { x0 = y0 = x1 = y1 = 0; }   // nothing to see: one transparent texel
    else { x0 = std::max(0, x0 - 1); y0 = std::max(0, y0 - 1); x1 = std::min(f.w - 1, x1 + 1); y1 = std::min(f.h - 1, y1 + 1); }
  }
  const int w = x1 - x0 + 1, h = y1 - y0 + 1;
  std::vector<std::uint8_t> out(static_cast<std::size_t>(w) * h * 4);
  for (int y = 0; y < h; ++y) std::memcpy(&out[static_cast<std::size_t>(y) * w * 4], &f.rgba[(static_cast<std::size_t>(y + y0) * f.w + x0) * 4], static_cast<std::size_t>(w) * 4);
  f.rgba = std::move(out);
  f.ox += x0; f.oy += y0; f.w = w; f.h = h;
}

/** The frame name and texels per point of an image: `hero@2x.png` is `hero.png` at 2; an SVG is drawn at `scale` (2) as the baker does. */
int hiScale(const std::string& name) {
  static const std::regex hi("@([1-8])x\\.[^.]+$");
  std::smatch m;
  return std::regex_search(name, m, hi) ? m[1].str()[0] - '0' : 1;
}
std::string withoutScale(const std::string& name) { return std::regex_replace(name, std::regex("@[1-8]x(\\.[^.]+)$"), "$1"); }

bool readImage(const std::string& name, const std::string& in, const Opts& o, Frame& f, std::string& err) {
  std::vector<std::uint8_t> rgba;
  int w = 0, h = 0, k = hiScale(name);
  const auto* bytes = reinterpret_cast<const std::uint8_t*>(in.data());
  if (fs::path(name).extension() == ".svg") {   // the baker's rasterizer and size (src/res): the frame is the image `image()` draws
    if (!res::rasterizeSvg(in, 0, w, h, rgba, err)) return false;
    k = std::max(1, std::min(num(o, "scale", 2), 1024 / std::max(1, w)));
    if (k > 1 && !res::rasterizeSvg(in, w * k, w, h, rgba, err)) return false;
  } else if (!res::imageSize(bytes, in.size(), w, h) || static_cast<long long>(w) * h > (1LL << 26) || !res::decodeRgba(bytes, in.size(), w, h, rgba)) {
    err = "not a PNG, JPEG, WebP, BMP or GIF image this importer reads (or larger than 2^26 pixels)";
    return false;
  }
  f.name.clear();   // the source's own name (see readArtifact)
  f.w = f.sw = w; f.h = f.sh = h; f.scale = k; f.loose = true;
  f.ms = std::max(1, static_cast<int>(std::lround(1000.0 / std::max(1, num(o, "fps", 10)))));
  f.rgba = std::move(rgba);
  return true;
}

bool readAseprite(const std::string& in, std::vector<Frame>& frames, std::vector<Anim>& anims, std::string& err) {
  // the parser trusts its input (a file of the project's own): a file that is not an Aseprite file is refused before it reads it
  auto u16 = [&](std::size_t at) { return static_cast<unsigned>(static_cast<unsigned char>(in[at]) | static_cast<unsigned char>(in[at + 1]) << 8); };
  if (in.size() < 128 || u16(4) != 0xA5E0 || (u16(0) | u16(2) << 16) > in.size()) { err = "not an Aseprite file"; return false; }
  ase_t* ase = cute_aseprite_load_from_memory(in.data(), static_cast<int>(in.size()), nullptr);
  if (!ase) { err = "an Aseprite file cute_aseprite cannot read"; return false; }
  const int base = static_cast<int>(frames.size());
  for (int i = 0; i < ase->frame_count; ++i) {
    Frame f;
    f.name = "#" + std::to_string(i);
    f.w = f.sw = ase->w; f.h = f.sh = ase->h;
    f.ms = ase->frames[i].duration_milliseconds;
    const auto* px = reinterpret_cast<const std::uint8_t*>(ase->frames[i].pixels);
    f.rgba.assign(px, px + static_cast<std::size_t>(ase->w) * ase->h * 4);
    frames.push_back(std::move(f));
  }
  if (ase->frame_count > 1) {   // the whole file is an animation of its name
    Anim a{"", Forward, {}};
    for (int i = 0; i < ase->frame_count; ++i) a.frames.push_back(base + i);
    anims.push_back(std::move(a));
  }
  for (int t = 0; t < ase->tag_count; ++t) {
    const ase_tag_t& tag = ase->tags[t];
    Anim a{std::string("#") + tag.name, tag.loop_animation_direction == ASE_ANIMATION_DIRECTION_BACKWORDS ? Reverse
                                  : tag.loop_animation_direction == ASE_ANIMATION_DIRECTION_PINGPONG ? PingPong : Forward, {}};
    for (int i = std::max(0, tag.from_frame); i <= tag.to_frame && i < ase->frame_count; ++i) a.frames.push_back(base + i);
    if (!a.frames.empty()) anims.push_back(std::move(a));
  }
  cute_aseprite_free(ase);
  return true;
}

int jint(yyjson_val* o, const char* k, int def) { yyjson_val* v = yyjson_obj_get(o, k); return yyjson_is_num(v) ? static_cast<int>(yyjson_get_num(v)) : def; }

/** A TexturePacker "JSON hash" or "JSON array" sheet, or Aseprite's `--data` export of the same shape: each frame is cut out of the sheet
 *  (turned back when it was packed rotated, put back at its place in its untrimmed source); meta.frameTags (Aseprite) and animations
 *  (TexturePacker) are the animations. */
bool readSheet(const std::string& json, const std::string& sheet, std::vector<Frame>& frames, std::vector<Anim>& anims, std::string& err) {
  yyjson_doc* doc = yyjson_read(json.data(), json.size(), 0);
  yyjson_val* root = yyjson_doc_get_root(doc);
  yyjson_val* list = yyjson_obj_get(root, "frames");
  if (!yyjson_is_obj(list) && !yyjson_is_arr(list)) { yyjson_doc_free(doc); err = "not a JSON sheet: no \"frames\" object or array"; return false; }
  std::vector<std::uint8_t> px;
  int W = 0, H = 0;
  const auto* bytes = reinterpret_cast<const std::uint8_t*>(sheet.data());
  if (!res::imageSize(bytes, sheet.size(), W, H) || static_cast<long long>(W) * H > (1LL << 26) || !res::decodeRgba(bytes, sheet.size(), W, H, px)) {
    yyjson_doc_free(doc);
    err = "the image of the sheet (meta.image) is not one the importer reads";
    return false;
  }
  const int base = static_cast<int>(frames.size());
  std::map<std::string, int> byName;
  auto one = [&](const std::string& key, yyjson_val* v) {
    yyjson_val* r = yyjson_obj_get(v, "frame");
    const int x = jint(r, "x", 0), y = jint(r, "y", 0), w = jint(r, "w", 0), h = jint(r, "h", 0);
    const bool rotated = yyjson_get_bool(yyjson_obj_get(v, "rotated"));
    const int rw = rotated ? h : w, rh = rotated ? w : h;   // what it covers in the sheet
    if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + rw > W || y + rh > H) { err = "the frame " + key + " is not inside the sheet"; return false; }
    yyjson_val* ss = yyjson_obj_get(v, "spriteSourceSize");
    yyjson_val* src = yyjson_obj_get(v, "sourceSize");
    Frame f;
    f.name = key;
    f.sw = std::max(1, jint(src, "w", w)); f.sh = std::max(1, jint(src, "h", h));
    const int at = jint(ss, "x", 0), bt = jint(ss, "y", 0);
    if (at < 0 || bt < 0 || at + w > f.sw || bt + h > f.sh) { err = "the frame " + key + " does not fit its sourceSize"; return false; }
    f.w = f.sw; f.h = f.sh;
    f.rgba.assign(static_cast<std::size_t>(f.sw) * f.sh * 4, 0);
    for (int v2 = 0; v2 < h; ++v2)
      for (int u = 0; u < w; ++u) {   // rotated: TexturePacker turned the sprite 90 degrees clockwise into the sheet
        const int sx = rotated ? x + h - 1 - v2 : x + u, sy = rotated ? y + u : y + v2;
        std::memcpy(&f.rgba[(static_cast<std::size_t>(bt + v2) * f.sw + at + u) * 4], &px[(static_cast<std::size_t>(sy) * W + sx) * 4], 4);
      }
    yyjson_val* pivot = yyjson_obj_get(v, "pivot");
    if (yyjson_is_obj(pivot)) { f.px = static_cast<float>(yyjson_get_num(yyjson_obj_get(pivot, "x"))); f.py = static_cast<float>(yyjson_get_num(yyjson_obj_get(pivot, "y"))); }
    f.ms = jint(v, "duration", 100);
    byName[key] = static_cast<int>(frames.size());
    frames.push_back(std::move(f));
    return true;
  };
  size_t i, n;
  yyjson_val *k, *v;
  bool ok = true;
  if (yyjson_is_obj(list)) { yyjson_obj_foreach(list, i, n, k, v) if (ok) ok = one(yyjson_get_str(k), v); }
  else { yyjson_arr_foreach(list, i, n, v) if (ok) ok = one(yyjson_is_str(yyjson_obj_get(v, "filename")) ? yyjson_get_str(yyjson_obj_get(v, "filename")) : "#" + std::to_string(i), v); }
  yyjson_val* meta = yyjson_obj_get(root, "meta");
  yyjson_val* tags = yyjson_obj_get(meta, "frameTags");
  if (ok && yyjson_is_arr(tags))
    yyjson_arr_foreach(tags, i, n, v) {
      const char* dir = yyjson_get_str(yyjson_obj_get(v, "direction"));
      Anim a{yyjson_is_str(yyjson_obj_get(v, "name")) ? yyjson_get_str(yyjson_obj_get(v, "name")) : "", Forward, {}};
      if (dir && !std::strcmp(dir, "reverse")) a.mode = Reverse;
      else if (dir && !std::strncmp(dir, "pingpong", 8)) a.mode = PingPong;
      for (int f = jint(v, "from", 0); f <= jint(v, "to", -1) && base + f < static_cast<int>(frames.size()); ++f) a.frames.push_back(base + f);
      if (!a.name.empty() && !a.frames.empty()) anims.push_back(std::move(a));
    }
  yyjson_val* named = yyjson_obj_get(root, "animations");
  if (ok && yyjson_is_obj(named))
    yyjson_obj_foreach(named, i, n, k, v) {
      Anim a{yyjson_get_str(k), Forward, {}};
      size_t j, m;
      yyjson_val* fv;
      yyjson_arr_foreach(v, j, m, fv) if (yyjson_is_str(fv) && byName.count(yyjson_get_str(fv))) a.frames.push_back(byName[yyjson_get_str(fv)]);
      if (!a.frames.empty()) anims.push_back(std::move(a));
    }
  yyjson_doc_free(doc);
  return ok;
}

/** The frames and animations of `source`'s artifact. A key covers bytes, not paths (one file under two names is imported once), so the
 *  artifact names its own frames by what follows the source's name: "" (the source itself), "#3", "#tag"; a sheet's names are its own. */
bool readArtifact(const std::string& source, const std::string& a, std::vector<Frame>& frames, std::vector<Anim>& anims) {
  const std::string base0 = withoutScale(source);
  auto named = [&](std::string n) { return n.empty() || n[0] == '#' ? base0 + n : n; };
  In r{a};
  if (r.str(4) != "ZSF1") return false;
  const int nf = r.i(), na = r.i(), base = static_cast<int>(frames.size());
  for (int i = 0; i < nf && r.ok; ++i) {
    Frame f;
    f.name = named(r.str(r.u32()));
    f.w = r.i(); f.h = r.i(); f.ox = r.i(); f.oy = r.i(); f.sw = r.i(); f.sh = r.i(); f.scale = r.i(); f.ms = r.i(); f.loose = r.i() != 0;
    f.px = r.f(); f.py = r.f();
    const std::string px = r.str(static_cast<std::size_t>(f.w) * f.h * 4);
    f.rgba.assign(px.begin(), px.end());
    frames.push_back(std::move(f));
  }
  for (int i = 0; i < na && r.ok; ++i) {
    Anim an;
    an.name = named(r.str(r.u32()));
    an.mode = r.i();
    for (int k = r.i(); k > 0 && r.ok; --k) an.frames.push_back(base + r.i());
    anims.push_back(std::move(an));
  }
  return r.ok && r.at == a.size();
}

/** The artifact of a source's frames (trimmed) and animations: what readArtifact reads. */
std::string writeArtifact(std::vector<Frame>& frames, const std::vector<Anim>& anims, bool trim) {
  std::string out = "ZSF1";
  put32(out, static_cast<std::uint32_t>(frames.size()));
  put32(out, static_cast<std::uint32_t>(anims.size()));
  for (Frame& f : frames) {
    trimFrame(f, trim);
    putStr(out, f.name);
    for (int v : {f.w, f.h, f.ox, f.oy, f.sw, f.sh, f.scale, f.ms, f.loose ? 1 : 0}) put32(out, static_cast<std::uint32_t>(v));
    putF(out, f.px); putF(out, f.py);
    out.append(reinterpret_cast<const char*>(f.rgba.data()), f.rgba.size());
  }
  for (const Anim& a : anims) {
    putStr(out, a.name);
    put32(out, static_cast<std::uint32_t>(a.mode));
    put32(out, static_cast<std::uint32_t>(a.frames.size()));
    for (int i : a.frames) put32(out, static_cast<std::uint32_t>(i));
  }
  return out;
}

int pot(int v) { int p = 1; while (p < v) p <<= 1; return p; }

}  // namespace

std::string zimHeader(int format, int scale, bool premultiplied, int w, int h) {
  std::string o = "ZIM1";
  o += static_cast<char>(format);
  o += static_cast<char>(scale);
  o += static_cast<char>(premultiplied ? 1 : 0);
  o += '\0';
  put32(o, static_cast<std::uint32_t>(w));
  put32(o, static_cast<std::uint32_t>(h));
  return o;
}

std::string sheetImage(const std::string& name, const std::string& json) {
  yyjson_doc* doc = yyjson_read(json.data(), json.size(), 0);
  yyjson_val* root = yyjson_doc_get_root(doc);
  yyjson_val* image = yyjson_obj_get(yyjson_obj_get(root, "meta"), "image");
  std::string out;
  if (yyjson_is_str(image) && yyjson_obj_get(root, "frames")) out = (fs::path(name).parent_path() / yyjson_get_str(image)).lexically_normal().generic_string();
  yyjson_doc_free(doc);
  return out.rfind("../", 0) == 0 ? std::string() : out;   // outside the assets directory: not read
}

bool importSprite(const std::string& name, const std::string& in, const std::string& sheet, const Opts& o, std::string& out, std::string& err) {
  std::vector<Frame> frames;
  std::vector<Anim> anims;
  std::string ext = fs::path(name).extension().string();
  std::transform(ext.begin(), ext.end(), ext.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
  if (ext == ".aseprite" || ext == ".ase") { if (!readAseprite(in, frames, anims, err)) return false; }
  else if (ext == ".json") { if (!readSheet(in, sheet, frames, anims, err)) return false; }
  else {
    Frame f;
    if (!readImage(name, in, o, f, err)) return false;
    frames.push_back(std::move(f));
  }
  out = writeArtifact(frames, anims, flag(o, "trim", true));
  return true;
}

std::string spriteArtifact(std::vector<Cut> cuts) {
  std::vector<Frame> frames;
  for (Cut& c : cuts) {
    Frame f;
    f.name = std::move(c.name);
    f.w = f.sw = c.w; f.h = f.sh = c.h;
    f.rgba = std::move(c.rgba);
    frames.push_back(std::move(f));
  }
  return writeArtifact(frames, {}, true);
}

bool buildAtlas(const std::string& atlas, const std::vector<std::pair<std::string, std::string>>& sources, const Opts& o, std::vector<zpk::Input>& out,
                std::string& err) {
  std::vector<Frame> all;
  std::vector<Anim> anims;
  for (const auto& [name, a] : sources)
    if (!readArtifact(name, a, all, anims)) { err = name + ": a damaged sprite artifact"; return false; }
  // one frame per name: the one with more texels per point wins (hero.png and hero@2x.png), two of one scale are a mistake
  std::map<std::string, int> byName;
  std::vector<int> remap(all.size(), -1);
  for (int i = 0; i < static_cast<int>(all.size()); ++i) {
    auto [it, fresh] = byName.emplace(all[i].name, i);
    if (fresh) continue;
    const Frame& a = all[it->second];
    const Frame& b = all[i];
    if (a.w == b.w && a.h == b.h && a.ox == b.ox && a.oy == b.oy && a.sw == b.sw && a.sh == b.sh && a.scale == b.scale && a.rgba == b.rgba) continue;   // one tile of two maps
    if (all[it->second].scale == all[i].scale) { err = "the atlas " + atlas + " has two frames named " + all[i].name; return false; }
    if (all[i].scale > all[it->second].scale) it->second = i;
  }
  std::vector<int> order;   // the frames of the table, by name
  for (const auto& [n, i] : byName) { remap[i] = static_cast<int>(order.size()); order.push_back(i); }
  for (int i = 0; i < static_cast<int>(all.size()); ++i) if (remap[i] < 0) remap[i] = remap[byName[all[i].name]];
  // loose files whose names end in a number (walk_1.png, walk_2.png) are an animation of what comes before it (walk)
  std::map<std::string, std::vector<std::pair<long, int>>> numbered;
  static const std::regex digits("^(.*?)[-_ .]?([0-9]+)$");
  for (int i : order) {
    if (!all[i].loose) continue;
    const fs::path p(all[i].name);
    std::smatch m;
    const std::string stem = (p.parent_path() / p.stem()).generic_string();
    if (std::regex_match(stem, m, digits) && !m[1].str().empty()) numbered[m[1].str()].push_back({std::atol(m[2].str().c_str()), i});
  }
  for (auto& [n, list] : numbered) {
    if (list.size() < 2) continue;
    std::sort(list.begin(), list.end());
    Anim a{n, Forward, {}};
    for (const auto& [k, i] : list) a.frames.push_back(i);
    anims.push_back(std::move(a));
  }

  const int maxSize = std::max(16, std::min(16384, num(o, "maxSize", 2048))), padding = std::max(0, num(o, "padding", 1)), extrude = std::max(0, num(o, "extrude", 1));
  const bool potPages = flag(o, "pot", false);
  std::vector<stbrp_rect> rects;
  for (int i : order) {
    const Frame& f = all[i];
    const int e = extrude * f.scale, rw = f.w + 2 * e + padding, rh = f.h + 2 * e + padding;
    if (rw - padding > maxSize || rh - padding > maxSize) {
      err = "the frame " + f.name + " is " + std::to_string(rw - padding) + " x " + std::to_string(rh - padding) + " texels with its extrusion: larger than a page of the atlas " + atlas + " (maxSize " + std::to_string(maxSize) + ")";
      return false;
    }
    rects.push_back({i, static_cast<stbrp_coord>(std::min(rw, maxSize)), static_cast<stbrp_coord>(std::min(rh, maxSize)), 0, 0, 0});
  }
  // pages: the smallest power-of-two square that takes every frame left, cut to what it holds; when even maxSize does not, a full page of
  // what fits and the rest on the next
  struct Placed { int frame, page, x, y; };
  std::vector<Placed> placed;
  std::vector<std::pair<int, int>> pages;   // sizes
  std::vector<stbrp_node> nodes(static_cast<std::size_t>(maxSize));
  std::vector<stbrp_rect> left = rects;
  while (!left.empty()) {
    long long area = 0;
    for (const stbrp_rect& r : left) area += static_cast<long long>(r.w) * r.h;
    int side = 16;
    while (side < maxSize && static_cast<long long>(side) * side < area) side <<= 1;
    std::vector<stbrp_rect> tryRects;
    for (;; side <<= 1) {
      side = std::min(side, maxSize);
      tryRects = left;
      stbrp_context ctx;
      stbrp_init_target(&ctx, side, side, nodes.data(), side);
      if (stbrp_pack_rects(&ctx, tryRects.data(), static_cast<int>(tryRects.size())) || side == maxSize) break;
    }
    int pw = 1, ph = 1;
    std::vector<stbrp_rect> rest;
    const int page = static_cast<int>(pages.size());
    for (const stbrp_rect& r : tryRects) {
      if (!r.was_packed) { rest.push_back(r); continue; }
      placed.push_back({r.id, page, r.x, r.y});
      pw = std::max(pw, r.x + r.w - padding); ph = std::max(ph, r.y + r.h - padding);
    }
    if (rest.size() == left.size()) { err = "the atlas " + atlas + " cannot place its frames in pages of " + std::to_string(maxSize) + " texels"; return false; }
    pages.push_back(potPages ? std::make_pair(pot(pw), pot(ph)) : std::make_pair(pw, ph));
    left = std::move(rest);
  }

  std::vector<std::vector<std::uint8_t>> px(pages.size());
  for (std::size_t p = 0; p < pages.size(); ++p) px[p].assign(static_cast<std::size_t>(pages[p].first) * pages[p].second * 4, 0);
  std::map<int, Placed> where;
  int pageScale = 1;
  for (const Placed& pl : placed) {   // the frame and its extrusion: the texels of its edges repeated `e` times outwards
    const Frame& f = all[pl.frame];
    const int e = extrude * f.scale, W = pages[pl.page].first;
    pageScale = std::max(pageScale, f.scale);
    for (int y = -e; y < f.h + e; ++y)
      for (int x = -e; x < f.w + e; ++x) {
        const int sx = std::clamp(x, 0, f.w - 1), sy = std::clamp(y, 0, f.h - 1);
        std::memcpy(&px[pl.page][(static_cast<std::size_t>(pl.y + e + y) * W + pl.x + e + x) * 4], &f.rgba[(static_cast<std::size_t>(sy) * f.w + sx) * 4], 4);
      }
    where[pl.frame] = {pl.frame, pl.page, pl.x + e, pl.y + e};
  }

  std::string table = "zinc-atlas\t1\n";
  std::vector<zpk::Input> pageEntries;
  for (std::size_t p = 0; p < pages.size(); ++p) {
    const std::string entry = atlas + ".atlas." + std::to_string(p);
    table += "page\t" + entry + "\t" + std::to_string(pages[p].first) + "\t" + std::to_string(pages[p].second) + "\n";
    std::string data = zimHeader(static_cast<int>(Format::Rgba8), pageScale, false, pages[p].first, pages[p].second);
    data.append(reinterpret_cast<const char*>(px[p].data()), px[p].size());
    pageEntries.push_back({entry, std::move(data), 0, static_cast<std::uint8_t>(Kind::Image), zpk::Codec::None});
  }
  char num2[64];
  auto g = [&](float v) { std::snprintf(num2, sizeof num2, "%g", static_cast<double>(v)); return std::string(num2); };
  for (int i : order) {
    const Frame& f = all[i];
    const Placed& pl = where[i];
    table += "frame\t" + f.name;
    for (int v : {pl.page, pl.x, pl.y, f.w, f.h, f.ox, f.oy, f.sw, f.sh, f.scale}) table += "\t" + std::to_string(v);
    table += "\t" + g(f.px) + "\t" + g(f.py) + "\t" + std::to_string(f.ms) + "\n";
  }
  std::sort(anims.begin(), anims.end(), [](const Anim& a, const Anim& b) { return a.name < b.name; });
  for (std::size_t k = 0; k < anims.size(); ++k) {
    if (k && anims[k].name == anims[k - 1].name) { err = "the atlas " + atlas + " has two animations named " + anims[k].name; return false; }
    table += "anim\t" + anims[k].name + "\t" + kModes[anims[k].mode];
    for (int i : anims[k].frames) table += "\t" + std::to_string(remap[i]);
    table += "\n";
  }
  out.push_back({atlas + ".atlas", std::move(table), 0, static_cast<std::uint8_t>(Kind::Data), zpk::Codec::None});
  for (zpk::Input& e : pageEntries) out.push_back(std::move(e));
  return true;
}

}  // namespace zn::assets
