// three (Zinc) native side: glTF 2.0 reader (.gltf JSON + external or data: buffers, .glb), accessor decoding into
// flat arrays, PNG/JPEG decoding (stb_image, public domain) into runtime images. Portable C++.
// The JSON DOM is the one of plugins/lottie (copied): the document text stays alive while the handle is open.
#include "zinc_native_three.h"
#include "zrt_raster.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

#define STB_IMAGE_IMPLEMENTATION
#define STB_IMAGE_STATIC
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_NO_STDIO
#define STBI_NO_LINEAR
#define STBI_NO_HDR
// hostile images (glTF from anywhere): stb's invariant checks stay on (a failed one stops the program instead of
// corrupting memory), and no image is larger than a runtime image may be (raster.cpp: 16384 per side)
#define STBI_ASSERT(x) ((x) ? (void)0 : abort())
#define STBI_MAX_DIMENSIONS 16384
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#include "stb_image.h"
#pragma GCC diagnostic pop

extern "C" __attribute__((weak)) int32_t hal_pixel_scale(void);

using namespace zrt;
namespace {
// `number` in the spec is the program's number kind
template<class C, class A, class B, class D> D arg2(void (C::*)(A, B, D));
typedef decltype(arg2(&NativeThree::nodeTransform)) Nums;
typedef zrt::Array<int32_t> Ints;
typedef zrt::Array<uint8_t> Bytes;

template<class T> struct Vec {
  T* p = nullptr; uint32_t n = 0, cap = 0;
  void reserve(uint32_t want) {
    if (want <= cap) return;
    uint32_t c = cap ? cap * 2 : 16;
    while (c < want) c *= 2;
    T* q = (T*)malloc((size_t)c * sizeof(T));
    if (n) memcpy(q, p, (size_t)n * sizeof(T));
    free(p); p = q; cap = c;
  }
  void push(const T& v) { if (n == cap) reserve(n + 1); p[n++] = v; }
  T& operator[](uint32_t i) { return p[i]; }
  const T& operator[](uint32_t i) const { return p[i]; }
  void release() { free(p); p = nullptr; n = cap = 0; }
};

// ---------------------------------------------------------------- JSON DOM (from plugins/lottie)
enum { JNULL, JBOOL, JNUM, JSTR, JARR, JOBJ };
struct JV {
  uint8_t t; uint32_t cnt;
  int32_t first, next;
  const char* k; uint32_t kl;
  const char* s; uint32_t sl;
  double num;
};
// JSON numbers are untrusted doubles: out-of-range double -> int conversions are UB, this one saturates (NaN: 0)
static inline int32_t i32(double v) { return v >= -2147483648.0 && v < 2147483648.0 ? (int32_t)v : v > 0 ? 2147483647 : v < 0 ? -2147483647 - 1 : 0; }
struct Json {
  Vec<JV> v;
  const char *p, *end;
  bool bad = false;
  void ws() { while (p < end && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) p++; }
  bool str(const char** s, uint32_t* n) {
    if (p >= end || *p != '"') return false;
    const char* b = ++p;
    while (p < end && *p != '"') p += *p == '\\' ? 2 : 1;
    if (p >= end) return false;
    *s = b; *n = (uint32_t)(p - b); p++;
    return true;
  }
  double number() {
    char buf[40]; uint32_t n = 0;
    while (p < end && n < sizeof buf - 1 && (strchr("+-.eE", *p) || (*p >= '0' && *p <= '9'))) buf[n++] = *p++;
    buf[n] = 0;
    return strtod(buf, nullptr);
  }
  int32_t value(int depth) {
    ws();
    if (p >= end || depth > 64) { bad = true; return -1; }
    int32_t id = (int32_t)v.n;
    JV x; memset(&x, 0, sizeof x); x.first = x.next = -1;
    v.push(x);
    char c = *p;
    if (c == '{' || c == '[') {
      bool obj = c == '{';
      v[id].t = obj ? JOBJ : JARR;
      p++; ws();
      int32_t last = -1;
      if (p < end && *p == (obj ? '}' : ']')) { p++; return id; }
      while (!bad) {
        const char* k = nullptr; uint32_t kl = 0;
        if (obj) { ws(); if (!str(&k, &kl)) { bad = true; break; } ws(); if (p >= end || *p != ':') { bad = true; break; } p++; }
        int32_t ch = value(depth + 1);
        if (ch < 0) { bad = true; break; }
        v[ch].k = k; v[ch].kl = kl;
        if (last < 0) v[id].first = ch; else v[last].next = ch;
        last = ch; v[id].cnt++;
        ws();
        if (p < end && *p == ',') { p++; continue; }
        if (p < end && *p == (obj ? '}' : ']')) { p++; break; }
        bad = true;
      }
    } else if (c == '"') { v[id].t = JSTR; if (!str(&v[id].s, &v[id].sl)) bad = true; }
    else if (c == 't' || c == 'f') { v[id].t = JBOOL; v[id].num = c == 't'; p += c == 't' ? 4 : 5; }
    else if (c == 'n') { v[id].t = JNULL; p += 4; }
    else if (c == '-' || (c >= '0' && c <= '9')) { v[id].t = JNUM; v[id].num = number(); }
    else bad = true;
    return id;
  }
  int32_t get(int32_t o, const char* key) const {
    if (o < 0 || v[o].t != JOBJ) return -1;
    uint32_t kl = (uint32_t)strlen(key);
    for (int32_t c = v[o].first; c >= 0; c = v[c].next) if (v[c].kl == kl && !memcmp(v[c].k, key, kl)) return c;
    return -1;
  }
  int32_t at(int32_t a, int32_t i) const {
    if (a < 0 || v[a].t != JARR || i < 0) return -1;
    int32_t c = v[a].first;
    while (c >= 0 && i--) c = v[c].next;
    return c;
  }
  int32_t count(int32_t a) const { return a >= 0 && v[a].t == JARR ? (int32_t)v[a].cnt : 0; }
  double num(int32_t o, const char* key, double def) const {
    int32_t c = get(o, key);
    return c >= 0 && (v[c].t == JNUM || v[c].t == JBOOL) ? v[c].num : def;
  }
  bool streq(int32_t c, const char* s) const { return c >= 0 && v[c].t == JSTR && v[c].sl == strlen(s) && !memcmp(v[c].s, s, v[c].sl); }
};

/** JSON string value with escapes resolved (\uXXXX to UTF-8, surrogate pairs included). */
static uint32_t hex4(const char* s) {
  uint32_t v = 0;
  for (int i = 0; i < 4; i++) { char c = s[i]; v = v << 4 | (uint32_t)(c >= 'a' ? c - 'a' + 10 : c >= 'A' ? c - 'A' + 10 : c - '0'); }
  return v;
}
static zrt::String jstr(const Json& J, int32_t c) {
  if (c < 0 || J.v[c].t != JSTR) return zrt::String::from("", 0);
  const char* s = J.v[c].s; uint32_t n = J.v[c].sl;
  char* o = (char*)malloc(n + 1); uint32_t k = 0;
  for (uint32_t i = 0; i < n; i++) {
    if (s[i] != '\\' || i + 1 >= n) { o[k++] = s[i]; continue; }
    char e = s[++i];
    if (e == 'n') o[k++] = '\n'; else if (e == 't') o[k++] = '\t'; else if (e == 'r') o[k++] = '\r';
    else if (e == 'b') o[k++] = '\b'; else if (e == 'f') o[k++] = '\f';
    else if (e == 'u' && i + 4 < n) {
      uint32_t cp = hex4(s + i + 1);
      i += 4;
      if (cp >= 0xD800 && cp < 0xDC00 && i + 6 < n && s[i + 1] == '\\' && s[i + 2] == 'u') {
        uint32_t lo = hex4(s + i + 3);
        cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); i += 6;
      }
      if (cp < 0x80) o[k++] = (char)cp;
      else if (cp < 0x800) { o[k++] = (char)(0xC0 | cp >> 6); o[k++] = (char)(0x80 | (cp & 63)); }
      else if (cp < 0x10000) { o[k++] = (char)(0xE0 | cp >> 12); o[k++] = (char)(0x80 | (cp >> 6 & 63)); o[k++] = (char)(0x80 | (cp & 63)); }
      else { o[k++] = (char)(0xF0 | cp >> 18); o[k++] = (char)(0x80 | (cp >> 12 & 63)); o[k++] = (char)(0x80 | (cp >> 6 & 63)); o[k++] = (char)(0x80 | (cp & 63)); }
    } else o[k++] = e;
  }
  zrt::String r = zrt::String::from(o, k);
  free(o);
  return r;
}

