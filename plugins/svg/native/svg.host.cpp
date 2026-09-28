// zinc:svg engine: SVG 1.1 static subset -> display list of flattened contours (document units), drawn through the
// shared rasterizer at any size. Parsing happens once; drawing only transforms points and strokes outlines.
// Supported and unsupported features: docs/plugins/svg.md.
#include "zinc_native_svgengine.h"
#include "zrt_raster.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <ctype.h>
#include <strings.h>

using namespace zrt;
namespace {

template<class T> struct Vec {  // POD only
  T* p = nullptr; uint32_t n = 0, cap = 0;
  void reserve(uint32_t c) { if (c <= cap) return; uint32_t k = cap ? cap : 16; while (k < c) k *= 2; p = (T*)realloc(p, (size_t)k * sizeof(T)); cap = k; }
  void push(const T& v) { if (n == cap) reserve(n + 1); p[n++] = v; }
  T& operator[](uint32_t i) const { return p[i]; }
  void release() { free(p); p = nullptr; n = cap = 0; }
};

// ---------------------------------------------------------------- XML
struct Attr { const char* k; const char* v; };
struct Node { const char* tag; uint32_t attr0, nattr, parent; const char* text; };
struct Xml { char* buf; Vec<Node> nodes; Vec<Attr> attrs; };

static bool sp(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }
static void unescape(char* s) {  // entities, in place
  char* o = s;
  while (*s) {
    if (*s != '&') { *o++ = *s++; continue; }
    const char* e = strchr(s, ';');
    if (!e || e - s > 8) { *o++ = *s++; continue; }
    if (!strncmp(s, "&amp;", 5)) *o++ = '&';
    else if (!strncmp(s, "&lt;", 4)) *o++ = '<';
    else if (!strncmp(s, "&gt;", 4)) *o++ = '>';
    else if (!strncmp(s, "&quot;", 6)) *o++ = '"';
    else if (!strncmp(s, "&apos;", 6)) *o++ = '\'';
    else if (s[1] == '#') { long c = s[2] == 'x' ? strtol(s + 3, nullptr, 16) : strtol(s + 2, nullptr, 10); *o++ = c < 128 ? (char)c : '?'; }
    s = (char*)e + 1;
  }
  *o = 0;
}
static bool parse_xml(Xml& x) {
  char* p = x.buf;
  Vec<uint32_t> stack;
  x.nodes.push(Node{"#root", 0, 0, 0, nullptr});
  stack.push(0);
  while (*p) {
    char* lt = strchr(p, '<');
    if (!lt) break;
    Node& top = x.nodes[stack[stack.n - 1]];
    if (lt > p && !top.text && !strcmp(top.tag, "style")) { top.text = p; *lt = 0; }  // style text
    p = lt + 1;
    if (!strncmp(p, "!--", 3)) { char* e = strstr(p, "-->"); if (!e) break; p = e + 3; continue; }
    if (!strncmp(p, "![CDATA[", 8)) {
      char* e = strstr(p, "]]>"); if (!e) break;
      Node& t = x.nodes[stack[stack.n - 1]];
      if (!t.text) t.text = p + 8;
      *e = 0; p = e + 3; continue;
    }
    if (*p == '?' || *p == '!') { char* e = strchr(p, '>'); if (!e) break; p = e + 1; continue; }
    if (*p == '/') { char* e = strchr(p, '>'); if (!e) break; p = e + 1; if (stack.n > 1) stack.n--; continue; }
    Node nd{p, x.attrs.n, 0, stack[stack.n - 1], nullptr};
    while (*p && !sp(*p) && *p != '>' && *p != '/') p++;
    bool selfclose = false, end = false;
    auto term = [&](char*& q) { if (*q == '>') end = true; else if (*q == '/') selfclose = true; if (*q) *q++ = 0; };
    term(p);
    while (!end && *p) {
      while (sp(*p)) p++;
      if (*p == '/') { selfclose = true; p++; continue; }
      if (*p == '>') { end = true; p++; break; }
      char* k = p;
      while (*p && *p != '=' && !sp(*p) && *p != '>') p++;
      char* ke = p;
      while (sp(*p)) p++;
      if (*p != '=') { *ke = 0; continue; }
      p++;
      while (sp(*p)) p++;
      char q = *p;
      if (q != '"' && q != '\'') return false;
      char* v = ++p;
      while (*p && *p != q) p++;
      if (!*p) return false;
      *p++ = 0; *ke = 0;
      unescape(v);
      x.attrs.push(Attr{k, v}); nd.nattr++;
    }
    x.nodes.push(nd);
    if (!selfclose) stack.push(x.nodes.n - 1);
  }
  stack.release();
  return x.nodes.n > 1;
}
static const char* attr(const Xml& x, const Node& n, const char* k) {
  for (uint32_t i = 0; i < n.nattr; i++) if (!strcmp(x.attrs[n.attr0 + i].k, k)) return x.attrs[n.attr0 + i].v;
  return nullptr;
}
static const char* local(const char* tag) { const char* c = strchr(tag, ':'); return c ? c + 1 : tag; }  // svg:path -> path

// ---------------------------------------------------------------- values
static const char* skip(const char* s) { while (sp(*s) || *s == ',') s++; return s; }
/** Number (SVG grammar: "1.5.5" is two numbers, "-1-2" too). */
static bool num(const char*& s, float& v) {
  s = skip(s);
  const char* b = s;
  if (*s == '+' || *s == '-') s++;
  bool dot = false, dig = false;
  while ((*s >= '0' && *s <= '9') || (*s == '.' && !dot)) { if (*s == '.') dot = true; else dig = true; s++; }
  if (!dig) { s = b; return false; }
  if ((*s == 'e' || *s == 'E') && (s[1] == '-' || s[1] == '+' || (s[1] >= '0' && s[1] <= '9'))) { s += 2; while (*s >= '0' && *s <= '9') s++; }
  v = strtof(b, nullptr);
  return true;
}
static float fnum(const char* s, float def) { float v; return s && num(s, v) ? v : def; }
struct Named { const char* n; uint32_t c; };
static const Named NAMED[] = {
  {"black", 0x000000}, {"white", 0xffffff}, {"red", 0xff0000}, {"green", 0x008000}, {"blue", 0x0000ff}, {"yellow", 0xffff00},
  {"orange", 0xffa500}, {"purple", 0x800080}, {"gray", 0x808080}, {"grey", 0x808080}, {"silver", 0xc0c0c0}, {"maroon", 0x800000},
  {"navy", 0x000080}, {"teal", 0x008080}, {"olive", 0x808000}, {"lime", 0x00ff00}, {"aqua", 0x00ffff}, {"cyan", 0x00ffff},
  {"fuchsia", 0xff00ff}, {"magenta", 0xff00ff}, {"pink", 0xffc0cb}, {"brown", 0xa52a2a}, {"gold", 0xffd700}, {"indigo", 0x4b0082},
  {"violet", 0xee82ee}, {"tomato", 0xff6347}, {"coral", 0xff7f50}, {"salmon", 0xfa8072}, {"khaki", 0xf0e68c}, {"crimson", 0xdc143c},
  {"skyblue", 0x87ceeb}, {"steelblue", 0x4682b4}, {"darkgreen", 0x006400}, {"darkblue", 0x00008b}, {"darkred", 0x8b0000},
  {"darkgray", 0xa9a9a9}, {"darkgrey", 0xa9a9a9}, {"lightgray", 0xd3d3d3}, {"lightgrey", 0xd3d3d3}, {"lightblue", 0xadd8e6},
  {"lightgreen", 0x90ee90}, {"forestgreen", 0x228b22}, {"seagreen", 0x2e8b57}, {"royalblue", 0x4169e1}, {"orangered", 0xff4500},
  {"chocolate", 0xd2691e}, {"tan", 0xd2b48c}, {"beige", 0xf5f5dc}, {"ivory", 0xfffff0}, {"wheat", 0xf5deb3}, {"turquoise", 0x40e0d0},
  {"slategray", 0x708090}, {"dimgray", 0x696969}, {"whitesmoke", 0xf5f5f5}, {"gainsboro", 0xdcdcdc}, {"firebrick", 0xb22222},
};
static bool color(const char* s, uint32_t& out) {
  s = skip(s);
  if (*s == '#') {
    char h[9] = {0}; int n = 0;
    for (const char* q = s + 1; n < 8 && ((*q >= '0' && *q <= '9') || ((*q | 32) >= 'a' && (*q | 32) <= 'f')); q++) h[n++] = *q;
    uint32_t v = (uint32_t)strtoul(h, nullptr, 16);
    if (n == 3) v = ((v & 0xF00) * 0x1100) | ((v & 0xF0) * 0x110) | ((v & 0xF) * 0x11);
    else if (n == 8) v >>= 8;
    out = v; return true;
  }
  if (!strncmp(s, "rgb", 3)) {
    const char* q = strchr(s, '(');
    float c[3] = {0, 0, 0};
    if (q) q++;
    for (int i = 0; q && i < 3; i++) { num(q, c[i]); q = skip(q); if (*q == '%') { c[i] *= 2.55f; q++; } }
    out = ((uint32_t)c[0] & 255) << 16 | ((uint32_t)c[1] & 255) << 8 | ((uint32_t)c[2] & 255);
    return true;
  }
  for (const Named& n : NAMED) { size_t l = strlen(n.n); if (!strncasecmp(s, n.n, l) && !isalpha((unsigned char)s[l])) { out = n.c; return true; } }
  return false;
}

// ---------------------------------------------------------------- style state
struct M { float a, b, c, d, e, f; };
static M mul(const M& p, const M& q) { return M{p.a * q.a + p.c * q.b, p.b * q.a + p.d * q.b, p.a * q.c + p.c * q.d, p.b * q.c + p.d * q.d, p.a * q.e + p.c * q.f + p.e, p.b * q.e + p.d * q.f + p.f}; }
static M transform(const char* s) {
  M m{1, 0, 0, 1, 0, 0};
  while (s && *s) {
    s = skip(s);
    const char* name = s;
    while (*s && *s != '(') s++;
    if (!*s) break;
    size_t nl = (size_t)(s - name);
    while (nl && sp(name[nl - 1])) nl--;
    s++;
    float v[6] = {0, 0, 0, 0, 0, 0}; int n = 0;
    while (n < 6 && num(s, v[n])) n++;
    s = strchr(s, ')'); if (s) s++;
    M t{1, 0, 0, 1, 0, 0};
    if (!strncmp(name, "matrix", nl) && n == 6) t = M{v[0], v[1], v[2], v[3], v[4], v[5]};
    else if (!strncmp(name, "translate", nl)) t.e = v[0], t.f = n > 1 ? v[1] : 0;
    else if (!strncmp(name, "scale", nl)) t.a = v[0], t.d = n > 1 ? v[1] : v[0];
    else if (!strncmp(name, "rotate", nl)) {
      float r = v[0] * 3.14159265f / 180, cs = cosf(r), sn = sinf(r);
      t = M{cs, sn, -sn, cs, 0, 0};
      if (n == 3) t = mul(mul(M{1, 0, 0, 1, v[1], v[2]}, t), M{1, 0, 0, 1, -v[1], -v[2]});
    } else if (!strncmp(name, "skewX", nl)) t.c = tanf(v[0] * 3.14159265f / 180);
    else if (!strncmp(name, "skewY", nl)) t.b = tanf(v[0] * 3.14159265f / 180);
    m = mul(m, t);
  }
  return m;
}
enum { P_NONE, P_COLOR, P_URL, P_CURRENT };
struct Paint { uint8_t kind; uint32_t rgb; char url[48]; };
struct St {
  Paint fill, stroke;
  float fill_op, stroke_op, op, width, dash[8]; uint8_t ndash;
  bool evenodd, hidden;
  uint32_t color;
  M m;
};
static void paint(Paint& p, const char* v) {
  v = skip(v);
  if (!strncmp(v, "none", 4)) p.kind = P_NONE;
  else if (!strncmp(v, "currentColor", 12)) p.kind = P_CURRENT;
  else if (!strncmp(v, "url(", 4)) {
    const char* h = strchr(v, '#'); const char* e = h ? strchr(h, ')') : nullptr;
    if (h && e) { size_t l = (size_t)(e - h - 1) < 47 ? (size_t)(e - h - 1) : 47; memcpy(p.url, h + 1, l); p.url[l] = 0; p.kind = P_URL; }
  } else if (color(v, p.rgb)) p.kind = P_COLOR;
}
/** One presentation property (attribute or CSS declaration). */
static void prop(St& s, const char* k, size_t kl, const char* v) {
  auto is = [&](const char* n) { return strlen(n) == kl && !strncmp(k, n, kl); };
  if (is("fill")) paint(s.fill, v);
  else if (is("stroke")) paint(s.stroke, v);
  else if (is("fill-opacity")) s.fill_op = fnum(v, 1);
  else if (is("stroke-opacity")) s.stroke_op = fnum(v, 1);
  else if (is("opacity")) s.op *= fnum(v, 1);
  else if (is("stroke-width")) s.width = fnum(v, 1);
  else if (is("fill-rule")) s.evenodd = !strncmp(skip(v), "evenodd", 7);
  else if (is("color")) color(v, s.color);
  else if (is("display")) { if (!strncmp(skip(v), "none", 4)) s.hidden = true; }
  else if (is("visibility")) s.hidden = !strncmp(skip(v), "hidden", 6);
  else if (is("stroke-dasharray")) { s.ndash = 0; float d; while (s.ndash < 8 && num(v, d)) s.dash[s.ndash++] = d; if (s.ndash & 1 && s.ndash < 4) { for (int i = 0; i < s.ndash; i++) s.dash[s.ndash + i] = s.dash[i]; s.ndash *= 2; } }
}
/** "k: v; k: v" declarations. */
static void decls(St& s, const char* d) {
  char val[256];
  while (d && *d) {
    d = skip(d);
    const char* colon = strchr(d, ':');
    if (!colon) break;
    size_t kl = (size_t)(colon - d);
    while (kl && sp(d[kl - 1])) kl--;
    const char* v = colon + 1;
    const char* e = strchr(v, ';');
    size_t vl = e ? (size_t)(e - v) : strlen(v);
    if (vl > 255) vl = 255;
    memcpy(val, v, vl); val[vl] = 0;
    prop(s, d, kl, val);
    d = e ? e + 1 : nullptr;
  }
}

// ---------------------------------------------------------------- document
struct Item { uint32_t off, len; uint32_t c1, c2; uint8_t grad, alpha, evenodd, stroke; float width; };
struct Rule { const char* sel; uint32_t sl; const char* decl; };
struct Doc {
  Xml x;
  Vec<Rule> rules;
  Vec<float> pts;   // contours [count (negative: closed), x, y, ...] in document units
  Vec<Item> items;
  float vx, vy, vw, vh, w, h;
  uint8_t align_x, align_y, slice, none;  // preserveAspectRatio
  float ref;  // pixels per document unit assumed when flattening curves
};

static bool has_class(const char* list, const char* c, size_t cl) {
  for (const char* p = list; p && *p;) {
    p = skip(p);
    const char* e = p; while (*e && !sp(*e)) e++;
    if ((size_t)(e - p) == cl && !strncmp(p, c, cl)) return true;
    p = e;
  }
  return false;
}
/** Simple selectors: tag, .class, #id, tag.class, *. */
static bool matches(const Doc& d, const Node& n, const char* s, uint32_t l) {
  const char* dot = (const char*)memchr(s, '.', l), *hash = (const char*)memchr(s, '#', l);
  const char* stop = dot ? dot : hash ? hash : s + l;
  size_t tl = (size_t)(stop - s);
  if (tl && !(tl == 1 && *s == '*') && (strlen(local(n.tag)) != tl || strncmp(local(n.tag), s, tl))) return false;
  if (dot) { const char* c = attr(d.x, n, "class"); size_t cl = (size_t)(s + l - dot - 1); if (hash > dot) cl = (size_t)(hash - dot - 1); if (!c || !has_class(c, dot + 1, cl)) return false; }
  if (hash) { const char* id = attr(d.x, n, "id"); size_t il = (size_t)(s + l - hash - 1); if (dot > hash) il = (size_t)(dot - hash - 1); if (!id || strlen(id) != il || strncmp(id, hash + 1, il)) return false; }
  return true;
}
static void parse_css(Doc& d, char* css) {
  for (char* p = css; p && *p;) {
    char* ob = strchr(p, '{'); if (!ob) break;
    char* cb = strchr(ob, '}'); if (!cb) break;
    *ob = 0; *cb = 0;
    for (char* sel = p; sel && *sel;) {  // "a, .b"
      char* comma = strchr(sel, ',');
      char* e = comma ? comma : ob;
      while (sp(*sel)) sel++;
      char* t = e; while (t > sel && sp(t[-1])) t--;
      if (t > sel && !strchr(sel, '@')) d.rules.push(Rule{sel, (uint32_t)(t - sel), ob + 1});
      sel = comma ? comma + 1 : nullptr;
    }
    p = cb + 1;
  }
}
static int find_id(const Doc& d, const char* id) {
  for (uint32_t i = 1; i < d.x.nodes.n; i++) { const char* v = attr(d.x, d.x.nodes[i], "id"); if (v && !strcmp(v, id)) return (int)i; }
  return -1;
}
static const char* href(const Doc& d, const Node& n) {
  const char* h = attr(d.x, n, "href"); if (!h) h = attr(d.x, n, "xlink:href");
  return h && *h == '#' ? h + 1 : nullptr;
}

struct Builder {
  Doc& d;
  St s;
  uint32_t head = 0;
  bool sub = false;  // a subpath is open
  float cx = 0, cy = 0, bx0, by0, bx1, by1;
  explicit Builder(Doc& doc) : d(doc) {}
  void pt(float x, float y) {
    const M& m = s.m;
    float X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
    d.pts.push(X); d.pts.push(Y);
    d.pts[head] += d.pts[head] < 0 ? -1 : 1;
    if (X < bx0) bx0 = X; if (Y < by0) by0 = Y; if (X > bx1) bx1 = X; if (Y > by1) by1 = Y;
  }
  void move(float x, float y) { head = d.pts.n; d.pts.push(0); pt(x, y); cx = x; cy = y; sub = true; }
  void line(float x, float y) { pt(x, y); cx = x; cy = y; }
  void close() { if (sub && d.pts[head] > 0) d.pts[head] = -d.pts[head]; sub = false; }
  float scale() const { return sqrtf(fabsf(s.m.a * s.m.d - s.m.b * s.m.c)) * d.ref; }  // document px per user unit
  int segs(float len) { int n = (int)ceilf(sqrtf(len * scale()) * 0.8f); return n < 2 ? 2 : n > 128 ? 128 : n; }
  void cubic(float x1, float y1, float x2, float y2, float x, float y) {
    int n = segs(hypotf(x1 - cx, y1 - cy) + hypotf(x2 - x1, y2 - y1) + hypotf(x - x2, y - y2));
    float x0 = cx, y0 = cy;
    for (int i = 1; i <= n; i++) {
      float t = (float)i / n, u = 1 - t;
      pt(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y);
    }
    cx = x; cy = y;
  }
  void quad(float x1, float y1, float x, float y) {
    int n = segs(hypotf(x1 - cx, y1 - cy) + hypotf(x - x1, y - y1));
    float x0 = cx, y0 = cy;
    for (int i = 1; i <= n; i++) { float t = (float)i / n, u = 1 - t; pt(u * u * x0 + 2 * u * t * x1 + t * t * x, u * u * y0 + 2 * u * t * y1 + t * t * y); }
    cx = x; cy = y;
  }
  /** Elliptical arc, endpoint parameterization (SVG 1.1 F.6.5). */
  void arc(float rx, float ry, float rot, bool large, bool sweep, float x, float y) {
    rx = fabsf(rx); ry = fabsf(ry);
    if (!rx || !ry) { line(x, y); return; }
    float phi = rot * 3.14159265f / 180, cp = cosf(phi), sp_ = sinf(phi);
    float dx = (cx - x) / 2, dy = (cy - y) / 2, x1 = cp * dx + sp_ * dy, y1 = -sp_ * dx + cp * dy;
    float lam = x1 * x1 / (rx * rx) + y1 * y1 / (ry * ry);
    if (lam > 1) { float k = sqrtf(lam); rx *= k; ry *= k; }
    float num_ = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1, den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    float co = den > 0 ? sqrtf(fmaxf(0, num_ / den)) : 0;
    if (large == sweep) co = -co;
    float cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
    float ccx = cp * cxp - sp_ * cyp + (cx + x) / 2, ccy = sp_ * cxp + cp * cyp + (cy + y) / 2;
    float t1 = atan2f((y1 - cyp) / ry, (x1 - cxp) / rx), t2 = atan2f((-y1 - cyp) / ry, (-x1 - cxp) / rx), dt = t2 - t1;
    if (sweep && dt < 0) dt += 6.2831853f;
    if (!sweep && dt > 0) dt -= 6.2831853f;
    int n = segs(fabsf(dt) * (rx > ry ? rx : ry) * 1.2f);
    for (int i = 1; i <= n; i++) {
      float t = t1 + dt * i / n, ex = rx * cosf(t), ey = ry * sinf(t);
      pt(cp * ex - sp_ * ey + ccx, sp_ * ex + cp * ey + ccy);
    }
    cx = x; cy = y;
  }
  void path(const char* s) {
    char cmd = 0;
    sub = false;
    float sx = 0, sy = 0, lcx = 0, lcy = 0; char last = 0;
    for (;;) {
      s = skip(s);
      if (!*s) break;
      if (isalpha((unsigned char)*s)) cmd = *s++;
      else if (!cmd) break;
      bool rel = cmd >= 'a';
      char C = (char)(rel ? cmd - 32 : cmd);
      float ox = rel ? cx : 0, oy = rel ? cy : 0, v[7];
      auto get = [&](int n) { for (int i = 0; i < n; i++) if (!num(s, v[i])) return false; return true; };
      auto flag = [&](int i) { s = skip(s); if (*s != '0' && *s != '1') return false; v[i] = (float)(*s++ - '0'); return true; };
      if (C == 'Z') { close(); cx = sx; cy = sy; last = 'Z'; if (!isalpha((unsigned char)*skip(s)) && *skip(s)) cmd = 0; continue; }
      if (C == 'M') { if (!get(2)) break; move(v[0] + ox, v[1] + oy); sx = cx; sy = cy; cmd = rel ? 'l' : 'L'; last = 'M'; continue; }
      if (!sub) move(cx, cy);  // drawing after Z starts a new subpath at the current point
      if (C == 'L') { if (!get(2)) break; line(v[0] + ox, v[1] + oy); }
      else if (C == 'H') { if (!get(1)) break; line(v[0] + ox, cy); }
      else if (C == 'V') { if (!get(1)) break; line(cx, v[0] + oy); }
      else if (C == 'C') { if (!get(6)) break; lcx = v[2] + ox; lcy = v[3] + oy; cubic(v[0] + ox, v[1] + oy, lcx, lcy, v[4] + ox, v[5] + oy); }
      else if (C == 'S') {
        if (!get(4)) break;
        float x1 = last == 'C' || last == 'S' ? 2 * cx - lcx : cx, y1 = last == 'C' || last == 'S' ? 2 * cy - lcy : cy;
        lcx = v[0] + ox; lcy = v[1] + oy; cubic(x1, y1, lcx, lcy, v[2] + ox, v[3] + oy);
      } else if (C == 'Q') { if (!get(4)) break; lcx = v[0] + ox; lcy = v[1] + oy; quad(lcx, lcy, v[2] + ox, v[3] + oy); }
      else if (C == 'T') {
        if (!get(2)) break;
        lcx = last == 'Q' || last == 'T' ? 2 * cx - lcx : cx; lcy = last == 'Q' || last == 'T' ? 2 * cy - lcy : cy;
        quad(lcx, lcy, v[0] + ox, v[1] + oy);
      } else if (C == 'A') { if (!get(3) || !flag(3) || !flag(4) || !get(0) || !num(s, v[5]) || !num(s, v[6])) break; arc(v[0], v[1], v[2], v[3] != 0, v[4] != 0, v[5] + ox, v[6] + oy); }
      else break;
      last = C;
    }
  }
  void ellipse(float ex, float ey, float rx, float ry) {
    if (rx <= 0 || ry <= 0) return;
    int n = segs(6.2831853f * (rx > ry ? rx : ry) * 1.2f);
    if (n < 8) n = 8;
    move(ex + rx, ey);
    for (int i = 1; i < n; i++) pt(ex + rx * cosf(6.2831853f * i / n), ey + ry * sinf(6.2831853f * i / n));
    close();
  }
  void points(const char* p, bool closed) {
    float x, y; bool first = true;
    while (num(p, x) && num(p, y)) { if (first) move(x, y); else line(x, y); first = false; }
    if (closed && !first) close();
  }

