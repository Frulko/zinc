// GPU textures (ZN-439): the texture importer, the image decoding it shares with the image importer, the report's view of an image artifact.
#include "assets/texture.h"

#include "assets/sprite.h"   // zimHeader
#include "res/codec.h"
#include "res/res.h"
#include "zn/zim.h"

#define STB_IMAGE_RESIZE_IMPLEMENTATION

#include "stb_image_resize2.h"

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <unistd.h>

namespace fs = std::filesystem;

namespace zn::assets {
namespace {

using Opts = std::map<std::string, std::string>;
bool flag(const Opts& o, const char* k, bool otherwise) {
  const auto it = o.find(k);
  return it == o.end() ? otherwise : it->second == "true" || it->second == "1";
}
std::uint32_t le32(const unsigned char* p) { return p[0] | p[1] << 8 | p[2] << 16 | static_cast<std::uint32_t>(p[3]) << 24; }
void put16(std::string& o, unsigned v) { o += static_cast<char>(v & 0xff); o += static_cast<char>(v >> 8); }
unsigned scaleTo(unsigned v, unsigned max) { return (v * max + 127) / 255; }
std::string quote(const std::string& s) {
  std::string r = "'";
  for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; }
  return r + "'";
}
bool readFile(const fs::path& p, std::string& out) {
  std::ifstream in(p, std::ios::binary);
  if (!in) return false;
  out.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  return true;
}

// The formats a profile may name: the ZIM1 format each makes (opaque and with alpha; 0: the KTX2 file itself), the bits a texel takes, and
// basisu's -export_ktx name for the block formats (opaque and with alpha).
struct Name { const char* name; std::uint8_t opaque, alpha; int bits; const char* exportOpaque; const char* exportAlpha; };
constexpr Name kNames[] = {
  {"rgba8", 1, 1, 32, nullptr, nullptr},     {"rgb565", 2, 2, 16, nullptr, nullptr},  {"rgba4444", 3, 3, 16, nullptr, nullptr},
  {"rgba5551", 4, 4, 16, nullptr, nullptr},  {"bc1", 8, 8, 4, "BC1", "BC1"},          {"bc3", 9, 9, 8, "BC3", "BC3"},
  {"bc7", 10, 10, 8, "BC7", "BC7"},          {"etc1", 11, 11, 4, "ETC1", "ETC1"},     {"etc2", 11, 12, 8, "ETC1", "ETC2"},   // opaque ETC2 is ETC1 data
  {"astc", 13, 13, 8, "ASTC", "ASTC"},       {"pvrtc", 14, 15, 4, "PVRTC1_RGB", "PVRTC1_RGBA"},
  {"ktx2", 0, 0, 8, nullptr, nullptr},
};
bool hasAlpha(const Name& n) { return n.alpha == 0 || zim::format(n.alpha)->alpha; }
// The thread count basisu runs with: fixed, not the machine's, so that a texture gives the same bytes everywhere (tests/t1/texture.sh bakes
// twice). Measured on basisu 2.50: UASTC and ETC1S give the same bytes with 1, 4 and 8 threads; 4 threads encode a 2048 x 2048 UASTC texture in
// 11 s against 37 s with one.
constexpr int kEncoderThreads = 4;

/** The format of `list` (a|b|c, a setting after ':') this image takes; see texture.h. Console layouts are ZN-452's. */
bool pick(const std::string& list, bool alpha, const Name*& out, std::string& setting, std::string& err) {
  std::vector<std::pair<const Name*, std::string>> names;
  std::string later;
  for (std::size_t from = 0; from <= list.size();) {
    std::size_t bar = list.find('|', from);
    if (bar == std::string::npos) bar = list.size();
    const std::string tok = list.substr(from, bar - from), name = tok.substr(0, tok.find(':')), set = tok.find(':') == std::string::npos ? "" : tok.substr(tok.find(':') + 1);
    from = bar + 1;
    if (name.empty()) continue;
    const Name* n = nullptr;
    for (const Name& k : kNames) if (name == k.name) n = &k;
    if (n) { names.push_back({n, set}); continue; }
    if (name == "clut4" || name == "clut8" || name == "etc1a4") { names.push_back({&kNames[0], set}); continue; }   // ZN-452: handled by console_tex encoders; reported as rgba8 to the pipeline for now
    err = "the texture format \"" + name + "\" is not one of rgba8, rgb565, rgba4444, rgba5551, bc1, bc3, bc7, etc1, etc2, astc, pvrtc, ktx2";
    return false;
  }
  if (names.empty()) { err = later.empty() ? "no texture format" : "the console layouts " + later + " are not made yet (ZN-452): name another format in the rule"; return false; }
  std::size_t at = 0;
  if (alpha) {
    for (std::size_t i = 0; i < names.size(); ++i) if (hasAlpha(*names[i].first)) { at = i; break; }
  } else {
    for (std::size_t i = 1; i < names.size(); ++i)
      if (!hasAlpha(*names[i].first) && names[i].first->bits < names[0].first->bits) { at = i; break; }
  }
  out = names[at].first;
  setting = names[at].second;
  if (out->opaque == 0 && !setting.empty() && setting != "uastc" && setting != "etc1s") { err = "ktx2:" + setting + " is not ktx2:uastc or ktx2:etc1s"; return false; }
  if (out->opaque == 13 && !setting.empty() && setting != "4x4") { err = "astc:" + setting + ": only 4x4 blocks are made"; return false; }
  return true;
}

int pow2(int v) { int p = 1; while (p < v) p <<= 1; return p; }

void resize(const std::vector<std::uint8_t>& src, int w, int h, std::vector<std::uint8_t>& dst, int dw, int dh, bool linear) {
  dst.resize(static_cast<std::size_t>(dw) * dh * 4);
  stbir_resize(src.data(), w, h, w * 4, dst.data(), dw, dh, dw * 4, STBIR_RGBA, linear ? STBIR_TYPE_UINT8 : STBIR_TYPE_UINT8_SRGB, STBIR_EDGE_CLAMP, STBIR_FILTER_DEFAULT);
}

struct Level { int w, h; std::vector<std::uint8_t> rgba; };

std::string rawLevel(std::uint8_t id, const Level& l) {
  std::string o;
  o.reserve(static_cast<std::size_t>(l.w) * l.h * (id == 1 ? 4 : 2));
  for (std::size_t i = 0; i + 3 < l.rgba.size(); i += 4) {
    const unsigned r = l.rgba[i], g = l.rgba[i + 1], b = l.rgba[i + 2], a = l.rgba[i + 3];
    if (id == 1) o.append(reinterpret_cast<const char*>(&l.rgba[i]), 4);
    else if (id == 2) put16(o, (scaleTo(r, 31) << 11) | (scaleTo(g, 63) << 5) | scaleTo(b, 31));
    else if (id == 3) put16(o, (scaleTo(r, 15) << 12) | (scaleTo(g, 15) << 8) | (scaleTo(b, 15) << 4) | scaleTo(a, 15));
    else put16(o, (scaleTo(r, 31) << 11) | (scaleTo(g, 31) << 6) | (scaleTo(b, 31) << 1) | (a >= 128 ? 1u : 0u));
  }
  return o;
}

/** A directory of its own for one encode, removed with it. */
struct Scratch {
  fs::path dir;
  Scratch() {
    static int n = 0;
    std::error_code ec;
    dir = fs::temp_directory_path(ec) / ("zinc-tex-" + std::to_string(::getpid()) + "-" + std::to_string(++n));
    fs::remove_all(dir, ec);
    fs::create_directories(dir, ec);
  }
  ~Scratch() { std::error_code ec; fs::remove_all(dir, ec); }
};

bool runTool(const std::string& cmd, const Scratch& s, std::string& err) {
  if (std::system((cmd + " >" + quote((s.dir / "log").string()) + " 2>&1").c_str()) == 0) return true;
  std::string log;
  readFile(s.dir / "log", log);
  err = "basisu failed: " + (log.size() > 600 ? log.substr(log.size() - 600) : log);
  return false;
}

bool writePng(const fs::path& p, const Level& l, bool alpha) {
  std::vector<std::uint8_t> px;
  if (alpha) px = l.rgba;
  else for (std::size_t i = 0; i + 3 < l.rgba.size(); i += 4) px.insert(px.end(), &l.rgba[i], &l.rgba[i] + 3);
  const std::vector<std::uint8_t> png = res::encodePng(px.data(), l.w, l.h, alpha ? 4 : 3);
  std::ofstream o(p, std::ios::binary);
  o.write(reinterpret_cast<const char*>(png.data()), static_cast<std::streamsize>(png.size()));
  return static_cast<bool>(o) && !png.empty();
}

/** The data of the one level of a KTX1 file (basisu -export_ktx). */
bool ktxLevel(const std::string& ktx, std::string& data) {
  static const unsigned char id[12] = {0xAB, 'K', 'T', 'X', ' ', '1', '1', 0xBB, '\r', '\n', 0x1A, '\n'};
  const auto* p = reinterpret_cast<const unsigned char*>(ktx.data());
  if (ktx.size() < 68 || std::memcmp(p, id, 12) != 0) return false;
  const std::size_t at = 64 + static_cast<std::size_t>(le32(p + 60));
  if (at + 4 > ktx.size() || at + 4 + le32(p + at) > ktx.size()) return false;
  data = ktx.substr(at + 4, le32(p + at));
  return true;
}

}  // namespace

