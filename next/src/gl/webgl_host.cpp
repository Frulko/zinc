// zinc:gl (ZN-562): the host rows of WebGL for compiled Zinc code (include/zn/runtime.h, isGlRow) served by the WebGL1 class, with no JS engine.
// zinc loads this from libzn_webgl on the first call (src/main.cpp); an AOT program links it from zn_gl. A context is a small integer, WebGL objects
// are their ids, a uniform location is an index into its context's table (plus one: 0 is null). Arrays arrive as the program's slots (8 bytes each,
// the bits of an f64); a GLArray comes with its element kind, and an output one is written back. The rows' C++ is generated from the table of
// tools/gen-zinc-gl into webgl_host_rows.inc.
#include <strings.h>

#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <vector>

#include "gl/webgl1.h"
#include "gl/webgl_ext.h"
#include "gl/webgl_js.h"
#include "zn/host.h"
#include "zn/runtime.h"

namespace {

using zn::Rt;
using zn::host::HostArg;
using namespace zn::gl;

enum Attr { kAlpha = 1, kDepth = 2, kStencil = 4, kPremultiplied = 8, kPreserve = 16 };   // getContextAttributes, as zinc:gl's WebGLContextAttributes packs them

struct Ctx {
  std::unique_ptr<WebGL1> gl;
  std::vector<UniformLoc> locs;
  WebGL1::Param param;       // the last query's value: zinc:gl reads it through the Param* rows
  WebGL1::Active active;     // the last getActiveUniform / getActiveAttrib / getTransformFeedbackVarying
  int w = 0, h = 0, version = 1, attributes = kAlpha | kDepth | kPremultiplied;
  bool lost = false, lostReported = false;