  // ---- gradients
  void stops(int g, uint32_t& c1, uint32_t& c2, float& op, int depth = 0) {
    const Node& gn = d.x.nodes[g];
    int first = -1, last = -1, count = 0; float opsum = 0;
    for (uint32_t i = g + 1; i < d.x.nodes.n; i++) {
      const Node& n = d.x.nodes[i];
      if (n.parent != (uint32_t)g) { if (n.parent < (uint32_t)g) break; continue; }
      if (strcmp(local(n.tag), "stop")) continue;
      uint32_t col = 0; float so = 1;
      if (const char* v = attr(d.x, n, "stop-color")) color(v, col);
      if (const char* v = attr(d.x, n, "stop-opacity")) so = fnum(v, 1);
      if (const char* v = attr(d.x, n, "style")) {
        const char* sc = strstr(v, "stop-color"); if (sc && strchr(sc, ':')) color(strchr(sc, ':') + 1, col);
        const char* so_ = strstr(v, "stop-opacity"); if (so_ && strchr(so_, ':')) so = fnum(strchr(so_, ':') + 1, 1);
      }
      if (first < 0) { first = (int)i; c1 = col; }
      last = (int)i; c2 = col; opsum += so; count++;
    }
    (void)last;
    if (count) { op = opsum / count; return; }
    if (const char* h = href(d, gn)) { int r = find_id(d, h); if (r > 0 && depth < 4) stops(r, c1, c2, op, depth + 1); }
  }
  /** Paint -> item colors: solid, or a gradient approximated by its end stops along the dominant axis. */
  bool resolve(const Paint& p, Item& it, float& op) {
    if (p.kind == P_NONE) return false;
    if (p.kind == P_COLOR) { it.c1 = p.rgb; return true; }
    if (p.kind == P_CURRENT) { it.c1 = s.color; return true; }
    int g = find_id(d, p.url);
    if (g < 0) return false;
    const Node& gn = d.x.nodes[g];
    uint32_t c1 = 0, c2 = 0; float so = 1;
    stops(g, c1, c2, so, 0);
    op *= so;
    it.c1 = c1; it.c2 = c2;
    if (c1 == c2) return true;
    if (!strcmp(local(gn.tag), "radialGradient")) { it.grad = 3; return true; }
    float x1 = fnum(attr(d.x, gn, "x1"), 0), y1 = fnum(attr(d.x, gn, "y1"), 0), x2 = fnum(attr(d.x, gn, "x2"), 1), y2 = fnum(attr(d.x, gn, "y2"), 0);
    const char* units = attr(d.x, gn, "gradientUnits");
    float dx = x2 - x1, dy = y2 - y1;
    if (units && !strcmp(units, "userSpaceOnUse")) { float tx = s.m.a * dx + s.m.c * dy, ty = s.m.b * dx + s.m.d * dy; dx = tx; dy = ty; }
    else { dx *= bx1 - bx0; dy *= by1 - by0; }
    bool vertical = fabsf(dy) > fabsf(dx);
    it.grad = vertical ? 1 : 2;
    if ((vertical ? dy : dx) < 0) { it.c1 = c2; it.c2 = c1; }
    return true;
  }
  void emit(uint32_t start) {
    if (d.pts.n <= start) return;
    float a = s.op;
    Item f{start, d.pts.n - start, 0, 0, 0, 0, s.evenodd, 0, 0};
    float fo = s.fill_op;
    if (resolve(s.fill, f, fo)) { f.alpha = (uint8_t)(fminf(1, a * fo) * 255 + 0.5f); if (f.alpha) d.items.push(f); }
    Item k{start, d.pts.n - start, 0, 0, 0, 0, 0, 1, s.width * sqrtf(fabsf(s.m.a * s.m.d - s.m.b * s.m.c))};
    float so = s.stroke_op;
    if (s.width > 0 && resolve(s.stroke, k, so)) {
      k.alpha = (uint8_t)(fminf(1, a * so) * 255 + 0.5f);
      if (s.ndash) { k.off = d.pts.n; dashes(start, k.off, sqrtf(fabsf(s.m.a * s.m.d - s.m.b * s.m.c))); k.len = d.pts.n - k.off; }
      if (k.alpha && k.len) d.items.push(k);
    }
  }
  /** Splits the contours in [a, b) into dash segments (appended as open contours). */
  void dashes(uint32_t a, uint32_t b, float k) {
    float total = 0;
    for (int i = 0; i < s.ndash; i++) total += s.dash[i] * k;
    if (total <= 0) return;
    for (uint32_t i = a; i < b;) {
      int32_t cnt = (int32_t)d.pts[i]; bool closed = cnt < 0; uint32_t n = (uint32_t)(closed ? -cnt : cnt);
      uint32_t base = i + 1;
      int di = 0; float left = s.dash[0] * k; bool on = true; uint32_t head2 = 0; bool open = false;
      auto start = [&](float x, float y) { head2 = d.pts.n; d.pts.push(1); d.pts.push(x); d.pts.push(y); open = true; };
      auto add = [&](float x, float y) { d.pts.push(x); d.pts.push(y); d.pts[head2] += 1; };
      if (on) start(d.pts[base], d.pts[base + 1]);
      uint32_t segs_ = closed ? n : n - 1;
      for (uint32_t j = 0; j < segs_; j++) {
        float x0 = d.pts[base + j * 2], y0 = d.pts[base + j * 2 + 1];
        uint32_t jn = (j + 1) % n;
        float x1 = d.pts[base + jn * 2], y1 = d.pts[base + jn * 2 + 1];
        float len = hypotf(x1 - x0, y1 - y0), pos = 0;
        while (len - pos > left) {
          pos += left;
          float t = pos / len, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
          if (on) { add(x, y); open = false; } else start(x, y);
          on = !on; di = (di + 1) % s.ndash; left = s.dash[di] * k;
        }
        left -= len - pos;
        if (on && open) add(x1, y1);
      }
      i = base + n * 2;
    }
  }