bool decodeImage(const std::string& name, const std::string& in, const Opts& o, int& w, int& h, int& k, std::vector<std::uint8_t>& rgba, std::string& err) {
  const int scale = std::max(1, std::min(8, o.count("scale") ? std::atoi(o.at("scale").c_str()) : 1));
  w = h = 0;
  k = scale;
  const auto* bytes = reinterpret_cast<const std::uint8_t*>(in.data());
  if (fs::path(name).extension() == ".svg") {   // drawn at `scale` pixels per unit, at most 1024 pixels wide, as the baker does
    if (!res::rasterizeSvg(in, 0, w, h, rgba, err)) return false;
    k = std::max(1, std::min(scale, 1024 / std::max(1, w)));
    if (k > 1 && !res::rasterizeSvg(in, w * k, w, h, rgba, err)) return false;
    return true;
  }
  if (!res::imageSize(bytes, in.size(), w, h) || static_cast<long long>(w) * h > (1LL << 26) || !res::decodeRgba(bytes, in.size(), w, h, rgba)) {
    err = "not a PNG, JPEG, WebP, BMP or GIF image this importer reads (or larger than 2^26 pixels)";
    return false;
  }
  return true;
}

bool importTexture(const ToolPath& basisu, const std::string& name, const std::string& in, const Opts& o, std::string& out, std::string& err) {
  int w = 0, h = 0, k = 1;
  std::vector<std::uint8_t> rgba;
  if (!decodeImage(name, in, o, w, h, k, rgba, err)) return false;
  bool alpha = false;
  for (std::size_t i = 3; i < rgba.size() && !alpha; i += 4) alpha = rgba[i] != 255;
  const Name* fmt = nullptr;
  std::string setting;
  if (!pick(o.count("format") ? o.at("format") : "rgba8", alpha, fmt, setting, err)) return false;
  const bool linear = flag(o, "linear", false), mipmaps = flag(o, "mipmaps", true), premultiply = alpha && flag(o, "premultiply", true);
  const std::uint8_t id = alpha ? fmt->alpha : fmt->opaque;

  // the size the target takes: within maxSize (the aspect kept), each side a power of two with `pot` (stretched, not padded), PVRTC1 square too
  const int maxSize = o.count("maxSize") ? std::atoi(o.at("maxSize").c_str()) : 0;
  int tw = w, th = h;
  if (maxSize > 0 && std::max(tw, th) > maxSize) {
    if (tw >= th) { th = std::max(1, (th * maxSize + tw / 2) / tw); tw = maxSize; }
    else { tw = std::max(1, (tw * maxSize + th / 2) / th); th = maxSize; }
  }
  const bool pvrtc = id == 14 || id == 15;
  if (flag(o, "pot", false) || pvrtc) {
    tw = pow2(tw); th = pow2(th);
    while (maxSize > 0 && tw > maxSize) tw >>= 1;
    while (maxSize > 0 && th > maxSize) th >>= 1;
    if (pvrtc) tw = th = std::max(tw, th);
  }
  std::vector<Level> levels(1, Level{tw, th, {}});
  if (tw != w || th != h) resize(rgba, w, h, levels[0].rgba, tw, th, linear);
  else levels[0].rgba = std::move(rgba);
  // every level from level 0, alpha-weighted (straight alpha in: STBIR_RGBA), in linear light for sRGB colour
  for (int lw = tw, lh = th; mipmaps && id != 0 && (lw > 1 || lh > 1);) {
    lw = std::max(1, lw / 2); lh = std::max(1, lh / 2);
    levels.push_back(Level{lw, lh, {}});
    resize(levels[0].rgba, tw, th, levels.back().rgba, lw, lh, linear);
  }
  if (premultiply)
    for (Level& l : levels)
      for (std::size_t i = 0; i + 3 < l.rgba.size(); i += 4)
        for (int c = 0; c < 3; ++c) l.rgba[i + c] = static_cast<std::uint8_t>((l.rgba[i + c] * l.rgba[i + 3] + 127) / 255);

  const unsigned flags = (premultiply ? zim::Premultiplied : 0) | (mipmaps && id != 0 ? zim::Mipmaps : 0) | (linear ? 0 : zim::Srgb);
  if (id != 0 && zim::format(id)->bw == 1) {   // a 16- or 32-bit layout: no encoder
    out = zimHeader(id, k, flags, tw, th);
    for (const Level& l : levels) out += rawLevel(id, l);
    return true;
  }
  std::string tool;
  if (!basisu || !basisu(tool, err)) { err = "the texture encoder basisu: " + err; return false; }
  Scratch s;
  const std::string common = " -quiet -max_threads " + std::to_string(kEncoderThreads) + (linear ? " -linear" : " -srgb") + " -output_path " + quote(s.dir.string());
  if (id == 0) {   // KTX2 for the browser, basisu's own mipmaps (ZN-449 transcodes it there)
    if (!writePng(s.dir / "t.png", levels[0], alpha)) { err = "cannot write " + (s.dir / "t.png").string(); return false; }
    const std::string mips = mipmaps ? std::string(" -mipmap -mip_clamp") + (linear ? " -mip_linear" : " -mip_srgb") : "";
    if (!runTool(quote(tool) + (setting == "etc1s" ? " -etc1s" : " -uastc") + mips + common + " -file " + quote((s.dir / "t.png").string()), s, err)) return false;
    if (!readFile(s.dir / "t.ktx2", out)) { err = "basisu wrote no KTX2 file"; return false; }
    return true;
  }
  // each level encoded to UASTC (the quality hub: it transcodes to every block format), then transcoded to the format, one KTX1 file each
  std::string files, ktx2;
  for (std::size_t i = 0; i < levels.size(); ++i) {
    const fs::path png = s.dir / ("l" + std::to_string(i) + ".png");
    if (!writePng(png, levels[i], alpha)) { err = "cannot write " + png.string(); return false; }
    files += " -file " + quote(png.string());
    ktx2 += " -file " + quote((s.dir / ("l" + std::to_string(i) + ".ktx2")).string());
  }
  const char* exportName = alpha ? fmt->exportAlpha : fmt->exportOpaque;
  if (!runTool(quote(tool) + " -uastc" + common + files, s, err) || !runTool(quote(tool) + " -export_ktx " + exportName + common + ktx2, s, err)) return false;
  const zim::Format& f = *zim::format(id);
  out = zimHeader(id, k, flags, tw, th);
  for (std::size_t i = 0; i < levels.size(); ++i) {
    std::string ktx, data;
    const fs::path p = s.dir / ("l" + std::to_string(i) + "_" + exportName + ".ktx");
    if (!readFile(p, ktx) || !ktxLevel(ktx, data)) { err = "basisu wrote no " + std::string(exportName) + " level " + std::to_string(i); return false; }
    const std::size_t want = zim::levelBytes(f, static_cast<std::uint32_t>(levels[i].w), static_cast<std::uint32_t>(levels[i].h));
    // basisu writes one PVRTC1 block for a level under 8 x 8 texels, where the GL reads 2 x 2: the block repeated (a level seen from afar)
    if (pvrtc && !data.empty() && data.size() < want && want % data.size() == 0) { const std::string one = data; while (data.size() < want) data += one; }
    if (data.size() != want) { err = "basisu wrote " + std::to_string(data.size()) + " bytes of " + exportName + " for level " + std::to_string(i) + ", not " + std::to_string(want); return false; }
    out += data;
  }
  return true;
}