  bool make() {
    gl = std::make_unique<WebGL1>();
    std::string err;
    const bool ok = version == 2 ? (gl->create(Api::Gl33, w, h, err, 2) || gl->create(Api::Gles3, w, h, err, 2)) : (gl->create(Api::Gl33, w, h, err) || gl->create(Api::Gles2, w, h, err));
    if (!ok) { std::fprintf(stderr, "zinc:gl: %s\n", err.c_str()); return false; }
    gl->setAttributes(attributes & kDepth, attributes & kStencil, attributes & kAlpha);
    return true;
  }
  std::int64_t location(const UniformLoc& l) {
    if (!l.valid()) return 0;
    locs.push_back(l);
    return static_cast<std::int64_t>(locs.size());
  }
  bool enableExtension(const std::string& name) {
    for (const ExtDef& e : kExtensions)
      if ((e.webgl & (1u << (version - 1))) && strcasecmp(e.name, name.c_str()) == 0) return gl->enableExt(e.id);
    return false;
  }
  std::string supportedExtensions() const {
    std::string s;
    for (const ExtDef& e : kExtensions) if ((e.webgl & (1u << (version - 1))) && gl->extSupported(e.id)) s += std::string(e.name) + ' ';
    return s;
  }
  // WEBGL_lose_context, without the DOM events: a lost context does nothing until restoreContext, which gives a new one (its objects are gone)
  std::uint32_t lostError() { if (lostReported) return 0; lostReported = true; return 0x9242; }   // CONTEXT_LOST_WEBGL, once
  void lose() { if (lost) { gl->raise(0x0502); return; } lost = true; lostReported = false; }
  void restore() {
    if (!lost) { gl->raise(0x0502); return; }
    locs.clear();
    if (make()) lost = false;
  }
};
std::vector<std::unique_ptr<Ctx>> gCtx;   // context id - 1
Ctx* gCur = nullptr;
const PresentHooks* gHooks = nullptr;
std::string gStr;   // a string result lives here until the next call

Ctx* ctxOf(std::int64_t id) {
  if (id < 1 || id > static_cast<std::int64_t>(gCtx.size()) || !gCtx[id - 1]) return nullptr;
  Ctx* c = gCtx[id - 1].get();
  if (gCur != c) { c->gl->makeCurrent(); gCur = c; }   // several contexts live side by side: each call makes its own current
  return c;
}
const UniformLoc& loc(const Ctx& c, std::int64_t h) {
  static const UniformLoc none;
  return h >= 1 && h <= static_cast<std::int64_t>(c.locs.size()) ? c.locs[h - 1] : none;
}
double slot(const HostArg& a, std::uint32_t i) { double d; std::memcpy(&d, static_cast<const std::uint64_t*>(a.p) + i, 8); return d; }
std::uint32_t U(const HostArg& a) { return static_cast<std::uint32_t>(a.i); }
int I(const HostArg& a) { return static_cast<int>(a.i); }
float F(const HostArg& a) { return static_cast<float>(a.d); }
std::string S(const HostArg& a) { return std::string(static_cast<const char*>(a.p), a.n); }
void retStr(HostArg* r, std::string s) { gStr = std::move(s); r->p = gStr.data(); r->n = static_cast<std::uint32_t>(gStr.size()); }
std::vector<std::string> lines(const std::string& s) {   // a string[] joined with '\n'
  std::vector<std::string> out;
  if (s.empty()) return out;
  std::size_t at = 0;
  for (;;) { std::size_t e = s.find('\n', at); out.push_back(s.substr(at, e == std::string::npos ? std::string::npos : e - at)); if (e == std::string::npos) break; at = e + 1; }
  return out;
}
const std::vector<float>& floats(const HostArg& a) { static std::vector<float> v; v.resize(a.n); for (std::uint32_t i = 0; i < a.n; ++i) v[i] = static_cast<float>(slot(a, i)); return v; }
const std::vector<int>& ints(const HostArg& a) { static std::vector<int> v; v.resize(a.n); for (std::uint32_t i = 0; i < a.n; ++i) v[i] = static_cast<int>(slot(a, i)); return v; }
const std::vector<std::uint32_t>& uints(const HostArg& a) { static std::vector<std::uint32_t> v; v.resize(a.n); for (std::uint32_t i = 0; i < a.n; ++i) v[i] = static_cast<std::uint32_t>(static_cast<std::int64_t>(slot(a, i))); return v; }

// A GLArray's elements as bytes: kind 1 Int8, 2 Uint8, 3 Int16, 4 Uint16, 5 Int32, 6 Uint32, 7 Float32 (zinc:gl's typed array classes); 0 is null
struct Bytes { void* p = nullptr; std::size_t n = 0; bool null = true; int kind = 0; };
int elemSize(int kind) { return kind <= 2 ? 1 : kind <= 4 ? 2 : 4; }
std::vector<std::uint8_t> gIn, gOut;
template <class T> void put(std::uint8_t* dst, std::uint32_t i, T v) { std::memcpy(dst + i * sizeof(T), &v, sizeof(T)); }
Bytes bytesIn(const HostArg& data, const HostArg& kind) {
  Bytes b;
  b.kind = static_cast<int>(kind.i);
  if (b.kind < 1 || b.kind > 7) return b;
  b.null = false;
  b.n = static_cast<std::size_t>(data.n) * elemSize(b.kind);
  gIn.resize(b.n ? b.n : 1);
  for (std::uint32_t i = 0; i < data.n; ++i) {
    const double d = slot(data, i);
    switch (b.kind) {
      case 1: put<std::int8_t>(gIn.data(), i, static_cast<std::int8_t>(static_cast<std::int64_t>(d))); break;
      case 2: put<std::uint8_t>(gIn.data(), i, static_cast<std::uint8_t>(static_cast<std::int64_t>(d))); break;
      case 3: put<std::int16_t>(gIn.data(), i, static_cast<std::int16_t>(static_cast<std::int64_t>(d))); break;
      case 4: put<std::uint16_t>(gIn.data(), i, static_cast<std::uint16_t>(static_cast<std::int64_t>(d))); break;
      case 5: put<std::int32_t>(gIn.data(), i, static_cast<std::int32_t>(static_cast<std::int64_t>(d))); break;
      case 6: put<std::uint32_t>(gIn.data(), i, static_cast<std::uint32_t>(static_cast<std::int64_t>(d))); break;
      default: put<float>(gIn.data(), i, static_cast<float>(d)); break;
    }
  }
  b.p = gIn.data();
  return b;
}
Bytes bytesOut(const HostArg& data, const HostArg& kind) {   // room for the array's length, read back by bytesBack
  Bytes b;
  b.kind = static_cast<int>(kind.i) >= 1 && static_cast<int>(kind.i) <= 7 ? static_cast<int>(kind.i) : 2;
  b.null = false;
  b.n = static_cast<std::size_t>(data.n) * elemSize(b.kind);
  gOut.assign(b.n ? b.n : 1, 0);
  b.p = gOut.data();
  return b;
}
template <class T> double get(const std::uint8_t* src, std::uint32_t i) { T v; std::memcpy(&v, src + i * sizeof(T), sizeof(T)); return static_cast<double>(v); }
void bytesBack(const Bytes& b, const HostArg& data) {
  std::uint64_t* slots = const_cast<std::uint64_t*>(static_cast<const std::uint64_t*>(data.p));
  const std::uint8_t* src = static_cast<const std::uint8_t*>(b.p);
  for (std::uint32_t i = 0; i < data.n; ++i) {
    double d = 0;
    switch (b.kind) {
      case 1: d = get<std::int8_t>(src, i); break;
      case 2: d = get<std::uint8_t>(src, i); break;
      case 3: d = get<std::int16_t>(src, i); break;
      case 4: d = get<std::uint16_t>(src, i); break;
      case 5: d = get<std::int32_t>(src, i); break;
      case 6: d = get<std::uint32_t>(src, i); break;
      default: d = get<float>(src, i); break;
    }
    std::memcpy(slots + i, &d, 8);
  }
}

/** gl.present(image): the drawing buffer, rows flipped and without alpha, into the zinc:gfx image (resized to the canvas). */
void present(Ctx& c, int image) {
  if (!gHooks) return;
  const int w = c.gl->target().width(), h = c.gl->target().height();
  unsigned* dst = gHooks->pixels(image, w, h);
  if (!dst) return;
  const std::vector<std::uint8_t> px = c.gl->target().read();   // the driver call itself: the program's pack state and error flags stay as they are
  for (int y = 0; y < h; ++y) {
    const std::uint8_t* src = px.data() + static_cast<std::size_t>(h - 1 - y) * w * 4;
    for (int x = 0; x < w; ++x, src += 4) dst[static_cast<std::size_t>(y) * w + x] = (static_cast<unsigned>(src[0]) << 16) | (static_cast<unsigned>(src[1]) << 8) | src[2];
  }
  gHooks->done(image);
}

// Direct entries (zn::host::HostFast, ZN-562.03) for the scalar rows a frame calls most: the raw slots of the arguments (f64 bits, sign-extended
// integers), the result in a[0], without the letter decoding of the HostCall path. Rows with strings or arrays keep that path.
double D(std::uint64_t s) { double d; std::memcpy(&d, &s, 8); return d; }
float FD(std::uint64_t s) { return static_cast<float>(D(s)); }
Ctx* fastCtx(std::uint64_t s) { Ctx* c = ctxOf(static_cast<std::int64_t>(s)); return c && !c->lost ? c : nullptr; }
void fGetError(std::uint64_t* a) { Ctx* c = ctxOf(static_cast<std::int64_t>(a[0])); a[0] = !c ? 0 : c->lost ? c->lostError() : c->gl->getError(); }
void fUniform1i(std::uint64_t* a) { if (Ctx* c = fastCtx(a[0])) c->gl->uniform1i(loc(*c, static_cast<std::int64_t>(a[1])), static_cast<int>(a[2])); }
void fUniform1f(std::uint64_t* a) { if (Ctx* c = fastCtx(a[0])) c->gl->uniform1f(loc(*c, static_cast<std::int64_t>(a[1])), FD(a[2])); }
void fUniform3f(std::uint64_t* a) { if (Ctx* c = fastCtx(a[0])) c->gl->uniform3f(loc(*c, static_cast<std::int64_t>(a[1])), FD(a[2]), FD(a[3]), FD(a[4])); }
void fUniform4f(std::uint64_t* a) { if (Ctx* c = fastCtx(a[0])) c->gl->uniform4f(loc(*c, static_cast<std::int64_t>(a[1])), FD(a[2]), FD(a[3]), FD(a[4]), FD(a[5])); }
void fDrawArrays(std::uint64_t* a) { if (Ctx* c = fastCtx(a[0])) c->gl->drawArrays(static_cast<std::uint32_t>(a[1]), static_cast<int>(a[2]), static_cast<int>(a[3])); }
void fDrawElements(std::uint64_t* a) { if (Ctx* c = fastCtx(a[0])) c->gl->drawElements(static_cast<std::uint32_t>(a[1]), static_cast<int>(a[2]), static_cast<std::uint32_t>(a[3]), static_cast<std::int64_t>(a[4])); }

// What a lost context still answers (the rest does nothing)
bool lostAnswers(Rt id) {
  return id == Rt::HostGlGetError || id == Rt::HostGlIsContextLost || id == Rt::HostGlRestoreContext || id == Rt::HostGlLoseContext || id == Rt::HostGlDestroy ||
         id == Rt::HostGlGetContextAttributes || id == Rt::HostGlParamKind || id == Rt::HostGlActiveInfo;
}

}  // namespace

