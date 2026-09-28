// zinc:map engine: Mapbox Vector Tile decoding, a Mapbox/MapLibre style subset, a tile image pyramid rendered with the
// shared rasterizer (render once into runtime images, then panning is blits), screen-space labels with collision.
// Memory is bounded: an LRU of decoded tile images (ZP_MAP_TILES) and an LRU of raw tile bytes (ZP_MAP_DATAMB).
// Tiles are 512 px at their zoom, like MapLibre, so style zoom stops mean the same thing. See docs/plugins/map.md.
#include "zinc_native_mapengine.h"
#include "zrt_raster.h"
#include "hal.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdio.h>

#ifndef ZP_MAP_TILES
#define ZP_MAP_TILES 24        // cached tile images (1 MiB each)
#endif
#ifndef ZP_MAP_DATAMB
#define ZP_MAP_DATAMB 16      // raw vector tile bytes kept
#endif
#ifndef ZP_MAP_BUDGETMS
#define ZP_MAP_BUDGETMS 12    // tile rendering per frame (at least one tile)
#endif

using namespace zrt;
namespace {

const int TILE = 512;

template<class T> struct Vec {  // POD only
  T* p = nullptr; uint32_t n = 0, cap = 0;
  void reserve(uint32_t c) { if (c <= cap) return; uint32_t k = cap ? cap : 16; while (k < c) k *= 2; p = (T*)realloc(p, (size_t)k * sizeof(T)); cap = k; }
  void push(const T& v) { if (n == cap) reserve(n + 1); p[n++] = v; }
  T& operator[](uint32_t i) const { return p[i]; }
  void release() { free(p); p = nullptr; n = cap = 0; }
};

// ---------------------------------------------------------------- JSON (styles)
enum { JNULL, JBOOL, JNUM, JSTR, JARR, JOBJ };
struct J { uint8_t t; uint32_t n; double num; const char* s; J* kids; const char** keys; };
struct JP { const char* p; char* out; };
static void ws(JP& P) { while (*P.p == ' ' || *P.p == '\n' || *P.p == '\r' || *P.p == '\t') P.p++; }
static const char* jstring(JP& P) {
  P.p++;
  char* start = P.out;
  while (*P.p && *P.p != '"') {
    char c = *P.p++;
    if (c == '\\' && *P.p) {
      c = *P.p++;
      if (c == 'n') c = '\n'; else if (c == 't') c = '\t'; else if (c == 'r') c = '\r'; else if (c == 'b') c = '\b'; else if (c == 'f') c = '\f';
      else if (c == 'u') {
        char h[5] = {0}; for (int i = 0; i < 4 && *P.p; i++) h[i] = *P.p++;
        uint32_t cp = (uint32_t)strtoul(h, nullptr, 16);
        if (cp < 0x80) *P.out++ = (char)cp;
        else if (cp < 0x800) { *P.out++ = (char)(0xC0 | (cp >> 6)); *P.out++ = (char)(0x80 | (cp & 63)); }
        else { *P.out++ = (char)(0xE0 | (cp >> 12)); *P.out++ = (char)(0x80 | ((cp >> 6) & 63)); *P.out++ = (char)(0x80 | (cp & 63)); }
        continue;
      }
    }
    *P.out++ = c;
  }
  if (*P.p) P.p++;
  *P.out++ = 0;
  return start;
}
static bool jparse(JP& P, J& v) {
  ws(P);
  memset(&v, 0, sizeof v);
  char c = *P.p;
  if (c == '{' || c == '[') {
    bool obj = c == '{';
    char close = obj ? '}' : ']';
    P.p++;
    Vec<J> kids; Vec<const char*> keys;
    ws(P);
    if (*P.p == close) P.p++;
    else for (;;) {
      if (obj) { ws(P); if (*P.p != '"') return false; keys.push(jstring(P)); ws(P); if (*P.p++ != ':') return false; }
      J k;
      if (!jparse(P, k)) return false;
      kids.push(k);
      ws(P);
      if (*P.p == ',') { P.p++; continue; }
      if (*P.p++ == close) break;
      return false;
    }
    v.t = obj ? JOBJ : JARR; v.n = kids.n; v.kids = kids.p; v.keys = keys.p;
    return true;
  }
  if (c == '"') { v.t = JSTR; v.s = jstring(P); return true; }
  if (!strncmp(P.p, "true", 4)) { v.t = JBOOL; v.num = 1; P.p += 4; return true; }
  if (!strncmp(P.p, "false", 5)) { v.t = JBOOL; P.p += 5; return true; }
  if (!strncmp(P.p, "null", 4)) { v.t = JNULL; P.p += 4; return true; }
  char* e;
  v.num = strtod(P.p, &e);
  if (e == P.p) return false;
  v.t = JNUM; P.p = e;
  return true;
}
static void jfree(J& v) {
  for (uint32_t i = 0; i < v.n && (v.t == JARR || v.t == JOBJ); i++) jfree(v.kids[i]);
  if (v.t == JARR || v.t == JOBJ) { free(v.kids); free(v.keys); }
}
static const J* jkey(const J* o, const char* k) {
  if (!o || o->t != JOBJ) return nullptr;
  for (uint32_t i = 0; i < o->n; i++) if (!strcmp(o->keys[i], k)) return &o->kids[i];
  return nullptr;
}
static bool jis(const J& v, const char* s) { return v.t == JSTR && !strcmp(v.s, s); }

// ---------------------------------------------------------------- colors and zoom functions
static float hue(float p, float q, float t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1.f / 6) return p + (q - p) * 6 * t;
  if (t < 0.5f) return q;
  if (t < 2.f / 3) return p + (q - p) * (2.f / 3 - t) * 6;
  return p;
}
/** CSS color -> 0xAARRGGBB: #rgb #rrggbb #rrggbbaa rgb() rgba() hsl() hsla() and a few names. */
static bool parse_color(const char* s, uint32_t& out) {
  while (*s == ' ') s++;
  if (*s == '#') {
    uint32_t v = (uint32_t)strtoul(s + 1, nullptr, 16);
    size_t n = strlen(s + 1);
    if (n == 3) v = ((v & 0xF00) * 0x1100) | ((v & 0xF0) * 0x110) | ((v & 0xF) * 0x11), n = 6;
    out = n == 8 ? ((v & 0xFF) << 24) | (v >> 8) : 0xFF000000u | v;
    return true;
  }
  float a[4] = {0, 0, 0, 1};
  bool hsl = !strncmp(s, "hsl", 3);
  if (!strncmp(s, "rgb", 3) || hsl) {
    const char* p = strchr(s, '(');
    for (int i = 0; p && i < 4; i++) {
      char* e; a[i] = strtof(p + 1, &e);
      while (*e == ' ' || *e == '%') e++;
      if (*e != ',' && *e != ' ') break;
      p = e;
    }
    uint32_t r, g, b;
    if (hsl) {
      float h = a[0] / 360, sat = a[1] / 100, l = a[2] / 100;
      float q = l < 0.5f ? l * (1 + sat) : l + sat - l * sat, pp = 2 * l - q;
      r = (uint32_t)(hue(pp, q, h + 1.f / 3) * 255 + 0.5f); g = (uint32_t)(hue(pp, q, h) * 255 + 0.5f); b = (uint32_t)(hue(pp, q, h - 1.f / 3) * 255 + 0.5f);
    } else { r = (uint32_t)a[0]; g = (uint32_t)a[1]; b = (uint32_t)a[2]; }
    out = ((uint32_t)(a[3] * 255 + 0.5f) << 24) | (r & 255) << 16 | (g & 255) << 8 | (b & 255);
    return true;
  }
  if (!strcmp(s, "white")) { out = 0xFFFFFFFF; return true; }
  if (!strcmp(s, "black")) { out = 0xFF000000; return true; }
  if (!strcmp(s, "transparent")) { out = 0; return true; }
  return false;
}
static uint32_t mix(uint32_t a, uint32_t b, float t) {
  uint32_t r = 0;
  for (int k = 0; k < 32; k += 8) { float x = ((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t; r |= (uint32_t)(x + 0.5f) << k; }
  return r;
}
struct PV { float num; uint32_t col; };
static bool value(const J* v, bool color, PV& out) {
  if (v->t == JNUM) { out.num = (float)v->num; return !color; }
  if (v->t == JSTR && color) return parse_color(v->s, out.col);
  return false;
}
/** Property at zoom z: constant, {stops, base}, ["interpolate", ..., ["zoom"], ...] or ["step", ["zoom"], ...]. */
static bool prop(const J* v, float z, bool color, PV& out) {
  if (!v) return false;
  if (v->t == JNUM || v->t == JSTR) return value(v, color, out);
  const int MAX = 24;
  float zs[MAX]; const J* vs[MAX]; int n = 0; float base = 1; bool step = false;
  if (v->t == JOBJ) {
    const J* st = jkey(v, "stops");
    if (!st || st->t != JARR) return false;
    if (const J* b = jkey(v, "base")) base = (float)b->num;
    for (uint32_t i = 0; i < st->n && n < MAX; i++) if (st->kids[i].t == JARR && st->kids[i].n == 2) { zs[n] = (float)st->kids[i].kids[0].num; vs[n++] = &st->kids[i].kids[1]; }
  } else if (v->t == JARR && v->n >= 3 && jis(v->kids[0], "interpolate")) {
    const J& ty = v->kids[1];
    if (ty.t == JARR && ty.n >= 2 && jis(ty.kids[0], "exponential")) base = (float)ty.kids[1].num;
    for (uint32_t i = 3; i + 1 < v->n && n < MAX; i += 2) { zs[n] = (float)v->kids[i].num; vs[n++] = &v->kids[i + 1]; }
  } else if (v->t == JARR && v->n >= 3 && jis(v->kids[0], "step")) {
    step = true;
    zs[n] = -1e9f; vs[n++] = &v->kids[2];
    for (uint32_t i = 3; i + 1 < v->n && n < MAX; i += 2) { zs[n] = (float)v->kids[i].num; vs[n++] = &v->kids[i + 1]; }
  } else return false;
  if (!n) return false;
  if (z <= zs[0]) return value(vs[0], color, out);
  for (int i = 0; i + 1 < n; i++) {
    if (z >= zs[i + 1]) continue;
    if (step) return value(vs[i], color, out);
    float d = zs[i + 1] - zs[i], p = z - zs[i];
    float t = d <= 0 ? 0 : base == 1 ? p / d : (powf(base, p) - 1) / (powf(base, d) - 1);
    PV a, b;
    if (!value(vs[i], color, a) || !value(vs[i + 1], color, b)) return false;
    out.num = a.num + (b.num - a.num) * t; out.col = mix(a.col, b.col, t);
    return true;
  }
  return value(vs[n - 1], color, out);
}
static float num_prop(const J* layer, const char* group, const char* name, float z, float def) {
  PV v; return prop(jkey(jkey(layer, group), name), z, false, v) ? v.num : def;
}
static uint32_t color_prop(const J* layer, const char* group, const char* name, float z, uint32_t def) {
  PV v; return prop(jkey(jkey(layer, group), name), z, true, v) ? v.col : def;
}

// ---------------------------------------------------------------- Mapbox Vector Tile (protobuf)
struct Str { const char* s; uint32_t n; };
struct Val { uint8_t t; double d; const char* s; uint32_t n; };  // t: 0 none, 1 string, 2 number, 3 bool
struct Feature { const uint8_t *tags, *geom; uint32_t ntags, ngeom; uint8_t type; };  // type: 1 point, 2 line, 3 polygon
struct Layer { Str name; uint32_t extent; Vec<Str> keys; Vec<Val> vals; Vec<Feature> feats; };
struct Pb { const uint8_t *p, *end; };
static uint64_t varint(Pb& b) {
  uint64_t r = 0; int s = 0;
  while (b.p < b.end) { uint8_t c = *b.p++; r |= (uint64_t)(c & 127) << s; if (!(c & 128)) break; s += 7; }
  return r;
}
/** Next field: number, wire type; length-delimited payload in `sub`, scalar in `v`. False at the end or on garbage. */
static bool field(Pb& b, uint32_t& f, Pb& sub, uint64_t& v) {
  if (b.p >= b.end) return false;
  uint64_t key = varint(b);
  f = (uint32_t)(key >> 3);
  switch (key & 7) {
    case 0: v = varint(b); return true;
    case 1: if (b.end - b.p < 8) return false; memcpy(&v, b.p, 8); b.p += 8; return true;
    case 5: if (b.end - b.p < 4) return false; v = 0; memcpy(&v, b.p, 4); b.p += 4; return true;
    case 2: { uint64_t n = varint(b); if (n > (uint64_t)(b.end - b.p)) return false; sub = Pb{b.p, b.p + n}; b.p += n; return true; }
  }
  return false;
}
static int64_t zigzag(uint64_t v) { return (int64_t)(v >> 1) ^ -(int64_t)(v & 1); }
static bool parse_tile(const uint8_t* buf, uint32_t len, Vec<Layer>& out) {
  Pb t{buf, buf + len}, lb, sub; uint32_t f; uint64_t v;
  while (field(t, f, lb, v)) {
    if (f != 3) continue;
    Layer L{}; L.extent = 4096;
    while (field(lb, f, sub, v)) {
      if (f == 1) L.name = Str{(const char*)sub.p, (uint32_t)(sub.end - sub.p)};
      else if (f == 5) L.extent = (uint32_t)v;
      else if (f == 3) L.keys.push(Str{(const char*)sub.p, (uint32_t)(sub.end - sub.p)});
      else if (f == 4) {
        Val val{0, 0, nullptr, 0}; Pb vs; uint32_t vf; uint64_t x;
        while (field(sub, vf, vs, x)) {
          if (vf == 1) { val.t = 1; val.s = (const char*)vs.p; val.n = (uint32_t)(vs.end - vs.p); }
          else if (vf == 2) { float fl; uint32_t u = (uint32_t)x; memcpy(&fl, &u, 4); val.t = 2; val.d = fl; }
          else if (vf == 3) { double d; memcpy(&d, &x, 8); val.t = 2; val.d = d; }
          else if (vf == 4) { val.t = 2; val.d = (double)(int64_t)x; }
          else if (vf == 5) { val.t = 2; val.d = (double)x; }
          else if (vf == 6) { val.t = 2; val.d = (double)zigzag(x); }
          else if (vf == 7) { val.t = 3; val.d = x ? 1 : 0; }
        }
        L.vals.push(val);
      } else if (f == 2) {
        Feature ft{nullptr, nullptr, 0, 0, 0}; Pb fs; uint32_t ff; uint64_t x;
        while (field(sub, ff, fs, x)) {
          if (ff == 2) { ft.tags = fs.p; ft.ntags = (uint32_t)(fs.end - fs.p); }
          else if (ff == 3) ft.type = (uint8_t)x;
          else if (ff == 4) { ft.geom = fs.p; ft.ngeom = (uint32_t)(fs.end - fs.p); }
        }
        L.feats.push(ft);
      }
    }
    if (!L.extent) L.extent = 4096;
    out.push(L);
  }
  return true;
}
static void free_layers(Vec<Layer>& ls) {
  for (uint32_t i = 0; i < ls.n; i++) { ls[i].keys.release(); ls[i].vals.release(); ls[i].feats.release(); }
  ls.release();
}

// ---------------------------------------------------------------- filters
struct Feat { const Layer* L; const Feature* f; };
static bool get(const Feat& ft, const char* key, Val& out) {
  if (!strcmp(key, "$type")) {
    static const char* names[] = {"Unknown", "Point", "LineString", "Polygon"};
    const char* s = names[ft.f->type < 4 ? ft.f->type : 0];
    out = Val{1, 0, s, (uint32_t)strlen(s)};
    return true;
  }
  size_t kl = strlen(key);
  Pb b{ft.f->tags, ft.f->tags + ft.f->ntags};
  while (b.p < b.end) {
    uint32_t k = (uint32_t)varint(b), v = (uint32_t)varint(b);
    if (k < ft.L->keys.n && v < ft.L->vals.n && ft.L->keys[k].n == kl && !memcmp(ft.L->keys[k].s, key, kl)) { out = ft.L->vals[v]; return true; }
  }
  return false;
}
static bool eq(const Val& a, const J& b) {
  if (a.t == 1 && b.t == JSTR) return strlen(b.s) == a.n && !memcmp(a.s, b.s, a.n);
  if (a.t == 2 && b.t == JNUM) return a.d == b.num;
  if (a.t == 3 && b.t == JBOOL) return a.d == b.num;
  return false;
}
/** Filter key: legacy "class", or ["get", "class"] / ["geometry-type"] expressions. */
static const char* key_of(const J& k) {
  if (k.t == JSTR) return k.s;
  if (k.t == JARR && k.n >= 1 && jis(k.kids[0], "get") && k.n == 2 && k.kids[1].t == JSTR) return k.kids[1].s;
  if (k.t == JARR && k.n >= 1 && jis(k.kids[0], "geometry-type")) return "$type";
  return nullptr;
}
static bool eval(const J& f, const Feat& ft) {
  if (f.t == JBOOL) return f.num != 0;
  if (f.t != JARR || !f.n || f.kids[0].t != JSTR) return true;
  const char* op = f.kids[0].s;
  if (!strcmp(op, "all")) { for (uint32_t i = 1; i < f.n; i++) if (!eval(f.kids[i], ft)) return false; return true; }
  if (!strcmp(op, "any")) { for (uint32_t i = 1; i < f.n; i++) if (eval(f.kids[i], ft)) return true; return false; }
  if (!strcmp(op, "none")) { for (uint32_t i = 1; i < f.n; i++) if (eval(f.kids[i], ft)) return false; return true; }
  if (!strcmp(op, "!")) return f.n < 2 || !eval(f.kids[1], ft);
  if (f.n < 2) return true;
  const char* key = key_of(f.kids[1]);
  if (!key) return true;  // ponytail: unsupported expressions pass (drawn), rather than hiding data
  Val v; bool has = get(ft, key, v);
  if (!strcmp(op, "has")) return has;
  if (!strcmp(op, "!has")) return !has;
  if (!strcmp(op, "in") || !strcmp(op, "!in")) {
    bool in = false;
    for (uint32_t i = 2; i < f.n && has && !in; i++) in = eq(v, f.kids[i]);
    return (op[0] == '!') != in;
  }
  if (!strcmp(op, "match")) {  // ["match", input, label(s), true|false, ..., default]
    for (uint32_t i = 2; i + 1 < f.n; i += 2) {
      const J& lab = f.kids[i];
      bool hit = false;
      if (lab.t == JARR) { for (uint32_t k = 0; k < lab.n && has && !hit; k++) hit = eq(v, lab.kids[k]); }
      else hit = has && eq(v, lab);
      if (hit) return f.kids[i + 1].num != 0;
    }
    return f.kids[f.n - 1].t == JBOOL && f.kids[f.n - 1].num != 0;
  }
  if (f.n < 3) return true;
  const J& ref = f.kids[2];
  if (!strcmp(op, "==")) return has && eq(v, ref);
  if (!strcmp(op, "!=")) return !has || !eq(v, ref);
  if (!has || v.t != 2 || ref.t != JNUM) return false;
  if (!strcmp(op, "<")) return v.d < ref.num;
  if (!strcmp(op, "<=")) return v.d <= ref.num;
  if (!strcmp(op, ">")) return v.d > ref.num;
  if (!strcmp(op, ">=")) return v.d >= ref.num;
  return true;
}

// ---------------------------------------------------------------- geometry
/** Decodes a feature into contours [count, x, y, ...]* transformed by (s, ox, oy); returns the bounding box. */
static void decode(const Feature& f, float s, float ox, float oy, Vec<float>& out, float bb[4]) {
  Pb b{f.geom, f.geom + f.ngeom};
  int32_t x = 0, y = 0;
  uint32_t head = 0;
  bb[0] = bb[1] = 1e30f; bb[2] = bb[3] = -1e30f;
  while (b.p < b.end) {
    uint32_t cmd = (uint32_t)varint(b), id = cmd & 7, count = cmd >> 3;
    if (id == 7) continue;  // ClosePath: fills close implicitly, strokes of polygons use `closed`
    for (uint32_t i = 0; i < count && b.p < b.end; i++) {
      x += (int32_t)zigzag(varint(b)); y += (int32_t)zigzag(varint(b));
      if (id == 1 || f.type == 1) { head = out.n; out.push(0); }
      float px = x * s + ox, py = y * s + oy;
      out.push(px); out.push(py); out[head] += 1;
      if (px < bb[0]) bb[0] = px; if (py < bb[1]) bb[1] = py; if (px > bb[2]) bb[2] = px; if (py > bb[3]) bb[3] = py;
    }
  }
}
/** Appends the stroke outline of a polyline; long lines go in chunks (stroke_contours packs sizes in 16 bits). */
static void stroke_into(Vec<float>& out, const float* p, uint32_t n, float width, bool closed) {
  const uint32_t CH = 1000;
  if (n < 2) return;
  if (n <= CH) {
    out.reserve(out.n + n * 42 + 16);
    out.n += raster::stroke_contours(p, n, width, closed, out.p + out.n, out.cap - out.n) >> 16;
    return;
  }
  for (uint32_t i = 0; i + 1 < n; i += CH - 1) stroke_into(out, p + i * 2, n - i < CH ? n - i : CH, width, false);
  if (closed) { float seg[4] = {p[(n - 1) * 2], p[(n - 1) * 2 + 1], p[0], p[1]}; stroke_into(out, seg, 2, width, false); }
}
static void fill(uint32_t* px, const float* pts, uint32_t len, uint32_t argb, float opacity) {
  if (!len) return;
  raster::Cmd c; memset(&c, 0, sizeof c);
  c.kind = raster::POLY; c.c1 = argb & 0xFFFFFF;
  float a = (argb >> 24) * opacity; c.alpha = (uint8_t)(a > 255 ? 255 : a);
  if (!c.alpha) return;
  c.w = c.h = TILE;
  for (uint32_t i = 0; i < len; i += 1 + 2 * (uint32_t)pts[i]) c.n++;
  raster::Frame fr{&c, 1, nullptr, pts};
  raster::render(fr, px, TILE, 0, TILE, raster::Rect{0, 0, TILE, TILE});
}

// ---------------------------------------------------------------- style, tiles, labels
struct Label { float x, y, prio; char* text; uint32_t len; int32_t font; uint32_t color, halo; };
struct Img { int32_t z, x, y, img; uint32_t used; bool live; Vec<Label> labels; };
enum { REQUESTED = 1, INFLIGHT, READY, MISSING };
struct Data { int32_t z, x, y; uint8_t state; uint8_t* buf; uint32_t len, used; Vec<Layer> layers; };

struct Engine : NativeMapEngine {
  J style{}; char* style_text = nullptr; const J* layers = nullptr;
  uint32_t bg = 0xFFF8F4F0;
  int32_t minz = 0, maxz = 14;
  Img imgs[ZP_MAP_TILES] = {};
  Data data[64] = {};
  uint32_t clock = 1, data_bytes = 0;
  Vec<float> pts, strokes;
  uint32_t st_tiles = 0, st_labels = 0; double st_ms = 0;

  Engine() { for (auto& i : imgs) i.img = -1; }

  zrt::String setStyle(zrt::String json) override {
    char* text = (char*)malloc(json.bytes() + 1);
    memcpy(text, json.ptr(), json.bytes()); text[json.bytes()] = 0;
    char* scratch = (char*)malloc(json.bytes() + 1);  // unescaped strings live here
    JP P{text, scratch};
    J root;
    if (!jparse(P, root) || root.t != JOBJ) { free(text); free(scratch); return zrt::String::from("style: invalid JSON", 19); }
    free(text);
    if (layers) { jfree(style); free(style_text); }
    style = root; style_text = scratch;
    layers = jkey(&style, "layers");
    if (!layers || layers->t != JARR) { layers = nullptr; return zrt::String::from("style: no layers", 16); }
    for (auto& i : imgs) drop_img(i);
    for (uint32_t i = 0; i < layers->n; i++)
      if (const J* t = jkey(&layers->kids[i], "type")) if (jis(*t, "background")) bg = color_prop(&layers->kids[i], "paint", "background-color", 12, bg);
    return zrt::String();
  }
  void setSourceZoom(int32_t a, int32_t b) override { minz = a; maxz = b; }

  // ---- data tiles
  Data* find_data(int32_t z, int32_t x, int32_t y) {
    for (auto& d : data) if (d.state && d.z == z && d.x == x && d.y == y) return &d;
    return nullptr;
  }
  void drop_data(Data& d) {
    if (d.state == READY) { free_layers(d.layers); free(d.buf); data_bytes -= d.len; }
    d = Data{};
  }
  Data* slot() {
    Data* best = nullptr;
    for (auto& d : data) { if (!d.state) return &d; if (d.state != INFLIGHT && d.used < clock && (!best || d.used < best->used)) best = &d; }
    if (best) drop_data(*best);
    return best;
  }
  /** The data tile an image tile at (z, x, y) is drawn from: its own zoom (capped at maxz), or ancestors of missing ones.
   *  Null while loading (requests it). */
  Data* data_for(int32_t z, int32_t x, int32_t y, bool& none) {
    none = false;
    int32_t dz = z > maxz ? maxz : z;
    for (; dz >= minz; dz--) {
      int32_t k = z - dz, dx = x >> k, dy = y >> k;
      Data* d = find_data(dz, dx, dy);
      if (!d) { if ((d = slot())) { *d = Data{}; d->z = dz; d->x = dx; d->y = dy; d->state = REQUESTED; d->used = clock; } return nullptr; }
      d->used = clock;
      if (d->state == READY) return d;
      if (d->state != MISSING) return nullptr;
    }
    none = true;
    return nullptr;
  }
  zrt::String nextRequest() override {
    Data* best = nullptr;
    for (auto& d : data) if (d.state == REQUESTED && (!best || d.used > best->used || (d.used == best->used && d.z < best->z))) best = &d;
    if (!best) return zrt::String();
    best->state = INFLIGHT;
    char k[48]; int n = snprintf(k, sizeof k, "%d/%d/%d", best->z, best->x, best->y);
    return zrt::String::from(k, (uint32_t)n);
  }
  void provide(zrt::String key, zrt::String bytes) override {
    char k[48]; uint32_t kl = key.bytes() < 47 ? key.bytes() : 47;
    memcpy(k, key.ptr(), kl); k[kl] = 0;
    int32_t z, x, y;
    if (sscanf(k, "%d/%d/%d", &z, &x, &y) != 3) return;
    uint32_t len = bytes.bytes();
    if (len >= 2 && (uint8_t)bytes.ptr()[0] == 0x1f && (uint8_t)bytes.ptr()[1] == 0x8b) {
      fprintf(stderr, "zinc:map: tile %s is gzip-compressed; store tiles uncompressed (fetch-tiles.mjs does)\n", k);
      len = 0;
    }
    Data* d = find_data(z, x, y);
    if (!d && !(d = slot())) return;
    if (d->state == READY) return;
    *d = Data{}; d->z = z; d->x = x; d->y = y; d->used = clock;
    if (!len) { d->state = MISSING; return; }
    d->buf = (uint8_t*)malloc(len); d->len = len;
    memcpy(d->buf, bytes.ptr(), d->len);
    parse_tile(d->buf, d->len, d->layers);
    d->state = READY;
    data_bytes += d->len;
    while (data_bytes > (uint32_t)ZP_MAP_DATAMB << 20) {  // LRU over the byte budget, never the tile just added
      Data* old = nullptr;
      for (auto& e : data) if (e.state == READY && &e != d && (!old || e.used < old->used)) old = &e;
      if (!old) break;
      drop_data(*old);
    }
  }

  // ---- tile images
  void drop_img(Img& i) {
    for (uint32_t k = 0; k < i.labels.n; k++) free(i.labels[k].text);
    i.labels.n = 0; i.live = false;
  }
  Img* find_img(int32_t z, int32_t x, int32_t y) {
    for (auto& i : imgs) if (i.live && i.z == z && i.x == x && i.y == y) return &i;
    return nullptr;
  }
  Img* new_img() {
    Img* best = nullptr;
    for (auto& i : imgs) { if (!i.live) { best = &i; break; } if (i.used < clock && (!best || i.used < best->used)) best = &i; }
    if (!best) return nullptr;
    drop_img(*best);
    if (best->img < 0) best->img = raster::dyn_create(TILE, TILE);
    return best->img < 0 ? nullptr : best;
  }
  void render_tile(Img& t, const Data* d) {
    uint32_t* px = raster::dyn_pixels(t.img);
    for (int i = 0; i < TILE * TILE; i++) px[i] = bg & 0xFFFFFF;
    float z = (float)t.z;
    for (uint32_t li = 0; d && layers && li < layers->n; li++) {
      const J* L = &layers->kids[li];
      const J* type = jkey(L, "type");
      if (!type || type->t != JSTR) continue;
      if (const J* v = jkey(jkey(L, "layout"), "visibility")) if (jis(*v, "none")) continue;
      if (const J* mz = jkey(L, "minzoom")) if (z < mz->num) continue;
      if (const J* mz = jkey(L, "maxzoom")) if (z >= mz->num) continue;
      if (jis(*type, "background")) continue;  // drawn by the tile clear
      const J* sl = jkey(L, "source-layer");
      const Layer* ml = nullptr;
      for (uint32_t k = 0; sl && k < d->layers.n; k++) if (strlen(sl->s) == d->layers[k].name.n && !memcmp(d->layers[k].name.s, sl->s, d->layers[k].name.n)) ml = &d->layers[k];
      if (!ml) continue;
      const J* filter = jkey(L, "filter");
      int32_t k = t.z - d->z;
      float s = (float)TILE * (float)(1 << k) / (float)ml->extent;
      float ox = -(float)(t.x - (d->x << k)) * TILE, oy = -(float)(t.y - (d->y << k)) * TILE;
      bool is_fill = jis(*type, "fill"), is_line = jis(*type, "line"), is_sym = jis(*type, "symbol");
      float width = is_line ? num_prop(L, "paint", "line-width", z, 1) : 1;
      float margin = width + 2;
      pts.n = 0; strokes.n = 0;
      for (uint32_t fi = 0; fi < ml->feats.n; fi++) {
        const Feature& f = ml->feats[fi];
        if ((is_fill && f.type != 3) || (is_line && f.type == 1) || (is_sym && f.type != 1)) continue;
        Feat ft{ml, &f};
        if (filter && !eval(*filter, ft)) continue;
        if (is_sym) { label(t, L, li, ft, s, ox, oy, z); continue; }
        uint32_t start = pts.n; float bb[4];
        decode(f, s, ox, oy, pts, bb);
        if (bb[2] < -margin || bb[3] < -margin || bb[0] > TILE + margin || bb[1] > TILE + margin) { pts.n = start; continue; }
        if (is_line) {
          for (uint32_t i = start; i < pts.n; i += 1 + 2 * (uint32_t)pts[i]) {
            stroke_into(strokes, &pts[i + 1], (uint32_t)pts[i], width, f.type == 3);
          }
          pts.n = start;
        }
      }
      if (is_fill) {
        fill(px, pts.p, pts.n, color_prop(L, "paint", "fill-color", z, 0xFF000000), num_prop(L, "paint", "fill-opacity", z, 1));
        uint32_t oc = color_prop(L, "paint", "fill-outline-color", z, 0);
        if (oc >> 24) {
          for (uint32_t i = 0; i < pts.n; i += 1 + 2 * (uint32_t)pts[i]) {
            stroke_into(strokes, &pts[i + 1], (uint32_t)pts[i], 1, true);
          }
          fill(px, strokes.p, strokes.n, oc, 1);
        }
      }
      if (is_line) fill(px, strokes.p, strokes.n, color_prop(L, "paint", "line-color", z, 0xFF000000), num_prop(L, "paint", "line-opacity", z, 1));
    }
    raster::dyn_update(t.img, nullptr, 0);
  }
  /** Point label: text from "text-field" ("{name}" templates or ["get", key]), kept only inside its own tile. */
  void label(Img& t, const J* L, uint32_t li, const Feat& ft, float s, float ox, float oy, float z) {
    Pb b{ft.f->geom, ft.f->geom + ft.f->ngeom};
    uint32_t cmd = (uint32_t)varint(b);
    if ((cmd & 7) != 1) return;
    float x = (float)zigzag(varint(b)) * s + ox, y = (float)zigzag(varint(b)) * s + oy;
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const J* tf = jkey(jkey(L, "layout"), "text-field");
    if (!tf) return;
    char buf[256]; uint32_t n = 0;
    Val v;
    if (tf->t == JARR && tf->n == 2 && jis(tf->kids[0], "get")) { if (get(ft, tf->kids[1].s, v) && v.t == 1) { n = v.n < 255 ? v.n : 255; memcpy(buf, v.s, n); } }
    else if (tf->t == JSTR) {
      for (const char* p = tf->s; *p && n < 255;) {
        if (*p != '{') { buf[n++] = *p++; continue; }
        const char* e = strchr(p, '}');
        if (!e) break;
        char key[64]; uint32_t kl = (uint32_t)(e - p - 1) < 63 ? (uint32_t)(e - p - 1) : 63;
        memcpy(key, p + 1, kl); key[kl] = 0;
        if (get(ft, key, v) && v.t == 1) { uint32_t c = v.n < 255 - n ? v.n : 255 - n; memcpy(buf + n, v.s, c); n += c; }
        p = e + 1;
      }
    }
    if (!n) return;
    const J* font = jkey(jkey(L, "layout"), "text-font");
    bool bold = false;
    for (uint32_t i = 0; font && font->t == JARR && i < font->n; i++) if (font->kids[i].t == JSTR && strstr(font->kids[i].s, "Bold")) bold = true;
    int32_t size = (int32_t)(num_prop(L, "layout", "text-size", z, 16) + 0.5f);
    Label lb;
    lb.x = x; lb.y = y;
    lb.prio = (float)li * 1000.f - (get(ft, "rank", v) && v.t == 2 ? (float)v.d : 0);
    lb.text = (char*)malloc(n); memcpy(lb.text, buf, n); lb.len = n;
    lb.font = raster::find_font(bold ? "sans-bold" : "sans", bold ? 9 : 4, size);
    lb.color = color_prop(L, "paint", "text-color", z, 0xFF000000);
    lb.halo = num_prop(L, "paint", "text-halo-width", z, 0) > 0 ? color_prop(L, "paint", "text-halo-color", z, 0) : 0;
    t.labels.push(lb);
  }

  // ---- frame
  struct Vis { int32_t tx, ty, wx; float sx, sy, d; };
  struct Placed { float x0, y0, x1, y1; };
  int32_t draw(double mx, double my, double zoom, double vx, double vy, double vw, double vh, bool fast) override {
    clock++;
    uint64_t t0 = hal_time_us();
    int32_t z = (int32_t)floor(zoom + 0.5);
    if (z < 0) z = 0; if (z > 24) z = 24;
    double scale = pow(2.0, zoom - z), n = (double)(1 << z);
    double cx = mx * n * TILE, cy = my * n * TILE;  // centre in tile pixels at zoom z
    clip(vx, vy, vw, vh);
    rect(vx, vy, vw, vh, bg);
    // visible tiles, nearest to the centre first
    Vis vis[256]; int nv = 0;
    int32_t tx0 = (int32_t)floor((cx - vw / 2 / scale) / TILE), tx1 = (int32_t)floor((cx + vw / 2 / scale) / TILE);
    int32_t ty0 = (int32_t)floor((cy - vh / 2 / scale) / TILE), ty1 = (int32_t)floor((cy + vh / 2 / scale) / TILE);
    for (int32_t ty = ty0; ty <= ty1; ty++) for (int32_t tx = tx0; tx <= tx1 && nv < 256; tx++) {
      if (ty < 0 || ty >= (int32_t)n) continue;
      Vis v; v.tx = tx; v.ty = ty; v.wx = (int32_t)(((int64_t)tx % (int64_t)n + (int64_t)n) % (int64_t)n);
      v.sx = (float)floor(vx + vw / 2 + (tx * (double)TILE - cx) * scale); v.sy = (float)floor(vy + vh / 2 + (ty * (double)TILE - cy) * scale);
      double dx = (tx + 0.5) * TILE - cx, dy = (ty + 0.5) * TILE - cy; v.d = (float)(dx * dx + dy * dy);
      int i = nv++;
      while (i > 0 && vis[i - 1].d > v.d) { vis[i] = vis[i - 1]; i--; }
      vis[i] = v;
    }
    int32_t pending = 0; bool rendered = false;
    Img* shown[256];
    for (int i = 0; i < nv; i++) {
      Vis& v = vis[i];
      Img* im = find_img(z, v.wx, v.ty);
      if (!im) {
        bool none;
        const Data* d = data_for(z, v.wx, v.ty, none);
        bool budget = !rendered || hal_time_us() - t0 < (uint64_t)ZP_MAP_BUDGETMS * 1000;
        if ((d || none) && budget && (im = new_img())) {
          im->z = z; im->x = v.wx; im->y = v.ty; im->live = true; im->used = clock;
          uint64_t r0 = hal_time_us();
          render_tile(*im, d);
          st_ms += (hal_time_us() - r0) / 1000.0; st_tiles++;
          rendered = true;
        } else pending++;
      }
      shown[i] = im;
      float w = (float)(floor(vx + vw / 2 + ((v.tx + 1) * (double)TILE - cx) * scale) - v.sx);  // edges rounded once: no seams
      float h = (float)(floor(vy + vh / 2 + ((v.ty + 1) * (double)TILE - cy) * scale) - v.sy);
      if (im) { im->used = clock; image(im->img, v.sx, v.sy, w, h, fast || scale == 1.0); continue; }
      // placeholder: the nearest cached ancestor, scaled and clipped to this tile
      for (int32_t k = 1; k <= 4 && z - k >= 0; k++) {
        Img* a = find_img(z - k, v.wx >> k, v.ty >> k);
        if (!a) continue;
        a->used = clock;
        float aw = w * (1 << k), ah = h * (1 << k);
        float ax = v.sx - (v.wx & ((1 << k) - 1)) * w, ay = v.sy - (v.ty & ((1 << k) - 1)) * h;
        clip(v.sx, v.sy, w, h);
        image(a->img, ax, ay, aw, ah, true);
        unclip();
        break;
      }
    }
    draw_labels(vis, shown, nv, scale);
    unclip();
    return pending;
  }
  void draw_labels(const Vis* vis, Img* const* shown, int nv, double scale) {
    Vec<Label*> ls; Vec<float> pos;
    for (int i = 0; i < nv; i++) {
      if (!shown[i]) continue;
      for (uint32_t k = 0; k < shown[i]->labels.n; k++) { Label* l = &shown[i]->labels[k]; ls.push(l); pos.push(vis[i].sx + l->x * (float)scale); pos.push(vis[i].sy + l->y * (float)scale); }
    }
    // greedy placement by priority: later style layers first, then lower rank
    Vec<uint32_t> order;
    for (uint32_t i = 0; i < ls.n; i++) {
      uint32_t j = order.n; order.push(i);
      while (j > 0 && ls[order[j - 1]]->prio < ls[i]->prio) { order[j] = order[j - 1]; j--; }
      order[j] = i;
    }
    Vec<Placed> boxes;
    for (uint32_t oi = 0; oi < order.n; oi++) {
      uint32_t i = order[oi];
      const Label& l = *ls[i];
      if (l.font < 0) continue;
      float tw = raster::text_advance(l.font, l.text, l.len, 0) / 64.f, th = (float)(raster::fonts[l.font].ascent + raster::fonts[l.font].descent);
      float x = pos[i * 2] - tw / 2, y = pos[i * 2 + 1] - th / 2;
      Placed b{x - 3, y - 2, x + tw + 3, y + th + 2};
      bool hit = false;
      for (uint32_t k = 0; k < boxes.n && !hit; k++) hit = b.x0 < boxes[k].x1 && b.x1 > boxes[k].x0 && b.y0 < boxes[k].y1 && b.y1 > boxes[k].y0;
      if (hit) continue;
      boxes.push(b);
      zrt::String s = zrt::String::from(l.text, l.len);
      if (l.halo >> 24) {
        static const int8_t off[8][2] = {{-1, -1}, {0, -1}, {1, -1}, {-1, 0}, {1, 0}, {-1, 1}, {0, 1}, {1, 1}};
        for (auto& o : off) gfx::drawText(l.font, x + o[0], y + o[1], s, l.halo & 0xFFFFFF, (int32_t)(l.halo >> 24), 0);
      }
      gfx::drawText(l.font, x, y, s, l.color & 0xFFFFFF, (int32_t)(l.color >> 24), 0);
    }
    st_labels += boxes.n;
    ls.release(); pos.release(); order.release(); boxes.release();
  }
  static void clip(double x, double y, double w, double h) { gfx::clip(x, y, w, h); }
  static void unclip() { gfx::unclip(); }
  void rect(double x, double y, double w, double h, uint32_t c) { gfx::rect(x, y, w, h, c & 0xFFFFFF); }
  static void image(int32_t img, float x, float y, float w, float h, bool nearest) {
    if (raster::Cmd* c = gfx::emit(raster::IMAGE, nullptr, 0)) {
      c->x = x; c->y = y; c->w = w; c->h = h; c->res = img; c->alpha = 255; c->grad = nearest ? 1 : 0; c->c2 = raster::image_version(img);
    }
  }
  zrt::String stats() override {
    char b[96];
    int n = snprintf(b, sizeof b, "tiles=%u renderMs=%.1f labels=%u", st_tiles, st_ms, st_labels);
    st_tiles = 0; st_ms = 0; st_labels = 0;
    return zrt::String::from(b, (uint32_t)n);
  }
};

}  // namespace

NativeMapEngine* zinc_create_MapEngine() {
  static Engine e;
  e.rc = zrt::IMMORTAL;
  return &e;
}