static int32_t b64(char c) {
  if (c >= 'A' && c <= 'Z') return c - 'A';
  if (c >= 'a' && c <= 'z') return c - 'a' + 26;
  if (c >= '0' && c <= '9') return c - '0' + 52;
  if (c == '+' || c == '-') return 62;
  if (c == '/' || c == '_') return 63;
  return -1;
}
/** Decodes a data: URI with a base64 payload into a malloc'd buffer; false when it is not one. */
static bool data_uri(const char* s, uint32_t n, uint8_t** out, uint32_t* len) {
  if (n < 5 || memcmp(s, "data:", 5)) return false;
  const char* comma = (const char*)memchr(s, ',', n);
  if (!comma) return false;
  const char* p = comma + 1; uint32_t m = (uint32_t)(s + n - p);
  uint8_t* b = (uint8_t*)malloc(m * 3 / 4 + 3); uint32_t k = 0, acc = 0; int bits = 0;
  for (uint32_t i = 0; i < m; i++) {
    int32_t v = b64(p[i]);
    if (v < 0) continue;
    acc = acc << 6 | (uint32_t)v; bits += 6;
    if (bits >= 8) { bits -= 8; b[k++] = (uint8_t)(acc >> bits); }
  }
  *out = b; *len = k;
  return true;
}

