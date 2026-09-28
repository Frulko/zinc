// zinc:lottie — Lottie (Bodymovin JSON) player on the shared software rasterizer. Portable C++ (no platform code):
// the other targets' files include this one. See docs/plugins/lottie.md.
//
// Pipeline: JSON text -> small DOM (temporary) -> compact scene (flat arrays of layers, shape items, transforms and
// properties; every property is either a static value or a keyframe table in one float pool) -> per frame: evaluate
// the properties of the visible layers, transform bezier paths to device space, flatten them adaptively (tolerance
// in device pixels, so detail follows the drawn size), apply trim paths, build fill contours and stroke outlines,
// and emit them as gfx.path commands (nonzero AA polygons). Each top-level layer keeps its last output: a static
// layer is never re-evaluated, an animated one only when the frame or the box changes, so redrawing the same frame
// (paused player, 30 fps file on a 60 Hz loop) is a replay and the frame diff then finds nothing to rasterize.
#include "zinc_native_lottie.h"
#include "zrt_raster.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>

namespace {

// ---------------------------------------------------------------- growable POD vector
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
  T* add(uint32_t k) { reserve(n + k); T* r = p + n; n += k; return r; }
  T& operator[](uint32_t i) { return p[i]; }
  const T& operator[](uint32_t i) const { return p[i]; }
  void release() { free(p); p = nullptr; n = cap = 0; }
};

// ---------------------------------------------------------------- JSON (DOM of the source text, temporary)
enum { JNULL, JBOOL, JNUM, JSTR, JARR, JOBJ };
struct JV {
  uint8_t t; uint32_t cnt;        // children (arrays, objects)
  int32_t first, next;            // first child, next sibling
  const char* k; uint32_t kl;     // key when member of an object
  const char* s; uint32_t sl;     // string (raw, escapes kept)
  double num;
};
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
  double number() {  // strtod on a copy: correctly rounded, so metadata prints like JSON.parse in the sim
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
  int32_t at(int32_t a, uint32_t i) const {
    if (a < 0 || v[a].t != JARR) return -1;
    int32_t c = v[a].first;
    while (c >= 0 && i--) c = v[c].next;
    return c;
  }
  double num(int32_t o, const char* key, double def) const {
    int32_t c = get(o, key);
    if (c < 0) return def;
    if (v[c].t == JNUM || v[c].t == JBOOL) return v[c].num;
    if (v[c].t == JARR && v[c].first >= 0 && v[v[c].first].t == JNUM) return v[v[c].first].num;  // [x] easing arrays
    return def;
  }
  bool streq(int32_t c, const char* s) const { return c >= 0 && v[c].t == JSTR && v[c].sl == strlen(s) && !memcmp(v[c].s, s, v[c].sl); }
};

// ---------------------------------------------------------------- scene
// A property: `dim` floats. Static: the value at pool[off]. Keyframed: nk keys of (KEY + dim) floats:
// t, hold, out-ease x/y, in-ease x/y, spatial out/in tangents (x, y each), value.
static const uint32_t KEY = 10;
struct Prop { uint32_t off; uint16_t dim, nk; };
struct Tr { Prop a, p, px, py, s, r, o, so, eo; bool split; };
enum { GROUP, PATH, RECT, ELLIPSE, STAR, FILL, STROKE, GFILL, GSTROKE, TRIM, REPEATER };
struct Item {
  uint8_t ty, dir, a, b;   // a: fill rule / line cap / trim mode / star type / gradient stops; b: line join / gradient type / composite
  bool hidden;
  float ml;                // miter limit
  int32_t kids, nkids, tr; // group children (index into lists), transform (group, repeater)
  Prop p[5];
};
struct Mask { uint8_t mode; Prop pt; };
enum { L_PRECOMP = 0, L_SOLID = 1, L_NULL = 3, L_SHAPE = 4 };
struct Layer {
  uint8_t ty; bool hidden, matte, animated, has_tm;
  int32_t ind, parent, tr, items, nitems, comp, masks, nmasks;
  float ip, op, st, sr, w, h;
  uint32_t color;
  Prop tm;
};
struct Comp { int32_t layers, n; };
struct Cache { float key[6]; bool ok; Vec<float> ops; };
struct Anim {
  Vec<float> pool; Vec<Item> items; Vec<int32_t> lists; Vec<Tr> trs; Vec<Layer> layers; Vec<Mask> masks; Vec<Comp> comps;
  Vec<Cache> cache;  // one per top-level layer
  double w, h, ip, op, fr;  // double: metadata reads back exactly like the sim's JSON.parse
  int32_t root;
};

// ---------------------------------------------------------------- building
struct Builder {
  Json& J; Anim& A;
  Vec<float> tmp;
  bool animated = false;  // set when a keyframed property is parsed (per layer)
  // component names of the assets, to resolve refId
  Vec<int32_t> asset_ids; Vec<int32_t> asset_comp;