  void node(uint32_t ni, int depth) {
    const Node& n = d.x.nodes[ni];
    const char* tag = local(n.tag);
    if (!strcmp(tag, "defs") || !strcmp(tag, "clipPath") || !strcmp(tag, "mask") || !strcmp(tag, "pattern") || !strcmp(tag, "symbol") ||
        !strcmp(tag, "linearGradient") || !strcmp(tag, "radialGradient") || !strcmp(tag, "marker") || !strcmp(tag, "style") ||
        !strcmp(tag, "title") || !strcmp(tag, "desc") || !strcmp(tag, "metadata") || !strcmp(tag, "text") || !strcmp(tag, "filter")) return;
    St saved = s;
    s.op = 1;
    // cascade: presentation attributes < <style> rules < style attribute
    for (uint32_t i = 0; i < n.nattr; i++) { const Attr& a = d.x.attrs[n.attr0 + i]; prop(s, a.k, strlen(a.k), a.v); }
    for (uint32_t r = 0; r < d.rules.n; r++) if (matches(d, n, d.rules[r].sel, d.rules[r].sl)) decls(s, d.rules[r].decl);
    if (const char* st = attr(d.x, n, "style")) decls(s, st);
    s.op *= saved.op;  // ponytail: group opacity multiplies into children (overlaps are not composited as a group)
    if (const char* t = attr(d.x, n, "transform")) s.m = mul(s.m, transform(t));
    if (s.hidden) { s = saved; return; }
    bx0 = by0 = 1e30f; bx1 = by1 = -1e30f;
    uint32_t start = d.pts.n;
    auto A = [&](const char* k, float def) { return fnum(attr(d.x, n, k), def); };
    if (!strcmp(tag, "path")) { if (const char* p = attr(d.x, n, "d")) path(p); emit(start); }
    else if (!strcmp(tag, "rect")) {
      float x = A("x", 0), y = A("y", 0), w = A("width", 0), h = A("height", 0);
      const char* arx = attr(d.x, n, "rx"), *ary = attr(d.x, n, "ry");
      float rx = fnum(arx ? arx : ary, 0), ry = fnum(ary ? ary : arx, 0);
      rx = fminf(rx, w / 2); ry = fminf(ry, h / 2);
      if (w > 0 && h > 0) {
        if (rx > 0 && ry > 0) {
          move(x + rx, y); line(x + w - rx, y); arc(rx, ry, 0, false, true, x + w, y + ry); line(x + w, y + h - ry);
          arc(rx, ry, 0, false, true, x + w - rx, y + h); line(x + rx, y + h); arc(rx, ry, 0, false, true, x, y + h - ry);
          line(x, y + ry); arc(rx, ry, 0, false, true, x + rx, y); close();
        } else { move(x, y); line(x + w, y); line(x + w, y + h); line(x, y + h); close(); }
      }
      emit(start);
    } else if (!strcmp(tag, "circle")) { float r = A("r", 0); ellipse(A("cx", 0), A("cy", 0), r, r); emit(start); }
    else if (!strcmp(tag, "ellipse")) { ellipse(A("cx", 0), A("cy", 0), A("rx", 0), A("ry", 0)); emit(start); }
    else if (!strcmp(tag, "line")) { move(A("x1", 0), A("y1", 0)); line(A("x2", 0), A("y2", 0)); Paint f = s.fill; s.fill.kind = P_NONE; emit(start); s.fill = f; }
    else if (!strcmp(tag, "polyline")) { if (const char* p = attr(d.x, n, "points")) points(p, false); emit(start); }
    else if (!strcmp(tag, "polygon")) { if (const char* p = attr(d.x, n, "points")) points(p, true); emit(start); }
    else if (!strcmp(tag, "use") && depth < 8) {
      const char* h = href(d, n);
      int r = h ? find_id(d, h) : -1;
      if (r > 0) {
        s.m = mul(s.m, M{1, 0, 0, 1, A("x", 0), A("y", 0)});
        if (!strcmp(local(d.x.nodes[r].tag), "symbol")) children((uint32_t)r, depth + 1); else node((uint32_t)r, depth + 1);
      }
    } else if (!strcmp(tag, "g") || !strcmp(tag, "svg") || !strcmp(tag, "a") || !strcmp(tag, "switch")) {
      if (!strcmp(tag, "svg") && depth > 0) s.m = mul(s.m, M{1, 0, 0, 1, A("x", 0), A("y", 0)});
      children(ni, depth);
    }
    s = saved;
  }
  void children(uint32_t ni, int depth) {
    for (uint32_t i = ni + 1; i < d.x.nodes.n; i++) {
      uint32_t p = d.x.nodes[i].parent;
      if (p == ni) node(i, depth);
      else if (p < ni) break;  // left the subtree (nodes are in document order)
    }
  }
};

static Vec<Doc*> docs;
static char err[128];

struct Engine : NativeSvgEngine {
  int32_t parse(zrt::String text) override {
    Doc* d = (Doc*)calloc(1, sizeof(Doc));
    d->x.buf = (char*)malloc(text.bytes() + 1);
    memcpy(d->x.buf, text.ptr(), text.bytes()); d->x.buf[text.bytes()] = 0;
    if (!parse_xml(d->x)) { strcpy(err, "svg: not an XML document"); release(d); return -1; }
    uint32_t root = 0;
    for (uint32_t i = 1; i < d->x.nodes.n && !root; i++) if (!strcmp(local(d->x.nodes[i].tag), "svg")) root = i;
    if (!root) { strcpy(err, "svg: no <svg> element"); release(d); return -1; }
    const Node& r = d->x.nodes[root];
    float w = fnum(attr(d->x, r, "width"), 0), h = fnum(attr(d->x, r, "height"), 0);
    const char* wa = attr(d->x, r, "width");
    if (wa && strchr(wa, '%')) w = 0;
    const char* vb = attr(d->x, r, "viewBox");
    float v[4] = {0, 0, w, h};
    if (vb) for (int i = 0; i < 4; i++) num(vb, v[i]);
    if (v[2] <= 0 || v[3] <= 0) { v[2] = w > 0 ? w : 100; v[3] = h > 0 ? h : 100; }
    d->vx = v[0]; d->vy = v[1]; d->vw = v[2]; d->vh = v[3];
    d->w = w > 0 ? w : h > 0 ? h * v[2] / v[3] : v[2];
    d->h = h > 0 ? h : d->w * v[3] / v[2];
    d->align_x = d->align_y = 1;
    if (const char* par = attr(d->x, r, "preserveAspectRatio")) {
      par = skip(par);
      if (!strncmp(par, "none", 4)) d->none = 1;
      else if (strlen(par) >= 8) { d->align_x = par[1] == 'M' && par[2] == 'i' && par[3] == 'n' ? 0 : par[2] == 'a' ? 2 : 1; d->align_y = par[5] == 'M' && par[6] == 'i' && par[7] == 'n' ? 0 : par[6] == 'a' ? 2 : 1; }
      d->slice = strstr(par, "slice") != nullptr;
    }
    float big = d->vw > d->vh ? d->vw : d->vh;
    d->ref = 512 / big < 1 ? 1 : 512 / big;  // flatten for up to ~512 px renderings
    for (uint32_t i = 1; i < d->x.nodes.n; i++) if (!strcmp(local(d->x.nodes[i].tag), "style") && d->x.nodes[i].text) parse_css(*d, (char*)d->x.nodes[i].text);
    Builder b(*d);
    b.s = St{}; b.s.fill.kind = P_COLOR; b.s.fill_op = b.s.stroke_op = b.s.op = 1; b.s.width = 1; b.s.m = M{1, 0, 0, 1, 0, 0};
    b.node(root, 0);
    for (uint32_t i = 0; i < docs.n; i++) if (!docs[i]) { docs[i] = d; return (int32_t)i; }
    docs.push(d);
    return (int32_t)docs.n - 1;
  }
  static void release(Doc* d) { free(d->x.buf); d->x.nodes.release(); d->x.attrs.release(); d->rules.release(); d->pts.release(); d->items.release(); free(d); }
  zrt::String error() override { return zrt::String::from(err, (uint32_t)strlen(err)); }
  static Doc* get(int32_t h) { return h >= 0 && (uint32_t)h < docs.n ? docs[h] : nullptr; }
  double width(int32_t h) override { Doc* d = get(h); return d ? d->w : 0; }
  double height(int32_t h) override { Doc* d = get(h); return d ? d->h : 0; }
  int32_t items(int32_t h) override { Doc* d = get(h); return d ? (int32_t)d->items.n : 0; }
  void dispose(int32_t h) override { if (Doc* d = get(h)) { release(d); docs[h] = nullptr; } }