// ---------------------------------------------------------------- documents
struct Buf { uint8_t* p; uint32_t n; bool owned; };
struct Doc {
  uint8_t* data; uint32_t len;  // the file (JSON text and GLB binary chunk point into it)
  Json J; int32_t root;
  Vec<Buf> bufs;
};
static const int MAX_DOCS = 16;
static Doc* docs[MAX_DOCS];
static char err[160];

static Doc* doc(int32_t h) { return h >= 0 && h < MAX_DOCS ? docs[h] : nullptr; }
static int32_t arr(const Doc& d, const char* key) { return d.J.get(d.root, key); }
static int32_t item(const Doc& d, const char* key, int32_t i) { return d.J.at(arr(d, key), i); }
static void free_doc(Doc* d) {
  for (uint32_t i = 0; i < d->bufs.n; i++) if (d->bufs[i].owned) free(d->bufs[i].p);
  d->bufs.release(); d->J.v.release(); free(d->data); free(d);
}
static uint32_t u32le(const uint8_t* p) { return (uint32_t)p[0] | (uint32_t)p[1] << 8 | (uint32_t)p[2] << 16 | (uint32_t)p[3] << 24; }

static int32_t parse_doc(uint8_t* data, uint32_t len) {
  int32_t slot = -1;
  for (int32_t i = 0; i < MAX_DOCS; i++) if (!docs[i]) { slot = i; break; }
  if (slot < 0) { snprintf(err, sizeof err, "too many open glTF documents"); free(data); return -1; }
  Doc* d = (Doc*)calloc(1, sizeof(Doc));
  d->data = data; d->len = len;
  const char* text = (const char*)data; uint32_t tlen = len;
  Buf bin = {nullptr, 0, false};
  if (len >= 20 && !memcmp(data, "glTF", 4)) {  // GLB: header, JSON chunk, optional BIN chunk
    if (u32le(data + 4) != 2) { snprintf(err, sizeof err, "glb version %u is not supported", u32le(data + 4)); free_doc(d); return -1; }
    uint32_t total = u32le(data + 8) < len ? u32le(data + 8) : len, off = 12;
    text = nullptr;
    while (off + 8 <= total) {
      uint32_t clen = u32le(data + off), type = u32le(data + off + 4);
      if (clen > total - off - 8) break;  // off + 8 + clen wrapped around in 32 bits
      if (type == 0x4E4F534A && !text) { text = (const char*)data + off + 8; tlen = clen; }
      else if (type == 0x004E4942 && !bin.p) { bin.p = data + off + 8; bin.n = clen; }
      off += 8 + ((clen + 3) & ~3u);
    }
    if (!text) { snprintf(err, sizeof err, "glb without a JSON chunk"); free_doc(d); return -1; }
  }
  d->J.p = text; d->J.end = text + tlen;
  if (tlen >= 3 && (uint8_t)text[0] == 0xEF && (uint8_t)text[1] == 0xBB && (uint8_t)text[2] == 0xBF) d->J.p += 3;  // BOM
  d->root = d->J.value(0);
  if (d->J.bad || d->root < 0 || d->J.v[d->root].t != JOBJ) { snprintf(err, sizeof err, "invalid glTF JSON"); free_doc(d); return -1; }
  int32_t asset = d->J.get(d->root, "asset"), ver = d->J.get(asset, "version");
  if (ver < 0 || d->J.v[ver].t != JSTR || d->J.v[ver].sl < 1 || d->J.v[ver].s[0] != '2') { snprintf(err, sizeof err, "not a glTF 2.0 document"); free_doc(d); return -1; }
  int32_t req = d->J.get(d->root, "extensionsRequired");
  for (int32_t c = req >= 0 ? d->J.v[req].first : -1; c >= 0; c = d->J.v[c].next) {
    if (d->J.streq(c, "KHR_materials_unlit") || d->J.streq(c, "KHR_texture_transform")) continue;
    snprintf(err, sizeof err, "required extension %.*s is not supported", (int)d->J.v[c].sl, d->J.v[c].s); free_doc(d); return -1;
  }
  int32_t bs = arr(*d, "buffers");
  for (int32_t i = 0; i < d->J.count(bs); i++) {
    int32_t b = d->J.at(bs, i), uri = d->J.get(b, "uri");
    Buf x = {nullptr, 0, false};
    if (uri < 0) x = bin;  // the GLB binary chunk
    else if (data_uri(d->J.v[uri].s, d->J.v[uri].sl, &x.p, &x.n)) x.owned = true;
    d->bufs.push(x);
  }
  docs[slot] = d;
  return slot;
}