  // Flattens a JSON value into floats: numbers, arrays of numbers, or a bezier shape {c, v, i, o}.
  void vals(int32_t n, Vec<float>& out) {
    if (n < 0) return;
    const JV& x = J.v[n];
    if (x.t == JNUM || x.t == JBOOL) { out.push((float)x.num); return; }
    if (x.t == JARR) {
      if (x.first >= 0 && J.v[x.first].t == JOBJ) { vals(x.first, out); return; }
      for (int32_t c = x.first; c >= 0; c = J.v[c].next) if (J.v[c].t == JNUM) out.push((float)J.v[c].num);
      return;
    }
    if (x.t == JOBJ) {
      int32_t vv = J.get(n, "v"), ii = J.get(n, "i"), oo = J.get(n, "o");
      uint32_t cnt = vv >= 0 ? J.v[vv].cnt : 0;
      out.push(J.num(n, "c", 0) != 0 ? 1.0f : 0.0f);
      for (uint32_t k = 0; k < cnt; k++) {
        int32_t pv = J.at(vv, k), pi = J.at(ii, k), po = J.at(oo, k);
        float* d = out.add(6);
        auto xy = [&](int32_t a, float* dst) { int32_t x0 = J.at(a, 0), y0 = J.at(a, 1); dst[0] = x0 >= 0 ? (float)J.v[x0].num : 0; dst[1] = y0 >= 0 ? (float)J.v[y0].num : 0; };
        xy(pv, d); xy(pi, d + 2); xy(po, d + 4);
      }
    }
  }
  static float first_num(const Json& J, int32_t n, float def) {
    if (n < 0) return def;
    if (J.v[n].t == JNUM) return (float)J.v[n].num;
    if (J.v[n].t == JARR && J.v[n].first >= 0 && J.v[J.v[n].first].t == JNUM) return (float)J.v[J.v[n].first].num;
    return def;
  }
  /** {a, k} animatable property; missing -> dim 0 (callers use defaults). */
  Prop prop(int32_t node) {
    Prop pr = {A.pool.n, 0, 0};
    int32_t k = J.get(node, "k");
    if (k < 0) return pr;
    bool keyed = J.v[k].t == JARR && J.v[k].first >= 0 && J.v[J.v[k].first].t == JOBJ && J.get(J.v[k].first, "t") >= 0;
    if (!keyed) {
      tmp.n = 0; vals(k, tmp);
      pr.dim = (uint16_t)tmp.n;
      float* d = A.pool.add(tmp.n);
      if (tmp.n) memcpy(d, tmp.p, tmp.n * sizeof(float));
      return pr;
    }
    // dimension: the widest value among the keys
    uint32_t dim = 0;
    for (int32_t c = J.v[k].first; c >= 0; c = J.v[c].next) {
      tmp.n = 0; vals(J.get(c, "s"), tmp); if (tmp.n > dim) dim = tmp.n;
      tmp.n = 0; vals(J.get(c, "e"), tmp); if (tmp.n > dim) dim = tmp.n;
    }
    if (!dim || dim > 60000) return pr;
    pr.dim = (uint16_t)dim;
    int32_t prev = -1;
    for (int32_t c = J.v[k].first; c >= 0; c = J.v[c].next) {
      float* d = A.pool.add(KEY + dim);
      memset(d, 0, (KEY + dim) * sizeof(float));
      d[0] = (float)J.num(c, "t", 0);
      d[1] = J.num(c, "h", 0) != 0;
      int32_t o = J.get(c, "o"), i = J.get(c, "i");
      d[2] = first_num(J, J.get(o, "x"), 0); d[3] = first_num(J, J.get(o, "y"), 0);
      d[4] = first_num(J, J.get(i, "x"), 1); d[5] = first_num(J, J.get(i, "y"), 1);
      int32_t to = J.get(c, "to"), ti = J.get(c, "ti");
      d[6] = first_num(J, J.at(to, 0), 0); d[7] = first_num(J, J.at(to, 1), 0);
      d[8] = first_num(J, J.at(ti, 0), 0); d[9] = first_num(J, J.at(ti, 1), 0);
      // value: "s", else the previous key's "e" (old exports), else the previous value
      tmp.n = 0;
      int32_t s = J.get(c, "s");
      if (s >= 0) vals(s, tmp); else if (prev >= 0) vals(J.get(prev, "e") >= 0 ? J.get(prev, "e") : J.get(prev, "s"), tmp);
      for (uint32_t q = 0; q < tmp.n && q < dim; q++) d[KEY + q] = tmp[q];
      prev = c;
      pr.nk++;
    }
    animated = true;
    return pr;
  }
  int32_t transform(int32_t n) {
    Tr t; memset(&t, 0, sizeof t);
    t.a = prop(J.get(n, "a"));
    int32_t p = J.get(n, "p");
    t.split = J.num(p, "s", 0) != 0 && J.get(p, "x") >= 0;
    if (t.split) { t.px = prop(J.get(p, "x")); t.py = prop(J.get(p, "y")); } else t.p = prop(p);
    t.s = prop(J.get(n, "s"));
    t.r = prop(J.get(n, J.get(n, "r") >= 0 ? "r" : "rz"));
    t.o = prop(J.get(n, "o"));
    t.so = prop(J.get(n, "so")); t.eo = prop(J.get(n, "eo"));
    A.trs.push(t);
    return (int32_t)A.trs.n - 1;
  }
  /** Shape list -> item indices in A.lists; the group transform ("tr") goes to *tr. */
  int32_t items(int32_t arr, int32_t* count, int32_t* tr) {
    Vec<int32_t> ids;
    for (int32_t c = arr >= 0 ? J.v[arr].first : -1; c >= 0; c = J.v[c].next) {
      int32_t ty = J.get(c, "ty");
      if (J.streq(ty, "tr")) { if (tr) *tr = transform(c); continue; }
      Item it; memset(&it, 0, sizeof it);
      it.kids = it.tr = -1;
      it.hidden = J.num(c, "hd", 0) != 0;
      it.dir = (uint8_t)J.num(c, "d", 1);
      if (J.streq(ty, "gr")) {
        it.ty = GROUP;
        int32_t n = 0, t = -1;
        it.kids = items(J.get(c, "it"), &n, &t);
        it.nkids = n; it.tr = t;
      } else if (J.streq(ty, "sh")) { it.ty = PATH; it.p[0] = prop(J.get(c, "ks")); }
      else if (J.streq(ty, "rc")) { it.ty = RECT; it.p[0] = prop(J.get(c, "p")); it.p[1] = prop(J.get(c, "s")); it.p[2] = prop(J.get(c, "r")); }
      else if (J.streq(ty, "el")) { it.ty = ELLIPSE; it.p[0] = prop(J.get(c, "p")); it.p[1] = prop(J.get(c, "s")); }
      else if (J.streq(ty, "sr")) {
        it.ty = STAR; it.a = (uint8_t)J.num(c, "sy", 1);
        it.p[0] = prop(J.get(c, "p")); it.p[1] = prop(J.get(c, "or")); it.p[2] = prop(J.get(c, "ir")); it.p[3] = prop(J.get(c, "pt")); it.p[4] = prop(J.get(c, "r"));
      } else if (J.streq(ty, "fl") || J.streq(ty, "st")) {
        it.ty = J.streq(ty, "fl") ? FILL : STROKE;
        it.p[0] = prop(J.get(c, "c")); it.p[1] = prop(J.get(c, "o")); it.p[2] = prop(J.get(c, "w"));
        it.a = (uint8_t)J.num(c, it.ty == FILL ? "r" : "lc", it.ty == FILL ? 1 : 2); it.b = (uint8_t)J.num(c, "lj", 2); it.ml = (float)J.num(c, "ml", 4);
      } else if (J.streq(ty, "gf") || J.streq(ty, "gs")) {
        it.ty = J.streq(ty, "gf") ? GFILL : GSTROKE;
        int32_t g = J.get(c, "g");
        it.a = (uint8_t)J.num(g, "p", 2); it.b = (uint8_t)J.num(c, "t", 1);
        it.p[0] = prop(J.get(g, "k")); it.p[1] = prop(J.get(c, "o")); it.p[2] = prop(J.get(c, "s")); it.p[3] = prop(J.get(c, "e")); it.p[4] = prop(J.get(c, "w"));
        it.ml = (float)J.num(c, "ml", 4);
        uint8_t lc = (uint8_t)J.num(c, "lc", 2), lj = (uint8_t)J.num(c, "lj", 2);
        it.dir = (uint8_t)(lc | (lj << 4));  // gradient strokes keep cap/join here (a, b hold the gradient)
      } else if (J.streq(ty, "tm")) {
        it.ty = TRIM; it.a = (uint8_t)J.num(c, "m", 1);
        it.p[0] = prop(J.get(c, "s")); it.p[1] = prop(J.get(c, "e")); it.p[2] = prop(J.get(c, "o"));
      } else if (J.streq(ty, "rp")) {
        it.ty = REPEATER; it.b = (uint8_t)J.num(c, "m", 1);
        it.p[0] = prop(J.get(c, "c")); it.p[1] = prop(J.get(c, "o"));
        it.tr = transform(J.get(c, "tr"));
      } else continue;  // unsupported: merge paths, round corners, offset, pucker, twist, zig-zag
      A.items.push(it);
      ids.push((int32_t)A.items.n - 1);
    }
    int32_t off = (int32_t)A.lists.n;
    int32_t* d = A.lists.add(ids.n);
    if (ids.n) memcpy(d, ids.p, ids.n * sizeof(int32_t));
    *count = (int32_t)ids.n;
    ids.release();
    return off;
  }
  static uint32_t hex(const char* s, uint32_t n) {
    uint32_t v = 0;
    for (uint32_t i = 0; i < n; i++) {
      char c = s[i];
      int d = c >= '0' && c <= '9' ? c - '0' : c >= 'a' && c <= 'f' ? c - 'a' + 10 : c >= 'A' && c <= 'F' ? c - 'A' + 10 : -1;
      if (d >= 0) v = v * 16 + (uint32_t)d;
    }
    return v & 0xFFFFFF;
  }
  int32_t comp(int32_t arr) {
    Comp cp = {(int32_t)A.layers.n, 0};
    for (int32_t c = arr >= 0 ? J.v[arr].first : -1; c >= 0; c = J.v[c].next) {
      Layer L; memset(&L, 0, sizeof L);
      animated = false;
      L.ty = (uint8_t)J.num(c, "ty", -1);
      L.hidden = J.num(c, "hd", 0) != 0;
      L.matte = J.num(c, "td", 0) != 0;
      L.ind = (int32_t)J.num(c, "ind", -1);
      L.parent = (int32_t)J.num(c, "parent", -1);
      L.ip = (float)J.num(c, "ip", 0); L.op = (float)J.num(c, "op", 1e9);
      L.st = (float)J.num(c, "st", 0); L.sr = (float)J.num(c, "sr", 1);
      if (L.sr == 0) L.sr = 1;
      L.tr = transform(J.get(c, "ks"));
      L.comp = -1; L.items = 0;
      if (L.ty == L_SHAPE) { int32_t n = 0; L.items = items(J.get(c, "shapes"), &n, nullptr); L.nitems = n; }
      if (L.ty == L_SOLID) {
        L.w = (float)J.num(c, "sw", 0); L.h = (float)J.num(c, "sh", 0);
        int32_t sc = J.get(c, "sc");
        if (sc >= 0 && J.v[sc].t == JSTR) L.color = hex(J.v[sc].s, J.v[sc].sl);
      }
      if (L.ty == L_PRECOMP) {
        L.w = (float)J.num(c, "w", 0); L.h = (float)J.num(c, "h", 0);
        int32_t ref = J.get(c, "refId");
        for (uint32_t i = 0; ref >= 0 && i < asset_ids.n; i++) {
          const JV& a = J.v[asset_ids[i]];
          if (a.sl == J.v[ref].sl && !memcmp(a.s, J.v[ref].s, a.sl)) L.comp = asset_comp[i];
        }
        int32_t tm = J.get(c, "tm");
        if (tm >= 0) { L.tm = prop(tm); L.has_tm = true; }
        animated = true;  // ponytail: precomps are keyed by time even when their content is static
      }
      int32_t mp = J.get(c, "masksProperties");
      L.masks = (int32_t)A.masks.n;
      for (int32_t m = mp >= 0 ? J.v[mp].first : -1; m >= 0; m = J.v[m].next) {
        int32_t mode = J.get(m, "mode");
        Mask k; k.mode = mode >= 0 && J.v[mode].sl ? (uint8_t)J.v[mode].s[0] : 'a';
        if (J.num(m, "inv", 0) != 0) k.mode = 'n';  // ponytail: inverted masks are ignored
        k.pt = prop(J.get(m, "pt"));
        A.masks.push(k); L.nmasks++;
      }
      L.animated = animated;
      A.layers.push(L); cp.n++;
    }
    // resolve parents (by ind within the comp) and inherit animation from the parent chain
    for (int32_t i = 0; i < cp.n; i++) {
      Layer& L = A.layers[(uint32_t)(cp.layers + i)];
      int32_t want = L.parent; L.parent = -1;
      for (int32_t k = 0; want >= 0 && k < cp.n; k++) if (A.layers[(uint32_t)(cp.layers + k)].ind == want && k != i) L.parent = cp.layers + k;
    }
    for (int32_t i = 0; i < cp.n; i++) {
      Layer& L = A.layers[(uint32_t)(cp.layers + i)];
      for (int32_t p = L.parent, d = 0; p >= 0 && d < 32; p = A.layers[(uint32_t)p].parent, d++) if (A.layers[(uint32_t)p].animated) L.animated = true;
    }
    A.comps.push(cp);
    return (int32_t)A.comps.n - 1;
  }
};