  Vec<float> out, tmp;
  void draw(int32_t h, double x, double y, double w, double hh, int32_t alpha) override {
    Doc* d = get(h);
    if (!d || w <= 0 || hh <= 0) return;
    float sx = (float)w / d->vw, sy = (float)hh / d->vh, ox = (float)x, oy = (float)y;
    if (!d->none) {
      float s = d->slice ? fmaxf(sx, sy) : fminf(sx, sy);
      ox += ((float)w - d->vw * s) * d->align_x / 2; oy += ((float)hh - d->vh * s) * d->align_y / 2;
      sx = sy = s;
    }
    ox -= d->vx * sx; oy -= d->vy * sy;
    if (d->slice) gfx::clip(x, y, w, hh);
    float k = sqrtf(sx * sy);
    for (uint32_t ii = 0; ii < d->items.n; ii++) {
      const Item& it = d->items[ii];
      out.n = 0;
      float x0 = 1e30f, y0 = 1e30f, x1 = -1e30f, y1 = -1e30f;
      for (uint32_t i = it.off; i < it.off + it.len;) {
        int32_t cnt = (int32_t)d->pts[i]; bool closed = cnt < 0; uint32_t n = (uint32_t)(closed ? -cnt : cnt);
        tmp.n = 0; tmp.reserve(n * 2);
        for (uint32_t j = 0; j < n; j++) {
          float px = d->pts[i + 1 + j * 2] * sx + ox, py = d->pts[i + 2 + j * 2] * sy + oy;
          tmp.p[tmp.n++] = px; tmp.p[tmp.n++] = py;
          if (px < x0) x0 = px; if (py < y0) y0 = py; if (px > x1) x1 = px; if (py > y1) y1 = py;
        }
        if (it.stroke) stroke_into(tmp.p, n, it.width * k, closed);
        else if (n >= 3) { out.push((float)n); for (uint32_t j = 0; j < n * 2; j++) out.push(tmp.p[j]); }
        i += 1 + n * 2;
      }
      if (!out.n) continue;
      float pad = it.stroke ? it.width * k / 2 + 1 : 0;
      if (raster::Cmd* c = gfx::emit(raster::POLY, out.p, out.n)) {
        c->x = x0 - pad; c->y = y0 - pad; c->w = x1 - x0 + 2 * pad; c->h = y1 - y0 + 2 * pad;
        c->c1 = it.c1; c->c2 = it.c2; c->grad = it.grad; c->pad = it.evenodd;
        c->alpha = (uint8_t)(it.alpha * (alpha < 0 ? 0 : alpha > 255 ? 255 : alpha) / 255);
      }
    }
    if (d->slice) gfx::unclip();
  }
  /** Stroke outline (round joins and caps), long lines in chunks (stroke_contours packs sizes in 16 bits). */
  void stroke_into(const float* p, uint32_t n, float width, bool closed) {
    if (n < 2) return;
    const uint32_t CH = 1000;
    if (n > CH) {
      for (uint32_t i = 0; i + 1 < n; i += CH - 1) stroke_into(p + i * 2, n - i < CH ? n - i : CH, width, false);
      if (closed) { float seg[4] = {p[(n - 1) * 2], p[(n - 1) * 2 + 1], p[0], p[1]}; stroke_into(seg, 2, width, false); }
      return;
    }
    out.reserve(out.n + n * 42 + 16);
    out.n += raster::stroke_contours(p, n, width, closed, out.p + out.n, out.cap - out.n) >> 16;
  }
};

}  // namespace

NativeSvgEngine* zinc_create_SvgEngine() {
  static Engine e;
  e.rc = zrt::IMMORTAL;
  return &e;
}