// accessors: element (i, component c) as a double; normalized integers map to [0, 1] or [-1, 1]
struct Acc { const uint8_t* p; int32_t count, comps, ctype, stride; bool norm; };
static int32_t comps_of(const Json& J, int32_t t) {
  static const char* names[] = {"SCALAR", "VEC2", "VEC3", "VEC4", "MAT2", "MAT3", "MAT4"};
  static const int32_t n[] = {1, 2, 3, 4, 4, 9, 16};
  for (int i = 0; i < 7; i++) if (J.streq(t, names[i])) return n[i];
  return 0;
}
static int32_t csize(int32_t ct) { return ct == 5120 || ct == 5121 ? 1 : ct == 5122 || ct == 5123 ? 2 : 4; }
static bool accessor(const Doc& d, int32_t a, Acc* out) {
  const Json& J = d.J;
  int32_t o = item(d, "accessors", a);
  if (o < 0) return false;
  out->count = (int32_t)i32(J.num(o, "count", 0));
  out->ctype = (int32_t)i32(J.num(o, "componentType", 5126));
  out->comps = comps_of(J, J.get(o, "type"));
  out->norm = J.num(o, "normalized", 0) != 0;
  int32_t bv = (int32_t)i32(J.num(o, "bufferView", -1)), v = item(d, "bufferViews", bv);
  if (v < 0 || !out->comps) return false;  // ponytail: sparse accessors without a buffer view are not supported
  int32_t b = (int32_t)i32(J.num(v, "buffer", -1));
  if (b < 0 || b >= (int32_t)d.bufs.n || !d.bufs[(uint32_t)b].p) return false;
  const Buf& buf = d.bufs[(uint32_t)b];
  uint32_t off = (uint32_t)i32(J.num(v, "byteOffset", 0)) + (uint32_t)i32(J.num(o, "byteOffset", 0));
  int32_t elem = csize(out->ctype) * out->comps;
  out->stride = (int32_t)i32(J.num(v, "byteStride", 0));
  if (out->stride <= 0) out->stride = elem;
  if (out->count > 0 && (uint64_t)off + (uint64_t)(out->count - 1) * (uint32_t)out->stride + (uint32_t)elem > buf.n) return false;
  out->p = buf.p + off;
  return true;
}
static double read(const Acc& a, int32_t i, int32_t c) {
  const uint8_t* p = a.p + (size_t)i * (size_t)a.stride + (size_t)c * (size_t)csize(a.ctype);
  switch (a.ctype) {
    case 5126: { float f; memcpy(&f, p, 4); return f; }
    case 5121: return a.norm ? *p / 255.0 : *p;
    case 5120: { int8_t v = (int8_t)*p; return a.norm ? (v / 127.0 < -1 ? -1 : v / 127.0) : v; }
    case 5123: { uint16_t v; memcpy(&v, p, 2); return a.norm ? v / 65535.0 : v; }
    case 5122: { int16_t v; memcpy(&v, p, 2); return a.norm ? (v / 32767.0 < -1 ? -1 : v / 32767.0) : v; }
    case 5125: { uint32_t v; memcpy(&v, p, 4); return v; }
  }
  return 0;
}
/** Pushes `want` components per element of accessor `a` (missing components: 0), false when unreadable. */
static bool push_attr(const Doc& d, int32_t a, int32_t want, int32_t count, Nums out) {
  Acc x;
  if (a < 0 || !accessor(d, a, &x) || x.count < count) return false;
  for (int32_t i = 0; i < count; i++) for (int32_t c = 0; c < want; c++) out.push(c < x.comps ? read(x, i, c) : 0);
  return true;
}