// ---------------------------------------------------------------- evaluation
struct Mat { float a, b, c, d, e, f; };  // x' = a x + c y + e, y' = b x + d y + f
static const Mat IDENT = {1, 0, 0, 1, 0, 0};
static Mat mul(const Mat& m, const Mat& n) {
  return Mat{m.a * n.a + m.c * n.b, m.b * n.a + m.d * n.b, m.a * n.c + m.c * n.d, m.b * n.c + m.d * n.d,
             m.a * n.e + m.c * n.f + m.e, m.b * n.e + m.d * n.f + m.f};
}
static inline void apply(const Mat& m, float x, float y, float* o) { o[0] = m.a * x + m.c * y + m.e; o[1] = m.b * x + m.d * y + m.f; }
static inline float mscale(const Mat& m) { return sqrtf(fabsf(m.a * m.d - m.b * m.c)); }

static float bez1(float a, float b, float s) { float m = 1 - s; return 3 * m * m * s * a + 3 * m * s * s * b + s * s * s; }
/** CSS-style cubic-bezier easing (0,0) (ox,oy) (ix,iy) (1,1) at progress u. */
static float ease(float ox, float oy, float ix, float iy, float u) {
  if (ox == oy && ix == iy) return u;
  float s = u;
  for (int k = 0; k < 8; k++) {
    float x = bez1(ox, ix, s) - u;
    float m = 1 - s, dx = 3 * m * m * ox + 6 * m * s * (ix - ox) + 3 * s * s * (1 - ix);
    if (fabsf(x) < 1e-5f) break;
    if (fabsf(dx) < 1e-6f) { // bisection fallback
      float lo = 0, hi = 1;
      for (int q = 0; q < 20; q++) { s = (lo + hi) * 0.5f; if (bez1(ox, ix, s) < u) lo = s; else hi = s; }
      break;
    }
    s -= x / dx;
    if (s < 0) s = 0; if (s > 1) s = 1;
  }
  return bez1(oy, iy, s);
}
/** Value of `p` at time t into out[dim]. Returns false for a missing property (out untouched). */
static bool eval(const Anim& A, const Prop& p, float t, float* out) {
  if (!p.dim) return false;
  const float* d = A.pool.p + p.off;
  if (!p.nk) { memcpy(out, d, p.dim * sizeof(float)); return true; }
  const uint32_t S = KEY + p.dim;
  const float* last = d + (p.nk - 1) * S;
  if (p.nk == 1 || t <= d[0]) { memcpy(out, d + KEY, p.dim * sizeof(float)); return true; }
  if (t >= last[0]) { memcpy(out, last + KEY, p.dim * sizeof(float)); return true; }
  uint32_t i = 0;
  while (i + 2 < p.nk && t >= d[(i + 1) * S]) i++;
  const float *k0 = d + i * S, *k1 = k0 + S;
  if (k0[1] != 0 || k1[0] <= k0[0]) { memcpy(out, k0 + KEY, p.dim * sizeof(float)); return true; }
  float u = (t - k0[0]) / (k1[0] - k0[0]);
  float e = ease(k0[2], k0[3], k0[4], k0[5], u);
  const float *a = k0 + KEY, *b = k1 + KEY;
  for (uint32_t j = 0; j < p.dim; j++) out[j] = a[j] + (b[j] - a[j]) * e;
  if (p.dim >= 2 && (k0[6] != 0 || k0[7] != 0 || k0[8] != 0 || k0[9] != 0)) {
    // spatial bezier (position paths), parametrized by arc length through a 16-sample table
    float c1x = a[0] + k0[6], c1y = a[1] + k0[7], c2x = b[0] + k0[8], c2y = b[1] + k0[9];
    float len[17]; len[0] = 0;
    float px = a[0], py = a[1];
    auto pt = [&](float s, float* o) {
      float m = 1 - s, w0 = m * m * m, w1 = 3 * m * m * s, w2 = 3 * m * s * s, w3 = s * s * s;
      o[0] = w0 * a[0] + w1 * c1x + w2 * c2x + w3 * b[0]; o[1] = w0 * a[1] + w1 * c1y + w2 * c2y + w3 * b[1];
    };
    for (int k = 1; k <= 16; k++) { float q[2]; pt(k / 16.0f, q); len[k] = len[k - 1] + sqrtf((q[0] - px) * (q[0] - px) + (q[1] - py) * (q[1] - py)); px = q[0]; py = q[1]; }
    float target = e * len[16], s = e;
    if (len[16] > 0) {
      int k = 1; while (k < 16 && len[k] < target) k++;
      float seg = len[k] - len[k - 1];
      s = ((k - 1) + (seg > 0 ? (target - len[k - 1]) / seg : 0)) / 16.0f;
    }
    pt(s, out);
  }
  return true;
}
static float eval1(const Anim& A, const Prop& p, float t, float def) { float v[16]; return p.dim && p.dim <= 16 && eval(A, p, t, v) ? v[0] : def; }
static void eval2(const Anim& A, const Prop& p, float t, float* o, float d0, float d1) {
  float v[16];
  o[0] = d0; o[1] = d1;
  if (!p.dim || p.dim > 16) return;
  eval(A, p, t, v);
  o[0] = v[0]; o[1] = p.dim >= 2 ? v[1] : v[0];
}
static Mat tr_mat(const Anim& A, const Tr& tr, float t, float* opacity) {
  float an[2], p[2], s[2];
  eval2(A, tr.a, t, an, 0, 0);
  if (tr.split) { p[0] = eval1(A, tr.px, t, 0); p[1] = eval1(A, tr.py, t, 0); } else eval2(A, tr.p, t, p, 0, 0);
  eval2(A, tr.s, t, s, 100, 100);
  float r = eval1(A, tr.r, t, 0) * 0.017453292f;
  if (opacity) *opacity = eval1(A, tr.o, t, 100) / 100;
  float cs = cosf(r), sn = sinf(r), sx = s[0] / 100, sy = s[1] / 100;
  Mat m = {cs * sx, sn * sx, -sn * sy, cs * sy, 0, 0};
  m.e = p[0] - (m.a * an[0] + m.c * an[1]);
  m.f = p[1] - (m.b * an[0] + m.d * an[1]);
  return m;
}
static uint32_t rgb(const float* c) {
  float k = (c[0] > 1 || c[1] > 1 || c[2] > 1) ? 1 : 255;  // old exports use 0..255
  uint32_t out = 0;
  for (int i = 0; i < 3; i++) { float v = c[i] * k; out = (out << 8) | (uint32_t)(v < 0 ? 0 : v > 255 ? 255 : v + 0.5f); }
  return out;
}

// ---------------------------------------------------------------- geometry (device space)
// Polylines are stored like gfx.path contours: [count, x0, y0, ...] pieces. An instance is one generated path
// (1 piece; 0..2 after trims) with a closed flag.
struct Inst { uint32_t off, len; bool closed; float box[5]; };  // box: device x, y, w, h, radius of an axis-aligned rect (w < 0: none)
static Vec<float> G;      // instance pieces
static Vec<Inst> I;
struct Op { int32_t item; uint32_t i0, i1; float alpha; Mat m; };
static Vec<Op> OPS;
static Vec<float> BEZ, T2;  // scratch

static float TOL = 0.25f;  // flattening tolerance in device px