extern "C" __attribute__((visibility("default"))) void zn_webgl_host_hooks(const PresentHooks* hooks) { gHooks = hooks; }

extern "C" __attribute__((visibility("default"))) zn::host::HostFast zn_webgl_fast(int row) {
  switch (static_cast<Rt>(row)) {
    case Rt::HostGlGetError: return fGetError;
    case Rt::HostGlUniform1i: return fUniform1i;
    case Rt::HostGlUniform1f: return fUniform1f;
    case Rt::HostGlUniform3f: return fUniform3f;
    case Rt::HostGlUniform4f: return fUniform4f;
    case Rt::HostGlDrawArrays: return fDrawArrays;
    case Rt::HostGlDrawElements: return fDrawElements;
    default: return nullptr;
  }
}

extern "C" __attribute__((visibility("default"))) void zn_webgl_host(int row, const HostArg* a, HostArg* r) {
  const Rt id = static_cast<Rt>(row);
  r->i = 0;
  r->d = 0;
  if (id == Rt::HostGlCreate) {   // (width, height, version, attributes): 0 when no context of that version can be made
    auto c = std::make_unique<Ctx>();
    c->w = I(a[0]); c->h = I(a[1]); c->version = I(a[2]) == 2 ? 2 : 1; c->attributes = I(a[3]);
    if (!c->make()) return;
    gCtx.push_back(std::move(c));
    gCur = gCtx.back().get();
    r->i = static_cast<std::int64_t>(gCtx.size());
    return;
  }
  Ctx* c = ctxOf(a[0].i);
  const bool str = zn::rtRet(zn::rtInfo(id)) == 's';
  if (!c || (c->lost && !lostAnswers(id))) { if (str) retStr(r, ""); return; }   // an unknown or destroyed context, or a lost one, does nothing
  WebGL1& gl = *c->gl;
  switch (id) {
#include "gl/webgl_host_rows.inc"
    default: break;
  }
}