static int32_t decode_bytes(const uint8_t* p, uint32_t n) {
  int w, h, comp;
  // a few hundred bytes can declare a 16384 x 16384 image: at most 2^24 pixels (a 4096 x 4096 texture) are decoded
  if (!stbi_info_from_memory(p, (int)n, &w, &h, &comp)) { snprintf(err, sizeof err, "image: %s", stbi_failure_reason()); return -1; }
  if ((uint64_t)w * (uint64_t)h > (1u << 24)) { snprintf(err, sizeof err, "image: %dx%d is too large", w, h); return -1; }
  uint8_t* rgba = stbi_load_from_memory(p, (int)n, &w, &h, &comp, 4);
  if (!rgba) { snprintf(err, sizeof err, "image: %s", stbi_failure_reason()); return -1; }
  int32_t id = raster::dyn_create(w, h);
  uint32_t* px = raster::dyn_pixels(id);
  if (px) for (int32_t i = 0; i < w * h; i++) px[i] = (uint32_t)rgba[i * 4] << 16 | (uint32_t)rgba[i * 4 + 1] << 8 | rgba[i * 4 + 2];
  stbi_image_free(rgba);
  if (id >= 0) raster::dyn_update(id, nullptr, 0);
  return id;
}
static uint8_t* copy_bytes(const Bytes& b, uint32_t* n) {
  *n = (uint32_t)b.length();
  uint8_t* p = (uint8_t*)malloc(*n ? *n : 1);
  for (uint32_t i = 0; i < *n; i++) p[i] = b.get((int32_t)i);
  return p;
}