static void piece_point(Vec<float>& out, uint32_t head, float x, float y) {
  uint32_t cnt = (uint32_t)out[head];
  if (cnt) { float lx = out[out.n - 2], ly = out[out.n - 1]; if ((lx - x) * (lx - x) + (ly - y) * (ly - y) < 1e-4f) return; }
  float* d = out.add(2); d[0] = x; d[1] = y;
  out[head] = (float)(cnt + 1);
}
/** Bezier path [closed, (v, i, o) * n] (local coords) -> one piece in G. */
static void flatten(const float* v, uint32_t n, bool closed, const Mat& m) {
  uint32_t head = G.n; G.push(0);
  if (!n) return;
  float p0[2]; apply(m, v[0], v[1], p0);
  piece_point(G, head, p0[0], p0[1]);
  uint32_t segs = closed ? n : n - 1;
  for (uint32_t i = 0; i < segs; i++) {
    const float *a = v + i * 6, *b = v + ((i + 1) % n) * 6;
    float P0[2], C1[2], C2[2], P1[2];
    apply(m, a[0], a[1], P0); apply(m, a[0] + a[4], a[1] + a[5], C1);
    apply(m, b[0] + b[2], b[1] + b[3], C2); apply(m, b[0], b[1], P1);
    if (a[4] == 0 && a[5] == 0 && b[2] == 0 && b[3] == 0) { piece_point(G, head, P1[0], P1[1]); continue; }
    float ddx = fabsf(P0[0] - 2 * C1[0] + C2[0]) > fabsf(C1[0] - 2 * C2[0] + P1[0]) ? P0[0] - 2 * C1[0] + C2[0] : C1[0] - 2 * C2[0] + P1[0];
    float ddy = fabsf(P0[1] - 2 * C1[1] + C2[1]) > fabsf(C1[1] - 2 * C2[1] + P1[1]) ? P0[1] - 2 * C1[1] + C2[1] : C1[1] - 2 * C2[1] + P1[1];
    int k = (int)ceilf(sqrtf(sqrtf(ddx * ddx + ddy * ddy) * 0.75f / TOL));
    if (k < 1) k = 1; if (k > 64) k = 64;
    for (int q = 1; q <= k; q++) {
      float s = (float)q / k, m1 = 1 - s, w0 = m1 * m1 * m1, w1 = 3 * m1 * m1 * s, w2 = 3 * m1 * s * s, w3 = s * s * s;
      piece_point(G, head, w0 * P0[0] + w1 * C1[0] + w2 * C2[0] + w3 * P1[0], w0 * P0[1] + w1 * C1[1] + w2 * C2[1] + w3 * P1[1]);
    }
  }
  // closed: drop the duplicate end point
  uint32_t cnt = (uint32_t)G[head];
  if (closed && cnt > 1 && fabsf(G[head + 1] - G[G.n - 2]) < 1e-3f && fabsf(G[head + 2] - G[G.n - 1]) < 1e-3f) { G.n -= 2; G[head] = (float)(cnt - 1); }
}
static void push_inst(uint32_t off, bool closed) { I.push(Inst{off, G.n - off, closed, {0, 0, -1, 0, 0}}); }

static const float KAPPA = 0.5522848f;
static void bez_vertex(float x, float y, float ix, float iy, float ox, float oy) { float* d = BEZ.add(6); d[0] = x; d[1] = y; d[2] = ix; d[3] = iy; d[4] = ox; d[5] = oy; }
/** Reverses a bezier vertex list in BEZ (direction 3 = counter-clockwise). */
static void bez_reverse() {
  uint32_t n = BEZ.n / 6;
  for (uint32_t i = 0; i < n / 2; i++) for (int k = 0; k < 6; k++) { float t = BEZ[i * 6 + k]; BEZ[i * 6 + k] = BEZ[(n - 1 - i) * 6 + k]; BEZ[(n - 1 - i) * 6 + k] = t; }
  for (uint32_t i = 0; i < n; i++) { float* d = BEZ.p + i * 6; float tx = d[2], ty = d[3]; d[2] = d[4]; d[3] = d[5]; d[4] = tx; d[5] = ty; }
}
static void gen_shape(const Anim& A, const Item& it, float t, const Mat& m) {
  BEZ.n = 0;
  bool closed = true;
  if (it.ty == PATH) {
    const Prop& p = it.p[0];
    if (p.dim < 1) return;
    float* v = BEZ.add(p.dim);
    eval(A, p, t, v);
    closed = v[0] != 0;
    uint32_t n = (p.dim - 1) / 6;
    uint32_t off = G.n;
    flatten(v + 1, n, closed, m);
    push_inst(off, closed);
    return;
  }
  float pos[2], sz[2];
  eval2(A, it.p[0], t, pos, 0, 0);
  if (it.ty == RECT) {
    eval2(A, it.p[1], t, sz, 0, 0);
    float w = sz[0] / 2, h = sz[1] / 2, r = eval1(A, it.p[2], t, 0);
    if (r > w) r = w; if (r > h) r = h;
    float L = pos[0] - w, R = pos[0] + w, T = pos[1] - h, B = pos[1] + h, k = r * KAPPA;
    if (r <= 0) { bez_vertex(R, T, 0, 0, 0, 0); bez_vertex(R, B, 0, 0, 0, 0); bez_vertex(L, B, 0, 0, 0, 0); bez_vertex(L, T, 0, 0, 0, 0); }
    else {
      bez_vertex(R, T + r, 0, -k, 0, 0); bez_vertex(R, B - r, 0, 0, 0, k);
      bez_vertex(R - r, B, k, 0, 0, 0); bez_vertex(L + r, B, 0, 0, -k, 0);
      bez_vertex(L, B - r, 0, k, 0, 0); bez_vertex(L, T + r, 0, 0, 0, -k);
      bez_vertex(L + r, T, -k, 0, 0, 0); bez_vertex(R - r, T, 0, 0, k, 0);
    }
  } else if (it.ty == ELLIPSE) {
    eval2(A, it.p[1], t, sz, 0, 0);
    float w = sz[0] / 2, h = sz[1] / 2, kx = w * KAPPA, ky = h * KAPPA, x = pos[0], y = pos[1];
    bez_vertex(x, y - h, -kx, 0, kx, 0); bez_vertex(x + w, y, 0, -ky, 0, ky);
    bez_vertex(x, y + h, kx, 0, -kx, 0); bez_vertex(x - w, y, 0, ky, 0, -ky);
  } else if (it.ty == STAR) {  // ponytail: roundness (os/is) ignored
    float orad = eval1(A, it.p[1], t, 0), irad = eval1(A, it.p[2], t, 0), pts = eval1(A, it.p[3], t, 5), rot = eval1(A, it.p[4], t, 0);
    int n = (int)pts; if (n < 2) n = 2; if (n > 200) n = 200;
    bool star = it.a != 2;
    int verts = star ? n * 2 : n;
    float step = 6.2831853f / verts, a0 = (rot - 90) * 0.017453292f;
    for (int i = 0; i < verts; i++) {
      float rr = star && (i & 1) ? irad : orad, ang = a0 + step * i;
      bez_vertex(pos[0] + cosf(ang) * rr, pos[1] + sinf(ang) * rr, 0, 0, 0, 0);
    }
  }
  if (it.dir == 3) bez_reverse();
  uint32_t off = G.n;
  flatten(BEZ.p, BEZ.n / 6, closed, m);
  push_inst(off, closed);
  if (it.ty == RECT && m.b == 0 && m.c == 0 && fabsf(fabsf(m.a) - fabsf(m.d)) < 1e-3f) {  // drawn as a rounded-rect command
    float p0[2], p1[2];
    apply(m, pos[0] - sz[0] / 2, pos[1] - sz[1] / 2, p0); apply(m, pos[0] + sz[0] / 2, pos[1] + sz[1] / 2, p1);
    float* b = I[I.n - 1].box;
    b[0] = p0[0] < p1[0] ? p0[0] : p1[0]; b[1] = p0[1] < p1[1] ? p0[1] : p1[1];
    b[2] = fabsf(p1[0] - p0[0]); b[3] = fabsf(p1[1] - p0[1]);
    float r = eval1(A, it.p[2], t, 0) * fabsf(m.a);
    b[4] = r;
  }
}