bool describeImage(std::string_view head, std::string& format, std::uint64_t& gpuBytes) {
  const auto* p = reinterpret_cast<const unsigned char*>(head.data());
  if (head.size() >= zim::kHeader && head.compare(0, 4, "ZIM1") == 0) {
    const zim::Format* f = zim::format(p[4]);
    if (!f) return false;
    format = f->name;
    gpuBytes = zim::dataBytes(*f, le32(p + 8), le32(p + 12), (p[6] | p[7] << 8) & zim::Mipmaps);
    return true;
  }
  static const unsigned char ktx2[12] = {0xAB, 'K', 'T', 'X', ' ', '2', '0', 0xBB, '\r', '\n', 0x1A, '\n'};
  if (head.size() < 80 || std::memcmp(p, ktx2, 12) != 0) return false;
  const std::uint32_t dfd = le32(p + 48);   // the data format descriptor: its colour model says ETC1S (163) or UASTC (166), its samples whether there is alpha
  const bool etc1s = dfd + 28 <= head.size() && p[dfd + 12] == 163;
  const bool opaque = etc1s && dfd + 12 <= head.size() && ((p[dfd + 10] | p[dfd + 11] << 8) - 24) / 16 == 1;
  format = etc1s ? "ktx2:etc1s" : "ktx2:uastc";
  gpuBytes = 0;
  std::uint32_t w = le32(p + 20), h = le32(p + 24);
  for (std::uint32_t l = 0, n = std::max<std::uint32_t>(1, le32(p + 40)); l < n; ++l, w = std::max(1u, w / 2), h = std::max(1u, h / 2))
    gpuBytes += static_cast<std::uint64_t>((w + 3) / 4) * ((h + 3) / 4) * (opaque ? 8 : 16);
  return true;
}

}  // namespace zn::assets