struct Impl : NativeThree {
  int32_t parse(Bytes data) override { uint32_t n; uint8_t* p = copy_bytes(data, &n); return parse_doc(p, n); }
  zrt::String error() override { return zrt::String::from(err, (uint32_t)strlen(err)); }
  void free(int32_t h) override { if (Doc* d = doc(h)) { free_doc(d); docs[h] = nullptr; } }
  zrt::String assetInfo(int32_t h) override {
    Doc* d = doc(h);
    if (!d) return zrt::String::from("", 0);
    int32_t a = d->J.get(d->root, "asset");
    return jstr(d->J, d->J.get(a, "generator"));
  }
  int32_t bufferCount(int32_t h) override { Doc* d = doc(h); return d ? (int32_t)d->bufs.n : 0; }
  zrt::String bufferUri(int32_t h, int32_t i) override {
    Doc* d = doc(h);
    if (!d || i < 0 || i >= (int32_t)d->bufs.n || d->bufs[(uint32_t)i].p) return zrt::String::from("", 0);
    return jstr(d->J, d->J.get(item(*d, "buffers", i), "uri"));
  }
  void setBuffer(int32_t h, int32_t i, Bytes data) override {
    Doc* d = doc(h);
    if (!d || i < 0 || i >= (int32_t)d->bufs.n) return;
    Buf& b = d->bufs[(uint32_t)i];
    if (b.owned) ::free(b.p);
    b.p = copy_bytes(data, &b.n); b.owned = true;
  }
  int32_t imageCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "images")) : 0; }
  zrt::String imageUri(int32_t h, int32_t i) override {
    Doc* d = doc(h);
    if (!d) return zrt::String::from("", 0);
    int32_t u = d->J.get(item(*d, "images", i), "uri");
    if (u < 0 || (d->J.v[u].sl >= 5 && !memcmp(d->J.v[u].s, "data:", 5))) return zrt::String::from("", 0);
    return jstr(d->J, u);
  }
  int32_t imageDecode(int32_t h, int32_t i) override {
    Doc* d = doc(h);
    if (!d) return -1;
    int32_t im = item(*d, "images", i), u = d->J.get(im, "uri");
    if (u >= 0) {
      uint8_t* p; uint32_t n;
      if (!data_uri(d->J.v[u].s, d->J.v[u].sl, &p, &n)) { snprintf(err, sizeof err, "image %d is an external file", i); return -1; }
      int32_t id = decode_bytes(p, n);
      ::free(p);
      return id;
    }
    int32_t v = item(*d, "bufferViews", (int32_t)i32(d->J.num(im, "bufferView", -1)));
    int32_t b = (int32_t)i32(d->J.num(v, "buffer", -1));
    if (v < 0 || b < 0 || b >= (int32_t)d->bufs.n || !d->bufs[(uint32_t)b].p) { snprintf(err, sizeof err, "image %d has no data", i); return -1; }
    uint32_t off = (uint32_t)i32(d->J.num(v, "byteOffset", 0)), n = (uint32_t)i32(d->J.num(v, "byteLength", 0));
    if ((uint64_t)off + n > d->bufs[(uint32_t)b].n) return -1;
    return decode_bytes(d->bufs[(uint32_t)b].p + off, n);
  }
  int32_t textureSource(int32_t h, int32_t t) override {
    Doc* d = doc(h);
    return d ? i32(d->J.num(item(*d, "textures", t), "source", -1)) : -1;
  }
  int32_t sceneCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "scenes")) : 0; }
  int32_t defaultScene(int32_t h) override { Doc* d = doc(h); return d ? (int32_t)i32(d->J.num(d->root, "scene", 0)) : -1; }
  zrt::String sceneName(int32_t h, int32_t s) override { Doc* d = doc(h); return d ? jstr(d->J, d->J.get(item(*d, "scenes", s), "name")) : zrt::String::from("", 0); }
  void sceneNodes(int32_t h, int32_t s, Ints out) override { if (Doc* d = doc(h)) ints(*d, d->J.get(item(*d, "scenes", s), "nodes"), out); }
  int32_t nodeCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "nodes")) : 0; }
  zrt::String nodeName(int32_t h, int32_t n) override { Doc* d = doc(h); return d ? jstr(d->J, d->J.get(item(*d, "nodes", n), "name")) : zrt::String::from("", 0); }
  int32_t nodeMesh(int32_t h, int32_t n) override { Doc* d = doc(h); return d ? i32(d->J.num(item(*d, "nodes", n), "mesh", -1)) : -1; }
  void nodeChildren(int32_t h, int32_t n, Ints out) override { if (Doc* d = doc(h)) ints(*d, d->J.get(item(*d, "nodes", n), "children"), out); }
  void nodeTransform(int32_t h, int32_t n, Nums out) override {
    Doc* d = doc(h);
    if (!d) return;
    const Json& J = d->J;
    int32_t o = item(*d, "nodes", n), m = J.get(o, "matrix");
    if (J.count(m) == 16) { for (int32_t i = 0; i < 16; i++) out.push(J.v[J.at(m, i)].num); return; }
    static const double def[10] = {0, 0, 0, 0, 0, 0, 1, 1, 1, 1};
    const char* keys[3] = {"translation", "rotation", "scale"};
    int32_t k = 0;
    for (int32_t f = 0; f < 3; f++) {
      int32_t a = J.get(o, keys[f]), cnt = f == 1 ? 4 : 3;
      for (int32_t i = 0; i < cnt; i++, k++) { int32_t c = J.at(a, i); out.push(c >= 0 && J.v[c].t == JNUM ? J.v[c].num : def[k]); }
    }
  }
  int32_t meshCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "meshes")) : 0; }
  zrt::String meshName(int32_t h, int32_t m) override { Doc* d = doc(h); return d ? jstr(d->J, d->J.get(item(*d, "meshes", m), "name")) : zrt::String::from("", 0); }
  int32_t primitiveCount(int32_t h, int32_t m) override { Doc* d = doc(h); return d ? d->J.count(d->J.get(item(*d, "meshes", m), "primitives")) : 0; }
  int32_t primitive(int32_t h, int32_t m, int32_t p, Nums pos, Nums nrm, Nums uv, Nums col, Ints idx) override {
    Doc* d = doc(h);
    if (!d) return -2;
    const Json& J = d->J;
    int32_t pr = J.at(J.get(item(*d, "meshes", m), "primitives"), p), at = J.get(pr, "attributes");
    int32_t mode = (int32_t)i32(J.num(pr, "mode", 4));
    if (mode < 4 || mode > 6) { snprintf(err, sizeof err, "mesh %d primitive %d: mode %d (points or lines) is not supported", m, p, mode); return -2; }
    if (J.get(J.get(pr, "extensions"), "KHR_draco_mesh_compression") >= 0) { snprintf(err, sizeof err, "Draco compressed meshes are not supported"); return -2; }
    Acc pa;
    if (!accessor(*d, (int32_t)i32(J.num(at, "POSITION", -1)), &pa)) { snprintf(err, sizeof err, "mesh %d primitive %d: no readable POSITION", m, p); return -2; }
    const int32_t n = pa.count;
    push_attr(*d, (int32_t)i32(J.num(at, "POSITION", -1)), 3, n, pos);
    push_attr(*d, (int32_t)i32(J.num(at, "NORMAL", -1)), 3, n, nrm);
    push_attr(*d, (int32_t)i32(J.num(at, "TEXCOORD_0", -1)), 2, n, uv);
    push_attr(*d, (int32_t)i32(J.num(at, "COLOR_0", -1)), 3, n, col);
    Vec<int32_t> ix;
    Acc ia;
    if (accessor(*d, (int32_t)i32(J.num(pr, "indices", -1)), &ia)) for (int32_t i = 0; i < ia.count; i++) ix.push(i32(read(ia, i, 0)));
    else for (int32_t i = 0; i < n; i++) ix.push(i);
    int32_t tris = 0;
    for (uint32_t i = 0; i + 2 < ix.n; i += mode == 4 ? 3 : 1) {
      int32_t a = ix[i], b = ix[i + 1], c = ix[i + 2];
      if (mode == 5 && (i & 1)) { int32_t t = a; a = b; b = t; }      // strip: keep the winding
      if (mode == 6) { a = ix[0]; b = ix[i + 1]; c = ix[i + 2]; }       // fan
      if (a < 0 || b < 0 || c < 0 || a >= n || b >= n || c >= n) continue;
      idx.push(a); idx.push(b); idx.push(c); tris++;
    }
    ix.release();
    return tris ? (int32_t)i32(J.num(pr, "material", -1)) : -2;
  }
  int32_t materialCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "materials")) : 0; }
  zrt::String materialName(int32_t h, int32_t m) override { Doc* d = doc(h); return d ? jstr(d->J, d->J.get(item(*d, "materials", m), "name")) : zrt::String::from("", 0); }
  void materialColor(int32_t h, int32_t m, Nums out) override {
    Doc* d = doc(h);
    int32_t f = d ? d->J.get(d->J.get(item(*d, "materials", m), "pbrMetallicRoughness"), "baseColorFactor") : -1;
    for (int32_t i = 0; i < 4; i++) { int32_t c = d ? d->J.at(f, i) : -1; out.push(c >= 0 && d->J.v[c].t == JNUM ? d->J.v[c].num : 1); }
  }
  int32_t materialTexture(int32_t h, int32_t m) override {
    Doc* d = doc(h);
    if (!d) return -1;
    return i32(d->J.num(d->J.get(d->J.get(item(*d, "materials", m), "pbrMetallicRoughness"), "baseColorTexture"), "index", -1));
  }
  int32_t materialFlags(int32_t h, int32_t m) override {
    Doc* d = doc(h);
    if (!d) return 0;
    const Json& J = d->J;
    int32_t o = item(*d, "materials", m), am = J.get(o, "alphaMode");
    return (J.num(o, "doubleSided", 0) != 0 ? 1 : 0) | (J.get(J.get(o, "extensions"), "KHR_materials_unlit") >= 0 ? 2 : 0) |
           (J.streq(am, "BLEND") ? 4 : 0) | (J.streq(am, "MASK") ? 8 : 0);
  }
  int32_t animationCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "animations")) : 0; }
  int32_t skinCount(int32_t h) override { Doc* d = doc(h); return d ? d->J.count(arr(*d, "skins")) : 0; }
  int32_t decode(Bytes data) override {
    uint32_t n; uint8_t* p = copy_bytes(data, &n);
    int32_t id = decode_bytes(p, n);
    ::free(p);
    return id;
  }
  bool readFile(zrt::String path, Bytes out) override {
    char name[1024];
    uint32_t n = path.bytes() < sizeof name - 1 ? path.bytes() : (uint32_t)sizeof name - 1;
    memcpy(name, path.ptr(), n); name[n] = 0;
    FILE* f = fopen(name, "rb");
    if (!f) return false;
    uint8_t buf[16384];
    size_t r;
    while ((r = fread(buf, 1, sizeof buf, f)) > 0) for (size_t i = 0; i < r; i++) out.push(buf[i]);
    fclose(f);
    return true;
  }
  int32_t pixelRatio() override { return hal_pixel_scale ? hal_pixel_scale() : 1; }

  static void ints(const Doc& d, int32_t a, Ints out) {
    for (int32_t c = a >= 0 && d.J.v[a].t == JARR ? d.J.v[a].first : -1; c >= 0; c = d.J.v[c].next) out.push(i32(d.J.v[c].num));
  }
};
}  // namespace

NativeThree* zinc_create_Three() {
  static Impl e;
  e.rc = zrt::IMMORTAL;
  return &e;
}