// ---------------------------------------------------------------- trim paths
static float piece_len(const float* p, uint32_t n, bool closed) {
  float L = 0;
  uint32_t segs = closed ? n : (n ? n - 1 : 0);
  for (uint32_t i = 0; i < segs; i++) { const float *a = p + i * 2, *b = p + ((i + 1) % n) * 2; L += sqrtf((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
  return L;
}
static float inst_len(const Inst& in) {
  float L = 0;
  for (uint32_t o = in.off; o < in.off + in.len;) { uint32_t n = (uint32_t)G[o]; L += piece_len(G.p + o + 1, n, in.closed); o += 1 + n * 2; }
  return L;
}
/** Appends to T2 the part [a, b] (lengths) of the instance as open pieces; `join` continues the last piece. */
static uint32_t T2_LAST;
static void extract(const Inst& in, float a, float b, bool join) {
  float acc = 0;
  for (uint32_t o = in.off; o < in.off + in.len;) {
    uint32_t n = (uint32_t)G[o];
    const float* p = G.p + o + 1;
    uint32_t segs = in.closed ? n : (n ? n - 1 : 0), head;
    if (join && T2.n) head = T2_LAST; else { head = T2.n; T2.push(0); }
    join = false;
    for (uint32_t i = 0; i < segs; i++) {
      const float *s = p + i * 2, *e = p + ((i + 1) % n) * 2;
      float len = sqrtf((e[0] - s[0]) * (e[0] - s[0]) + (e[1] - s[1]) * (e[1] - s[1]));
      if (len > 0 && acc + len >= a && acc <= b) {
        float t0 = (a - acc) / len, t1 = (b - acc) / len;
        if (t0 < 0) t0 = 0; if (t1 > 1) t1 = 1;
        piece_point(T2, head, s[0] + (e[0] - s[0]) * t0, s[1] + (e[1] - s[1]) * t0);
        piece_point(T2, head, s[0] + (e[0] - s[0]) * t1, s[1] + (e[1] - s[1]) * t1);
      }
      acc += len;
    }
    if ((uint32_t)T2[head] == 0 && head + 1 == T2.n) T2.n = head; else T2_LAST = head;
    o += 1 + n * 2;
  }
}
static void trim(const Anim& A, const Item& it, float t, uint32_t i0, uint32_t i1) {
  float s = eval1(A, it.p[0], t, 0) / 100, e = eval1(A, it.p[1], t, 100) / 100, o = eval1(A, it.p[2], t, 0) / 360;
  if (s > e) { float x = s; s = e; e = x; }
  if (s <= 0 && e >= 1) return;
  s += o; e += o;
  float k = floorf(s); s -= k; e -= k;
  // up to two intervals in [0, 1]
  float iv[4] = {s, e > 1 ? 1 : e, 0, e > 1 ? e - 1 : -1};
  float total = 0;
  if (it.a == 2) for (uint32_t i = i0; i < i1; i++) total += inst_len(I[i]);
  float acc = 0;
  for (uint32_t i = i0; i < i1; i++) {
    Inst in = I[i];
    float L = inst_len(in);
    T2.n = 0;
    for (int q = 0; q < 2; q++) {
      float a = iv[q * 2], b = iv[q * 2 + 1];
      if (b <= a) continue;
      if (it.a == 2) {  // individually: the paths form one sequence
        float ga = a * total - acc, gb = b * total - acc;
        if (ga < 0) ga = 0; if (gb > L) gb = L;
        if (gb > ga) extract(in, ga, gb, false);
      } else extract(in, a * L, b * L, q == 1 && in.closed && iv[0] > 0);
    }
    acc += L;
    uint32_t off = G.n;
    float* d = G.add(T2.n);
    if (T2.n) memcpy(d, T2.p, T2.n * sizeof(float));
    I[i] = Inst{off, T2.n, false, {0, 0, -1, 0, 0}};
  }
}

// ---------------------------------------------------------------- strokes: one outline per polyline
// Left side forward, cap, right side backward, cap (open) or two loops (closed): 2 edges per vertex instead of a
// quad and a disc per segment, so the rasterizer walks far fewer edges. Joins: miter (with limit), round, bevel.
// Sharp inner turns (the inner offset would overshoot a segment) fall back to raster::stroke_contours (round).
static Vec<float> SD, FB;
static void arc(Vec<float>& out, uint32_t head, float cx, float cy, float r, float a0, float da) {
  float step = r > TOL ? 2 * acosf(1 - TOL / r) : 1.0f;
  int k = (int)ceilf(fabsf(da) / (step > 0.05f ? step : 0.05f));
  if (k < 1) k = 1; if (k > 32) k = 32;
  for (int i = 0; i <= k; i++) { float a = a0 + da * i / k; piece_point(out, head, cx + cosf(a) * r, cy + sinf(a) * r); }
}
static void join_pts(Vec<float>& out, uint32_t head, const float* P, const float* n0, const float* n1, float s, float hw, int join, float ml, bool rev) {
  float dot = n0[0] * n1[0] + n0[1] * n1[1], cross = n0[0] * n1[1] - n0[1] * n1[0];
  bool outer = s * cross < 0;
  float mx = (n0[0] + n1[0]) / (1 + dot), my = (n0[1] + n1[1]) / (1 + dot);
  if (!outer || dot > 0.999f || (join == 1 && sqrtf(2 / (1 + dot)) <= ml)) { piece_point(out, head, P[0] + s * hw * mx, P[1] + s * hw * my); return; }
  const float *u = rev ? n1 : n0, *v = rev ? n0 : n1;
  if (join == 2) {
    float a0 = atan2f(s * u[1], s * u[0]), a1 = atan2f(s * v[1], s * v[0]), da = a1 - a0;
    while (da > 3.14159265f) da -= 6.2831853f; while (da < -3.14159265f) da += 6.2831853f;
    arc(out, head, P[0], P[1], hw, a0, da);
  } else { piece_point(out, head, P[0] + s * hw * u[0], P[1] + s * hw * u[1]); piece_point(out, head, P[0] + s * hw * v[0], P[1] + s * hw * v[1]); }
}
static void stroke_piece(const float* p, uint32_t n, bool closed, float hw, int cap, int join, float ml, Vec<float>& out) {
  if (closed && n < 3) closed = false;
  if (n < 2) {
    if (n == 1 && cap == 2) { uint32_t h = out.n; out.push(0); arc(out, h, p[0], p[1], hw, 0, 6.2831853f); }
    return;
  }
  uint32_t segs = closed ? n : n - 1;
  SD.n = 0;
  for (uint32_t i = 0; i < segs; i++) {
    const float *a = p + i * 2, *b = p + ((i + 1) % n) * 2;
    float dx = b[0] - a[0], dy = b[1] - a[1], len = sqrtf(dx * dx + dy * dy);
    float* d = SD.add(3);
    if (len <= 0) { d[0] = 1; d[1] = 0; d[2] = 0; } else { d[0] = -dy / len; d[1] = dx / len; d[2] = len; }  // left normal, length
  }
  // inner offset must stay within both neighbouring segments
  bool ok = true;
  for (uint32_t j = closed ? 0 : 1; ok && j < (closed ? n : n - 1); j++) {
    const float *a = SD.p + ((j + segs - 1) % segs) * 3, *b = SD.p + (j % segs) * 3;
    float dot = a[0] * b[0] + a[1] * b[1];
    if (dot < -0.95f) { ok = false; break; }
    float tn = sqrtf((1 - dot) / (1 + dot));
    if (hw * tn > (a[2] < b[2] ? a[2] : b[2])) ok = false;
  }
  if (!ok) {
    uint32_t cnt = n > 1500 ? 1500 : n;
    FB.n = 0; FB.reserve(cnt * 45 + 64);
    uint32_t r = zrt::raster::stroke_contours(p, cnt, hw * 2, closed, FB.p, FB.cap);
    uint32_t used = r >> 16;
    float* d = out.add(used);
    memcpy(d, FB.p, used * sizeof(float));
    return;
  }
  if (closed) {
    for (int side = 1; side >= -1; side -= 2) {
      uint32_t h = out.n; out.push(0);
      for (uint32_t q = 0; q < n; q++) {
        uint32_t j = side > 0 ? q : n - 1 - q;
        join_pts(out, h, p + j * 2, SD.p + ((j + segs - 1) % segs) * 3, SD.p + (j % segs) * 3, (float)side, hw, join, ml, side < 0);
      }
    }
    return;
  }
  uint32_t h = out.n; out.push(0);
  const float *n0 = SD.p, *nl = SD.p + (segs - 1) * 3;
  float ext0 = cap == 3 ? hw : 0;
  const float *P0 = p, *PL = p + (n - 1) * 2;
  // start/end points, pushed out by half the width for square caps (direction = (n.y, -n.x))
  float s0[2] = {P0[0] - n0[1] * ext0, P0[1] + n0[0] * ext0}, e0[2] = {PL[0] + nl[1] * ext0, PL[1] - nl[0] * ext0};
  piece_point(out, h, s0[0] + hw * n0[0], s0[1] + hw * n0[1]);
  for (uint32_t j = 1; j + 1 < n; j++) join_pts(out, h, p + j * 2, SD.p + (j - 1) * 3, SD.p + j * 3, 1, hw, join, ml, false);
  piece_point(out, h, e0[0] + hw * nl[0], e0[1] + hw * nl[1]);
  if (cap == 2) arc(out, h, PL[0], PL[1], hw, atan2f(nl[1], nl[0]), -3.14159265f);
  piece_point(out, h, e0[0] - hw * nl[0], e0[1] - hw * nl[1]);
  for (uint32_t j = n - 2; j >= 1; j--) join_pts(out, h, p + j * 2, SD.p + (j - 1) * 3, SD.p + j * 3, -1, hw, join, ml, true);
  piece_point(out, h, s0[0] - hw * n0[0], s0[1] - hw * n0[1]);
  if (cap == 2) arc(out, h, P0[0], P0[1], hw, atan2f(-n0[1], -n0[0]), -3.14159265f);
}

// ---------------------------------------------------------------- painting into an op buffer
// Op buffer: [1, color, alpha, nfloats, contours...] path | [2, x, y, w, h] clip | [3] unclip
enum { OP_PATH = 1, OP_CLIP = 2, OP_UNCLIP = 3, OP_RECT = 4 };  // rect: [4, color, alpha, x, y, w, h, r, color2, grad]
static void emit_rect(Vec<float>& out, uint32_t color, float alpha, float x, float y, float w, float h, float r, uint32_t c2 = 0, int grad = 0) {
  float* d = out.add(10); d[0] = OP_RECT; d[1] = (float)color; d[2] = alpha; d[3] = x; d[4] = y; d[5] = w; d[6] = h; d[7] = r; d[8] = (float)c2; d[9] = (float)grad;
}
// fill_poly walks every edge of a command for every sub-scanline of its box: big paths with many edges (strokes of
// large circles) are cut into 16-row bands, each its own command with only its own edges. Clipping each contour to a
// horizontal strip keeps nonzero winding, and bands meet on pixel rows, so they tile without seams.
static Vec<float> BAND, CA, CB;
static void clip_half(const float* p, uint32_t n, float lim, bool below, Vec<float>& out) {
  out.n = 0;
  for (uint32_t i = 0; i < n; i++) {
    const float *a = p + i * 2, *b = p + ((i + 1) % n) * 2;
    bool ia = below ? a[1] <= lim : a[1] >= lim, ib = below ? b[1] <= lim : b[1] >= lim;
    if (ia) { float* d = out.add(2); d[0] = a[0]; d[1] = a[1]; }
    if (ia != ib) { float u = (lim - a[1]) / (b[1] - a[1]); float* d = out.add(2); d[0] = a[0] + (b[0] - a[0]) * u; d[1] = lim; }
  }
}
static void band_split(Vec<float>& out, uint32_t head) {
  const uint32_t nf = (uint32_t)out[head + 3];
  float y0 = 1e9f, y1 = -1e9f;
  uint32_t edges = 0;
  for (uint32_t o = head + 4; o < head + 4 + nf;) {
    uint32_t cnt = (uint32_t)out[o];
    for (uint32_t k = 0; k < cnt; k++) { float y = out[o + 2 + k * 2]; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    edges += cnt; o += 1 + cnt * 2;
  }
  float rows = y1 - y0;
  if (rows < 48 || rows * edges < 30000) return;
  BAND.n = 0;
  float* src = BAND.add(nf + 4);
  memcpy(src, out.p + head, (nf + 4) * sizeof(float));
  out.n = head;
  for (float yb = floorf(y0); yb < y1; yb += 16) {
    uint32_t h = out.n;
    float* hd = out.add(4); hd[0] = OP_PATH; hd[1] = BAND[1]; hd[2] = BAND[2];
    for (uint32_t o = 4; o < nf + 4;) {
      uint32_t cnt = (uint32_t)BAND[o];
      const float* c = BAND.p + o + 1;
      o += 1 + cnt * 2;
      bool any = false;
      for (uint32_t k = 0; k < cnt && !any; k++) any = c[k * 2 + 1] > yb && c[k * 2 + 1] < yb + 16;
      if (!any) {  // no vertex in the band: keep the contour only if it spans it
        float lo = 1e9f, hi = -1e9f;
        for (uint32_t k = 0; k < cnt; k++) { if (c[k * 2 + 1] < lo) lo = c[k * 2 + 1]; if (c[k * 2 + 1] > hi) hi = c[k * 2 + 1]; }
        if (hi <= yb || lo >= yb + 16) continue;
      }
      clip_half(c, cnt, yb, false, CA);
      clip_half(CA.p, CA.n / 2, yb + 16, true, CB);
      if (CB.n < 6) continue;
      out.push((float)(CB.n / 2));
      float* d = out.add(CB.n);
      memcpy(d, CB.p, CB.n * sizeof(float));
    }
    out[h + 3] = (float)(out.n - h - 4);
    if (out.n == h + 4) out.n = h;
  }
}
static void emit_clip(Vec<float>& out, const float* bb) { float* d = out.add(5); d[0] = OP_CLIP; d[1] = bb[0]; d[2] = bb[1]; d[3] = bb[2] - bb[0]; d[4] = bb[3] - bb[1]; }
static void bbox_add(float* bb, float x, float y) { if (x < bb[0]) bb[0] = x; if (y < bb[1]) bb[1] = y; if (x > bb[2]) bb[2] = x; if (y > bb[3]) bb[3] = y; }

/** Gradient colour at u in [0, 1] ([pos, r, g, b] * stops). */
static uint32_t gradient_at(const float* g, uint32_t stops, float x) {
  uint32_t i = 0; while (i + 1 < stops && g[(i + 1) * 4] < x) i++;
  const float *a = g + i * 4, *b = g + (i + 1 < stops ? i + 1 : i) * 4;
  float u = b[0] > a[0] ? (x - a[0]) / (b[0] - a[0]) : 0; if (u < 0) u = 0; if (u > 1) u = 1;
  float c[3];
  for (int k = 0; k < 3; k++) c[k] = a[1 + k] + (b[1 + k] - a[1 + k]) * u;
  return rgb(c);
}
/** Average colour and opacity of a gradient (then [pos, a] * m opacity stops). ponytail: gradients on paths are
 *  painted flat with their average colour (rects get a real two-colour gradient): per-pixel gradients on paths
 *  would need rasterizer support. */
static uint32_t gradient_avg(const float* g, uint32_t dim, uint32_t stops, float* alpha) {
  if (stops < 1 || stops * 4 > dim) { *alpha = 1; return 0; }
  float acc[3] = {0, 0, 0};
  for (int k = 0; k < 16; k++) {
    uint32_t c = gradient_at(g, stops, (k + 0.5f) / 16);
    for (int q = 0; q < 3; q++) acc[q] += ((c >> (16 - q * 8)) & 255) / 255.0f / 16;
  }
  float al = 1;
  uint32_t m = (dim - stops * 4) / 2;
  if (m) { al = 0; for (uint32_t i = 0; i < m; i++) al += g[stops * 4 + i * 2 + 1] / m; }
  *alpha = al;
  return rgb(acc);
}
static void paint(const Anim& A, const Op& op, float t, Vec<float>& out) {
  const Item& it = A.items[(uint32_t)op.item];
  float c[64] = {0, 0, 0, 1};
  uint32_t color = 0;
  float alpha = op.alpha * eval1(A, it.p[1], t, 100) / 100;
  if (it.ty == FILL || it.ty == STROKE) { if (it.p[0].dim <= 64) eval(A, it.p[0], t, c); color = rgb(c); }
  else {
    const Prop& g = it.p[0];
    if (!g.dim) return;
    BEZ.n = 0; float* v = BEZ.add(g.dim); eval(A, g, t, v);
    float ga; color = gradient_avg(v, g.dim, it.a, &ga); alpha *= ga;
    // linear gradient along x or y on an axis-aligned rect: the rasterizer's two-colour rect gradient
    if (it.ty == GFILL && it.b == 1 && op.i1 == op.i0 + 1 && I[op.i0].box[2] >= 0 && it.a * 4 <= g.dim) {
      float s2[2], e2[2], S[2], E[2];
      eval2(A, it.p[2], t, s2, 0, 0); eval2(A, it.p[3], t, e2, 0, 0);
      apply(op.m, s2[0], s2[1], S); apply(op.m, e2[0], e2[1], E);
      float dx = E[0] - S[0], dy = E[1] - S[1], L2 = dx * dx + dy * dy;
      const float* b = I[op.i0].box;
      bool vert = fabsf(dx) < 0.05f * fabsf(dy), horiz = fabsf(dy) < 0.05f * fabsf(dx);
      int a8 = (int)(alpha * 255 + 0.5f);
      if (L2 > 0 && (vert || horiz) && a8 > 0) {
        float p0x = vert ? S[0] : b[0], p0y = vert ? b[1] : S[1], p1x = vert ? S[0] : b[0] + b[2], p1y = vert ? b[1] + b[3] : S[1];
        float u0 = ((p0x - S[0]) * dx + (p0y - S[1]) * dy) / L2, u1 = ((p1x - S[0]) * dx + (p1y - S[1]) * dy) / L2;
        emit_rect(out, gradient_at(v, it.a, u0), (float)(a8 > 255 ? 255 : a8), b[0], b[1], b[2], b[3], b[4], gradient_at(v, it.a, u1), vert ? 1 : 2);
        return;
      }
    }
  }
  int a8 = (int)(alpha * 255 + 0.5f);
  if (a8 <= 0) return;
  uint32_t head = out.n;
  float* h = out.add(4); h[0] = OP_PATH; h[1] = (float)color; h[2] = (float)(a8 > 255 ? 255 : a8);
  if ((it.ty == FILL || it.ty == GFILL) && op.i1 == op.i0 + 1 && I[op.i0].box[2] >= 0) {
    const float* b = I[op.i0].box;
    out.n = head;
    emit_rect(out, color, (float)(a8 > 255 ? 255 : a8), b[0], b[1], b[2], b[3], b[4]);
    return;
  }
  if (it.ty == FILL || it.ty == GFILL) {
    for (uint32_t i = op.i0; i < op.i1; i++) {
      const Inst& in = I[i];
      float* d = out.add(in.len);
      if (in.len) memcpy(d, G.p + in.off, in.len * sizeof(float));
    }
  } else {
    float w = eval1(A, it.ty == STROKE ? it.p[2] : it.p[4], t, 1) * mscale(op.m);
    if (w <= 0) { out.n = head; return; }
    if (w < 0.5f) { out[head + 2] = out[head + 2] * w * 2; w = 0.5f; }  // hairlines: thinner = fainter
    int cap = it.ty == STROKE ? it.a : it.dir & 15, join = it.ty == STROKE ? it.b : it.dir >> 4;
    for (uint32_t i = op.i0; i < op.i1; i++) {
      const Inst& in = I[i];
      for (uint32_t o = in.off; o < in.off + in.len;) {
        uint32_t n = (uint32_t)G[o];
        stroke_piece(G.p + o + 1, n, in.closed, w / 2, cap, join, it.ml, out);
        o += 1 + n * 2;
      }
    }
  }
  out[head + 3] = (float)(out.n - head - 4);
  if (out.n == head + 4) { out.n = head; return; }
  band_split(out, head);
}

static void walk(const Anim& A, int32_t list, int32_t n, const Mat& m, float alpha, float t);
static void walk_range(const Anim& A, int32_t list, int32_t from, int32_t to, const Mat& m, float alpha, float t, uint32_t start) {
  for (int32_t k = from; k < to; k++) {
    const int32_t idx = A.lists[(uint32_t)(list + k)];
    const Item& it = A.items[(uint32_t)idx];
    if (it.hidden) continue;
    switch (it.ty) {
      case GROUP: {
        float o = 1;
        Mat g = it.tr >= 0 ? mul(m, tr_mat(A, A.trs[(uint32_t)it.tr], t, &o)) : m;
        if (o > 0) walk(A, it.kids, it.nkids, g, alpha * o, t);
        break;
      }
      case PATH: case RECT: case ELLIPSE: case STAR: gen_shape(A, it, t, m); break;
      case FILL: case STROKE: case GFILL: case GSTROKE: OPS.push(Op{idx, start, I.n, alpha, m}); break;
      case TRIM: trim(A, it, t, start, I.n); break;
      default: break;
    }
  }
}
static void walk(const Anim& A, int32_t list, int32_t n, const Mat& m, float alpha, float t) {
  uint32_t start = I.n;
  int32_t rep = n;
  for (int32_t k = 0; k < n; k++) { const Item& it = A.items[(uint32_t)A.lists[(uint32_t)(list + k)]]; if (it.ty == REPEATER && !it.hidden) { rep = k; break; } }
  if (rep == n) { walk_range(A, list, 0, n, m, alpha, t, start); return; }
  // repeater: the items above it are drawn `copies` times, each copy one more step of its transform
  const Item& r = A.items[(uint32_t)A.lists[(uint32_t)(list + rep)]];
  const Tr& tr = A.trs[(uint32_t)r.tr];
  int copies = (int)ceilf(eval1(A, r.p[0], t, 1)); if (copies > 256) copies = 256;
  float offset = eval1(A, r.p[1], t, 0), so = eval1(A, tr.so, t, 100) / 100, eo = eval1(A, tr.eo, t, 100) / 100;
  Mat step = tr_mat(A, tr, t, nullptr);
  for (int q = 0; q < copies; q++) {
    int i = r.b == 2 ? q : copies - 1 - q;  // recorded ops paint in reverse: "above" puts later copies on top
    Mat mi = IDENT;
    float k = i + offset;
    for (int s = 0; s < (int)fabsf(k) && s < 256; s++) mi = mul(mi, step);  // ponytail: integer steps (fractional offsets round down)
    float op = copies > 1 ? so + (eo - so) * i / (copies - 1) : so;
    walk_range(A, list, 0, rep, mul(m, mi), alpha * op, t, start);
  }
  walk_range(A, list, rep + 1, n, m, alpha, t, start);
}

// Layer properties are keyed in comp time (lottie-web ignores a layer's st/sr for them); st and sr only shift
// and stretch the inner time of a precomp.
static Mat world(const Anim& A, const Layer& L, float t) {
  Mat m = tr_mat(A, A.trs[(uint32_t)L.tr], t, nullptr);
  int depth = 0;
  for (int32_t p = L.parent; p >= 0 && depth < 32; depth++) {
    const Layer& P = A.layers[(uint32_t)p];
    m = mul(tr_mat(A, A.trs[(uint32_t)P.tr], t, nullptr), m);
    p = P.parent;
  }
  return m;
}
static void render_comp(const Anim& A, int32_t comp, float t, const Mat& view, float alpha, Vec<float>& out);
/** One layer at comp time t into `out`. */
static void render_layer(const Anim& A, const Layer& L, float t, const Mat& view, float alpha, Vec<float>& out) {
  float tl = t, o = 1;
  tr_mat(A, A.trs[(uint32_t)L.tr], tl, &o);
  float a = alpha * o;
  if (a <= 0.002f) return;
  Mat m = mul(view, world(A, L, t));
  // clip: additive masks (bounding box) and precomp bounds
  int clips = 0;
  float bb[4] = {1e9f, 1e9f, -1e9f, -1e9f};
  for (int32_t k = 0; k < L.nmasks; k++) {
    const Mask& mk = A.masks[(uint32_t)(L.masks + k)];
    if (mk.mode != 'a' || mk.pt.dim < 1) continue;
    BEZ.n = 0; float* v = BEZ.add(mk.pt.dim); eval(A, mk.pt, tl, v);
    for (uint32_t i = 0; i < (mk.pt.dim - 1u) / 6; i++) { float q[2]; apply(m, v[1 + i * 6], v[2 + i * 6], q); bbox_add(bb, q[0], q[1]); }
  }
  if (bb[0] < bb[2]) { emit_clip(out, bb); clips++; }
  if (L.ty == L_PRECOMP && L.comp >= 0) {
    float r[4] = {1e9f, 1e9f, -1e9f, -1e9f}, q[2];
    apply(m, 0, 0, q); bbox_add(r, q[0], q[1]); apply(m, L.w, 0, q); bbox_add(r, q[0], q[1]);
    apply(m, 0, L.h, q); bbox_add(r, q[0], q[1]); apply(m, L.w, L.h, q); bbox_add(r, q[0], q[1]);
    emit_clip(out, r); clips++;
    float ti = L.has_tm ? eval1(A, L.tm, tl, 0) * (float)A.fr : (t - L.st) / L.sr;
    render_comp(A, L.comp, ti, m, a, out);
  } else if (L.ty == L_SOLID) {
    int a8 = (int)(a * 255 + 0.5f);
    if (m.b == 0 && m.c == 0) {
      float p0[2], p1[2]; apply(m, 0, 0, p0); apply(m, L.w, L.h, p1);
      emit_rect(out, L.color, (float)a8, p0[0] < p1[0] ? p0[0] : p1[0], p0[1] < p1[1] ? p0[1] : p1[1], fabsf(p1[0] - p0[0]), fabsf(p1[1] - p0[1]), 0);
      while (clips--) out.push(OP_UNCLIP);
      return;
    }
    float* d = out.add(4 + 9);
    d[0] = OP_PATH; d[1] = (float)L.color; d[2] = (float)a8; d[3] = 9; d[4] = 4;
    apply(m, 0, 0, d + 5); apply(m, L.w, 0, d + 7); apply(m, L.w, L.h, d + 9); apply(m, 0, L.h, d + 11);
  } else if (L.ty == L_SHAPE) {
    G.n = 0; I.n = 0; OPS.n = 0;
    walk(A, L.items, L.nitems, m, a, tl);
    for (uint32_t k = OPS.n; k-- > 0;) paint(A, OPS[k], tl, out);
  }
  while (clips--) out.push(OP_UNCLIP);
}
static void render_comp(const Anim& A, int32_t comp, float t, const Mat& view, float alpha, Vec<float>& out) {
  static int depth = 0;
  if (comp < 0 || depth > 16) return;
  depth++;
  const Comp& c = A.comps[(uint32_t)comp];
  for (int32_t i = c.n - 1; i >= 0; i--) {
    const Layer& L = A.layers[(uint32_t)(c.layers + i)];
    if (L.hidden || L.matte || L.ty == L_NULL || t < L.ip || t >= L.op) continue;
    render_layer(A, L, t, view, alpha, out);
  }
  depth--;
}

// scratch array for gfx::path, reused across frames; released at exit so the debug leak report stays clean
static zrt::Array<double> replay_arr;
static void replay_release() { replay_arr = zrt::Array<double>(); }
static void replay(const Vec<float>& ops, int32_t alpha) {
  if (!replay_arr.a) { replay_arr = zrt::Array<double>::with_cap(1024); zrt::at_finish(replay_release); }
  zrt::Array<double>& arr = replay_arr;
  for (uint32_t i = 0; i < ops.n;) {
    int kind = (int)ops[i];
    if (kind == OP_PATH) {
      uint32_t nf = (uint32_t)ops[i + 3];
      arr.set_length(0);
      for (uint32_t k = 0; k < nf; k++) arr.push_raw(ops[i + 4 + k]);
      zrt::gfx::path(arr, (uint32_t)ops[i + 1], (int32_t)ops[i + 2] * alpha / 255);
      i += 4 + nf;
    } else if (kind == OP_RECT) {
      int32_t a8 = (int32_t)ops[i + 2] * alpha / 255;
      if (ops[i + 9] != 0) zrt::gfx::gradient(ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6], ops[i + 7], (uint32_t)ops[i + 1], (uint32_t)ops[i + 8], ops[i + 9] == 1, a8);
      else zrt::gfx::rrect(ops[i + 3], ops[i + 4], ops[i + 5], ops[i + 6], ops[i + 7], (uint32_t)ops[i + 1], a8);
      i += 10;
    } else if (kind == OP_CLIP) { zrt::gfx::clip(ops[i + 1], ops[i + 2], ops[i + 3], ops[i + 4]); i += 5; }
    else { zrt::gfx::unclip(); i++; }
  }
}

static const int MAX_ANIMS = 64;
static Anim* anims[MAX_ANIMS];
static Anim* at(int32_t a) { return a >= 0 && a < MAX_ANIMS ? anims[a] : nullptr; }

static void destroy(Anim* A) {
  A->pool.release(); A->items.release(); A->lists.release(); A->trs.release(); A->layers.release(); A->masks.release(); A->comps.release();
  for (uint32_t i = 0; i < A->cache.n; i++) A->cache[i].ops.release();
  A->cache.release();
  free(A);
}
static int32_t build(const char* text, uint32_t len) {
  int32_t slot = -1;
  for (int32_t i = 0; i < MAX_ANIMS; i++) if (!anims[i]) { slot = i; break; }
  if (slot < 0) return -1;
  Json J; J.p = text; J.end = text + len;
  int32_t root = J.value(0);
  if (J.bad || root < 0 || J.v[root].t != JOBJ || J.get(root, "layers") < 0) { J.v.release(); return -1; }
  Anim* A = (Anim*)calloc(1, sizeof(Anim));
  A->w = J.num(root, "w", 0); A->h = J.num(root, "h", 0);
  A->ip = J.num(root, "ip", 0); A->op = J.num(root, "op", 0); A->fr = J.num(root, "fr", 30);
  Builder B{J, *A};
  int32_t assets = J.get(root, "assets");
  for (int32_t c = assets >= 0 ? J.v[assets].first : -1; c >= 0; c = J.v[c].next) {
    int32_t ls = J.get(c, "layers"), id = J.get(c, "id");
    if (ls < 0 || id < 0 || J.v[id].t != JSTR) continue;
    B.asset_ids.push(id); B.asset_comp.push((int32_t)B.asset_comp.n);  // comp i is built from asset i below
  }
  for (int32_t c = assets >= 0 ? J.v[assets].first : -1; c >= 0; c = J.v[c].next) {
    int32_t ls = J.get(c, "layers"), id = J.get(c, "id");
    if (ls >= 0 && id >= 0 && J.v[id].t == JSTR) B.comp(ls);
  }
  A->root = B.comp(J.get(root, "layers"));
  B.tmp.release(); B.asset_ids.release(); B.asset_comp.release();
  J.v.release();
  const Comp& rc = A->comps[(uint32_t)A->root];
  A->cache.reserve((uint32_t)rc.n);
  A->cache.n = (uint32_t)rc.n;
  memset(A->cache.p, 0, rc.n * sizeof(Cache));
  anims[slot] = A;
  return slot;
}

}  // namespace

struct LottieImpl : NativeLottie {
  int32_t parse(zrt::String json) override { return build(json.ptr(), json.bytes()); }
  int32_t open(zrt::String path) override {
    char name[512];
    uint32_t n = path.bytes() < sizeof name - 1 ? path.bytes() : sizeof name - 1;
    memcpy(name, path.ptr(), n); name[n] = 0;
    FILE* f = fopen(name, "rb");
    if (!f) return -1;
    fseek(f, 0, SEEK_END); long size = ftell(f); fseek(f, 0, SEEK_SET);
    char* buf = size > 0 ? (char*)::malloc((size_t)size) : nullptr;
    int32_t r = buf && fread(buf, 1, (size_t)size, f) == (size_t)size ? build(buf, (uint32_t)size) : -1;
    ::free(buf); fclose(f);
    return r;
  }
  double width(int32_t a) override { Anim* A = at(a); return A ? A->w : 0; }
  double height(int32_t a) override { Anim* A = at(a); return A ? A->h : 0; }
  double frames(int32_t a) override { Anim* A = at(a); return A ? A->op - A->ip : 0; }
  double fps(int32_t a) override { Anim* A = at(a); return A ? A->fr : 0; }
  int32_t layers(int32_t a) override { Anim* A = at(a); return A ? A->comps[(uint32_t)A->root].n : 0; }
  void draw(int32_t a, double frame, double x, double y, double w, double h, int32_t alpha) override {
    Anim* A = at(a);
    if (!A || A->w <= 0 || A->h <= 0 || w <= 0 || h <= 0 || alpha <= 0) return;
    float t = (float)(A->ip + frame), ip = (float)A->ip, op = (float)A->op;
    if (t > op - 0.001f) t = op - 0.001f;
    if (t < ip) t = ip;
    double s = w / A->w < h / A->h ? w / A->w : h / A->h;
    Mat view = {(float)s, 0, 0, (float)s, (float)(x + (w - A->w * s) / 2), (float)(y + (h - A->h * s) / 2)};
    zrt::gfx::clip(view.e, view.f, A->w * s, A->h * s);
    const Comp& c = A->comps[(uint32_t)A->root];
    for (int32_t i = c.n - 1; i >= 0; i--) {
      const Layer& L = A->layers[(uint32_t)(c.layers + i)];
      if (L.hidden || L.matte || L.ty == L_NULL || t < L.ip || t >= L.op) continue;
      Cache& C = A->cache[(uint32_t)i];
      float key[6] = {L.animated ? t : -1, (float)x, (float)y, (float)w, (float)h, 0};
      if (!C.ok || memcmp(key, C.key, sizeof key)) {
        C.ops.n = 0;
        render_layer(*A, L, t, view, 1, C.ops);
        memcpy(C.key, key, sizeof key); C.ok = true;
      }
      replay(C.ops, alpha);
    }
    zrt::gfx::unclip();
  }
  void free(int32_t a) override { Anim* A = at(a); if (A) { destroy(A); anims[a] = nullptr; } }
};

NativeLottie* zinc_create_Lottie() {
  static LottieImpl impl;
  impl.rc = zrt::IMMORTAL;
  return &impl;
}
