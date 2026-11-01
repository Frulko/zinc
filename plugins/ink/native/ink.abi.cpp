// zinc:ink's recogniser on the native ABI (include/zn/native.h): a point-cloud matcher in the $P/$Q family (Vatavu, Anthony and Wobbrock;
// University of Washington, depts.washington.edu/acelab/proj/dollar). Strokes are resampled to 32 points by arc length, scaled to a unit box
// (aspect kept: a letter is not rotation- or shape-invariant) and centred; the distance of two clouds is the greedy weighted nearest-point
// match from several start points, in both directions, abandoned early once it cannot beat the best so far ($Q's early abandoning).
// recog.ts is the TypeScript reference of the very same steps, in the same order: the results agree to the last digits.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>
#include "zinc_native_ink_abi.h"

namespace {
constexpr int N = 32;           // points of a cloud
constexpr int STEP = 5;         // floor(sqrt(N)): the start points tried
struct Cloud { double x[N], y[N]; };
struct Template { std::string label; Cloud c; };

const ZnHostApi* host;
std::mutex lock;
std::vector<Template> templates;   // immutable between add() calls; matching holds the lock

/** Strokes -> the normalised cloud. pts: x, y pairs; lens: points per stroke. */
Cloud normalise(const double* pts, const int32_t* lens, uint32_t nstrokes) {
  std::vector<double> px, py;
  std::vector<int> id;
  const double* p = pts;
  for (uint32_t s = 0; s < nstrokes; s++, p += 2 * (lens[s - 1] > 0 ? lens[s - 1] : 0))
    for (int32_t i = 0; i < lens[s]; i++) {
      if (!px.empty() && id.back() == (int)s && px.back() == p[2 * i] && py.back() == p[2 * i + 1]) continue;   // a repeated point adds nothing
      px.push_back(p[2 * i]); py.push_back(p[2 * i + 1]); id.push_back((int)s);
    }
  Cloud out;
  if (px.empty()) { for (int i = 0; i < N; i++) out.x[i] = out.y[i] = 0; return out; }
  double len = 0;
  for (size_t i = 1; i < px.size(); i++) if (id[i] == id[i - 1]) len += std::hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  std::vector<double> rx{px[0]}, ry{py[0]};
  if (len > 0) {
    const double I = len / (N - 1);
    double D = 0, qx = px[0], qy = py[0];
    for (size_t i = 1; i < px.size(); i++) {
      if (id[i] != id[i - 1]) { qx = px[i]; qy = py[i]; continue; }
      for (;;) {
        const double d = std::hypot(px[i] - qx, py[i] - qy);
        if (d <= 0) break;
        if (D + d >= I) { const double t = (I - D) / d; qx = qx + (px[i] - qx) * t; qy = qy + (py[i] - qy) * t; rx.push_back(qx); ry.push_back(qy); D = 0; }
        else { D += d; qx = px[i]; qy = py[i]; break; }
      }
    }
  }
  while ((int)rx.size() < N) { rx.push_back(px.back()); ry.push_back(py.back()); }   // the last point closes a cloud one short; a dot repeats itself
  rx.resize(N); ry.resize(N);
  double x0 = rx[0], x1 = rx[0], y0 = ry[0], y1 = ry[0];
  for (int i = 1; i < N; i++) { x0 = std::min(x0, rx[i]); x1 = std::max(x1, rx[i]); y0 = std::min(y0, ry[i]); y1 = std::max(y1, ry[i]); }
  double s = std::max(x1 - x0, y1 - y0);
  if (s <= 0) s = 1;
  double cx = 0, cy = 0;
  for (int i = 0; i < N; i++) { out.x[i] = (rx[i] - x0) / s; out.y[i] = (ry[i] - y0) / s; cx += out.x[i]; cy += out.y[i]; }
  cx /= N; cy /= N;
  for (int i = 0; i < N; i++) { out.x[i] -= cx; out.y[i] -= cy; }
  return out;
}

double greedy(const Cloud& a, const Cloud& b, int start, double bound) {
  bool used[N] = {};
  double sum = 0;
  int i = start;
  do {
    double best = 1e300;
    int at = -1;
    for (int j = 0; j < N; j++) {
      if (used[j]) continue;
      const double dx = a.x[i] - b.x[j], dy = a.y[i] - b.y[j], d = dx * dx + dy * dy;
      if (d < best) { best = d; at = j; }
    }
    used[at] = true;
    sum += (1.0 - (double)((i - start + N) % N) / N) * best;
    if (sum >= bound) return sum;
    i = (i + 1) % N;
  } while (i != start);
  return sum;
}

double cloudDistance(const Cloud& a, const Cloud& b, double bound) {
  double m = bound;
  for (int i = 0; i < N; i += STEP) { m = std::min(m, greedy(a, b, i, m)); m = std::min(m, greedy(b, a, i, m)); }
  return m;
}

bool wanted(const std::string& classes, const std::string& label) {
  if (classes.empty()) return true;
  size_t at = 0;
  while (at <= classes.size()) {
    size_t e = classes.find(',', at);
    if (e == std::string::npos) e = classes.size();
    if (classes.compare(at, e - at, label) == 0) return true;
    at = e + 1;
  }
  return false;
}

std::string match(const Cloud& c, const std::string& classes) {
  std::lock_guard<std::mutex> g(lock);
  std::vector<std::pair<std::string, double>> best;   // label -> squared-sum distance, in order of first template
  for (const Template& t : templates) {
    if (!wanted(classes, t.label)) continue;
    auto it = std::find_if(best.begin(), best.end(), [&](const auto& b) { return b.first == t.label; });
    if (it == best.end()) { best.push_back({t.label, 1e300}); it = best.end() - 1; }
    it->second = std::min(it->second, cloudDistance(c, t.c, it->second));
  }
  std::stable_sort(best.begin(), best.end(), [](const auto& a, const auto& b) { return a.second < b.second; });
  std::string out;
  char buf[64];
  for (const auto& b : best) { std::snprintf(buf, sizeof buf, "%.17g", std::sqrt(b.second)); out += b.first + " " + buf + ";"; }
  return out;
}

}  // namespace

// ---- Stage B (ZN-936): the tiny int8 letter net. tools/ink-train/inknet.py is its reference: the same rasteriser (IEEE doubles, no fused
// multiply-add) and integer kernels, so the logits agree bit for bit. Model format .znm: see inknet.py.
#pragma STDC FP_CONTRACT OFF
namespace net {
constexpr int S = 24;
constexpr double MARGIN = 2.0, STEP = 0.5, WEIGHT = 0.6;
struct Layer { int kind, relu, pool, cin, cout, shift; std::vector<int8_t> w; std::vector<int32_t> b, mult; };
struct Model { std::vector<std::string> labels; float outScale = 0; std::vector<Layer> layers; };
std::shared_ptr<const Model> model;   // swapped whole by a load; a running inference keeps its own reference (guarded by `lock`)

struct Grid { double d[S * S] = {}, c[S * S] = {}, s[S * S] = {}; };

void splat(Grid& g, double px, double py, double wt, double c2, double s2) {
  px -= 0.5; py -= 0.5;
  const double fix = std::floor(px), fiy = std::floor(py);
  const int ix = (int)fix, iy = (int)fiy;
  const double fx = px - fix, fy = py - fiy;
  for (int dy = 0; dy < 2; dy++) {
    const double wy = dy ? fy : 1 - fy;
    for (int dx = 0; dx < 2; dx++) {
      const double wx = dx ? fx : 1 - fx;
      const int x = ix + dx, y = iy + dy;
      if (x < 0 || x >= S || y < 0 || y >= S) continue;
      const double w = wt * (wx * wy);
      const int i = y * S + x;
      g.d[i] += w; g.c[i] += w * c2; g.s[i] += w * s2;
    }
  }
}

/** Strokes (x, y pairs, points per stroke) -> int8 [3][S][S]: density, cos 2t, sin 2t of the line orientation. */
void raster(const double* pts, const int32_t* lens, uint32_t ns, int8_t* out) {
  double x0 = 1e300, x1 = -1e300, y0 = 1e300, y1 = -1e300;
  const double* p = pts;
  for (uint32_t s = 0; s < ns; p += 2 * (lens[s] > 0 ? lens[s] : 0), s++)
    for (int32_t i = 0; i < lens[s]; i++) { x0 = std::min(x0, p[2 * i]); x1 = std::max(x1, p[2 * i]); y0 = std::min(y0, p[2 * i + 1]); y1 = std::max(y1, p[2 * i + 1]); }
  std::fill(out, out + 3 * S * S, (int8_t)0);
  if (x0 > x1) return;
  double side = std::max(x1 - x0, y1 - y0);
  if (side <= 0) side = 1.0;
  const double k = (S - 2 * MARGIN) / side, cx = (x0 + x1) * 0.5, cy = (y0 + y1) * 0.5;
  Grid g;
  std::vector<double> gx, gy;
  p = pts;
  for (uint32_t s = 0; s < ns; p += 2 * (lens[s] > 0 ? lens[s] : 0), s++) {
    const int n = lens[s];
    if (n <= 0) continue;
    gx.resize(n); gy.resize(n);
    for (int i = 0; i < n; i++) { gx[i] = (p[2 * i] - cx) * k + S * 0.5; gy[i] = (p[2 * i + 1] - cy) * k + S * 0.5; }
    if (n == 1) { splat(g, gx[0], gy[0], WEIGHT, 0.0, 0.0); continue; }
    for (int i = 0; i + 1 < n; i++) {
      const double dx = gx[i + 1] - gx[i], dy = gy[i + 1] - gy[i];
      const double L = std::sqrt(dx * dx + dy * dy);
      if (L == 0) continue;
      const double ux = dx / L, uy = dy / L, c2 = ux * ux - uy * uy, s2 = 2 * ux * uy;
      const int m = std::max(1, (int)std::ceil(L / STEP));
      for (int j = 0; j < m; j++) { const double t = (double)j / m; splat(g, gx[i] + dx * t, gy[i] + dy * t, WEIGHT, c2, s2); }
    }
    splat(g, gx[n - 1], gy[n - 1], WEIGHT, 0.0, 0.0);
  }
  for (int i = 0; i < S * S; i++) {
    const double d = g.d[i], den = std::max(d, 1.0);
    out[i] = (int8_t)std::floor(std::min(d, 1.0) * 127 + 0.5);
    out[S * S + i] = (int8_t)std::floor(std::max(-1.0, std::min(1.0, g.c[i] / den)) * 127 + 0.5);
    out[2 * S * S + i] = (int8_t)std::floor(std::max(-1.0, std::min(1.0, g.s[i] / den)) * 127 + 0.5);
  }
}

inline int8_t requant(int32_t acc, int32_t mult, int shift, int relu) {
  const int64_t r = ((int64_t)acc * mult + ((int64_t)1 << (shift - 1))) >> shift;
  const int64_t lo = relu ? 0 : -127;
  return (int8_t)(r > 127 ? 127 : r < lo ? lo : r);
}

/** The int8 logits of one raster. */
std::vector<int8_t> infer(const Model& m, const int8_t* in) {
  std::vector<int8_t> a(in, in + 3 * S * S), t, pad;
  std::vector<int32_t> acc;
  int side = S;
  for (const Layer& l : m.layers) {
    if (l.kind == 0) {
      const int h = side, w2 = side + 2;
      pad.assign((size_t)l.cin * w2 * w2, 0);
      for (int c = 0; c < l.cin; c++)
        for (int y = 0; y < h; y++) std::copy(&a[((size_t)c * h + y) * h], &a[((size_t)c * h + y) * h] + h, &pad[((size_t)c * w2 + y + 1) * w2 + 1]);
      t.assign((size_t)l.cout * h * h, 0);
      acc.assign((size_t)h * h, 0);
      for (int o = 0; o < l.cout; o++) {
        std::fill(acc.begin(), acc.end(), l.b[o]);
        for (int c = 0; c < l.cin; c++) {
          const int8_t* wk = &l.w[((size_t)o * l.cin + c) * 9];
          for (int ky = 0; ky < 3; ky++)
            for (int kx = 0; kx < 3; kx++) {
              const int32_t wv = wk[ky * 3 + kx];
              if (!wv) continue;
              for (int y = 0; y < h; y++) {
                const int8_t* src = &pad[((size_t)c * w2 + y + ky) * w2 + kx];
                int32_t* dst = &acc[(size_t)y * h];
                for (int x = 0; x < h; x++) dst[x] += wv * src[x];
              }
            }
        }
        for (int i = 0; i < h * h; i++) t[(size_t)o * h * h + i] = requant(acc[i], l.mult[o], l.shift, l.relu);
      }
      if (l.pool) {
        const int hh = h / 2;
        a.assign((size_t)l.cout * hh * hh, 0);
        for (int o = 0; o < l.cout; o++)
          for (int y = 0; y < hh; y++)
            for (int x = 0; x < hh; x++) {
              const int8_t* q = &t[((size_t)o * h + 2 * y) * h + 2 * x];
              a[((size_t)o * hh + y) * hh + x] = std::max(std::max(q[0], q[1]), std::max(q[h], q[h + 1]));
            }
        side = hh;
      } else a = t;
    } else {
      t.assign(l.cout, 0);
      for (int o = 0; o < l.cout; o++) {
        int32_t sum = l.b[o];
        const int8_t* wk = &l.w[(size_t)o * l.cin];
        for (int i = 0; i < l.cin; i++) sum += wk[i] * a[i];
        t[o] = requant(sum, l.mult[o], l.shift, l.relu);
      }
      a = t;
    }
  }
  return a;
}

/** Parses a .znm; null when it is not a well-formed one (every size is checked: a model file is input). */
std::shared_ptr<const Model> parse(const uint8_t* d, size_t n) {
  const std::shared_ptr<const Model> none;
  if (n < 20 || memcmp(d, "ZNM1", 4)) return none;
  uint32_t nl, side, nlay; float scale;
  memcpy(&nl, d + 4, 4); memcpy(&side, d + 8, 4); memcpy(&nlay, d + 12, 4); memcpy(&scale, d + 16, 4);
  if (side != (uint32_t)S || nl == 0 || nl > 256 || nlay == 0 || nlay > 16) return none;
  auto m = std::make_shared<Model>();
  m->outScale = scale;
  size_t at = 20;
  for (uint32_t i = 0; i < nl; i++) {
    if (at >= n || at + 1 + d[at] > n) return none;
    m->labels.emplace_back((const char*)d + at + 1, d[at]);
    at += 1 + d[at];
  }
  for (uint32_t i = 0; i < nlay; i++) {
    if (at + 12 > n) return none;
    Layer l;
    l.kind = d[at]; l.relu = d[at + 1]; l.pool = d[at + 2];
    uint16_t cin, cout; int32_t shift;
    memcpy(&cin, d + at + 4, 2); memcpy(&cout, d + at + 6, 2); memcpy(&shift, d + at + 8, 4);
    at += 12;
    l.cin = cin; l.cout = cout; l.shift = shift;
    if (l.kind > 1 || cin == 0 || cout == 0 || shift < 1 || shift > 62) return none;
    const size_t wn = (size_t)cin * cout * (l.kind == 0 ? 9 : 1);
    if (at + wn + 8 * (size_t)cout > n) return none;
    l.w.assign((const int8_t*)d + at, (const int8_t*)d + at + wn); at += wn;
    l.b.resize(cout); l.mult.resize(cout);
    memcpy(l.b.data(), d + at, 4 * (size_t)cout); at += 4 * (size_t)cout;
    memcpy(l.mult.data(), d + at, 4 * (size_t)cout); at += 4 * (size_t)cout;
    m->layers.push_back(std::move(l));
  }
  int c = 3, sd = S;   // the layers chain: conv... then dense (cin = channels x side x side) ... then one logit per label
  bool dense = false;
  for (const Layer& l : m->layers) {
    if (l.kind == 0) { if (dense || l.cin != c || (l.pool && sd % 2)) return none; c = l.cout; if (l.pool) sd /= 2; }
    else { if (l.cin != (dense ? c : c * sd * sd)) return none; dense = true; c = l.cout; }
  }
  if (!dense || c != (int)nl || at != n) return none;
  return m;
}

std::string logitsText(const std::vector<int8_t>& v) {
  std::string out;
  for (int8_t x : v) out += std::to_string((int)x) + " ";
  return out;
}

void b64(const char* s, uint32_t n, std::vector<uint8_t>& out) {
  int acc = 0, bits = 0;
  for (uint32_t i = 0; i < n; i++) {
    const char ch = s[i];
    const int v = ch >= 'A' && ch <= 'Z' ? ch - 'A' : ch >= 'a' && ch <= 'z' ? ch - 'a' + 26 : ch >= '0' && ch <= '9' ? ch - '0' + 52 : ch == '+' ? 62 : ch == '/' ? 63 : -1;
    if (v < 0) continue;
    acc = ((acc << 6) | v) & 0xffff; bits += 6;
    if (bits >= 8) { bits -= 8; out.push_back((uint8_t)((acc >> bits) & 255)); }
  }
}
}  // namespace net

extern "C" int32_t zn_ink_reset(void*, ZnCtx*, const ZnVal*, ZnVal*) { std::lock_guard<std::mutex> g(lock); templates.clear(); return ZN_OK; }
extern "C" int32_t zn_ink_count(void*, ZnCtx*, const ZnVal*, ZnVal* ret) { std::lock_guard<std::mutex> g(lock); ret->i = (int64_t)templates.size(); return ZN_OK; }
extern "C" int32_t zn_ink_add(void*, ZnCtx*, const ZnVal* a, ZnVal*) {
  Template t{std::string(a[0].s.p, a[0].s.n), normalise((const double*)a[1].v.p, (const int32_t*)a[2].v.p, a[2].v.n)};
  std::lock_guard<std::mutex> g(lock);
  templates.push_back(std::move(t));
  return ZN_OK;
}
extern "C" int32_t zn_ink_match(void*, ZnCtx* cx, const ZnVal* a, ZnVal* ret) {
  const std::string out = match(normalise((const double*)a[0].v.p, (const int32_t*)a[1].v.p, a[1].v.n), std::string(a[2].s.p, a[2].s.n));
  ret->s = host->ret_str(cx, out.data(), (uint32_t)out.size());
  return ZN_OK;
}
extern "C" int32_t zn_ink_matchAsync(void*, ZnCtx* cx, const ZnVal* a, ZnVal*) {
  const uint64_t promise = host->promise_take(cx);
  const Cloud c = normalise((const double*)a[0].v.p, (const int32_t*)a[1].v.p, a[1].v.n);   // copied now: the arrays are valid for this call only
  const std::string classes(a[2].s.p, a[2].s.n);
  host->loop_ref();
  std::thread([promise, c, classes] {
    const std::string out = match(c, classes);
    ZnVal v;
    v.s = ZnStr{out.data(), (uint32_t)out.size()};
    host->promise_resolve(promise, "s", &v);
    host->loop_unref();
  }).detach();
  return ZN_PENDING;
}

// The net: load (bytes or base64: the class count, -1 when it is not a model), labels, scale, raster of strokes, logits of a raster or of strokes
// (text "l0 l1 ... "), the last also on the worker thread.
static std::shared_ptr<const net::Model> netModel() { std::lock_guard<std::mutex> g(lock); return net::model; }
static int32_t netInstall(std::shared_ptr<const net::Model> m, ZnVal* ret) {
  if (m) { std::lock_guard<std::mutex> g(lock); net::model = m; }
  ret->i = m ? (int64_t)m->labels.size() : -1;
  return ZN_OK;
}
extern "C" int32_t zn_ink_netLoad(void*, ZnCtx*, const ZnVal* a, ZnVal* ret) { return netInstall(net::parse((const uint8_t*)a[0].v.p, a[0].v.n), ret); }
extern "C" int32_t zn_ink_netLoadB64(void*, ZnCtx*, const ZnVal* a, ZnVal* ret) {
  std::vector<uint8_t> raw;
  net::b64(a[0].s.p, a[0].s.n, raw);
  return netInstall(net::parse(raw.data(), raw.size()), ret);
}
extern "C" int32_t zn_ink_netLabels(void*, ZnCtx* cx, const ZnVal*, ZnVal* ret) {
  std::string out;
  if (auto m = netModel()) for (const auto& l : m->labels) out += (out.empty() ? "" : ",") + l;
  ret->s = host->ret_str(cx, out.data(), (uint32_t)out.size());
  return ZN_OK;
}
extern "C" int32_t zn_ink_netScale(void*, ZnCtx*, const ZnVal*, ZnVal* ret) { auto m = netModel(); ret->d = m ? (double)m->outScale : 0.0; return ZN_OK; }
extern "C" int32_t zn_ink_netRaster(void*, ZnCtx* cx, const ZnVal* a, ZnVal* ret) {
  int8_t r[3 * net::S * net::S];
  net::raster((const double*)a[0].v.p, (const int32_t*)a[1].v.p, a[1].v.n, r);
  int32_t* out = (int32_t*)host->ret_buf(cx, sizeof r * 4);
  for (size_t i = 0; i < sizeof r; i++) out[i] = r[i];
  ret->v.p = out; ret->v.n = (uint32_t)sizeof r;
  return ZN_OK;
}
extern "C" int32_t zn_ink_netLogits(void*, ZnCtx* cx, const ZnVal* a, ZnVal* ret) {
  auto m = netModel();
  std::string out;
  if (m && a[0].v.n == 3 * net::S * net::S) {
    int8_t r[3 * net::S * net::S];
    for (int i = 0; i < 3 * net::S * net::S; i++) r[i] = (int8_t)((const int32_t*)a[0].v.p)[i];
    out = net::logitsText(net::infer(*m, r));
  }
  ret->s = host->ret_str(cx, out.data(), (uint32_t)out.size());
  return ZN_OK;
}
extern "C" int32_t zn_ink_netRun(void*, ZnCtx* cx, const ZnVal* a, ZnVal* ret) {
  auto m = netModel();
  std::string out;
  if (m) {
    int8_t r[3 * net::S * net::S];
    net::raster((const double*)a[0].v.p, (const int32_t*)a[1].v.p, a[1].v.n, r);
    out = net::logitsText(net::infer(*m, r));
  }
  ret->s = host->ret_str(cx, out.data(), (uint32_t)out.size());
  return ZN_OK;
}
extern "C" int32_t zn_ink_netRunAsync(void*, ZnCtx* cx, const ZnVal* a, ZnVal*) {
  const uint64_t promise = host->promise_take(cx);
  auto m = netModel();
  int8_t r[3 * net::S * net::S];
  net::raster((const double*)a[0].v.p, (const int32_t*)a[1].v.p, a[1].v.n, r);   // the arrays are valid for this call only: rastered now
  const std::vector<int8_t> in(r, r + sizeof r);
  host->loop_ref();
  std::thread([promise, m, in] {
    const std::string out = m ? net::logitsText(net::infer(*m, in.data())) : std::string();
    ZnVal v;
    v.s = ZnStr{out.data(), (uint32_t)out.size()};
    host->promise_resolve(promise, "s", &v);
    host->loop_unref();
  }).detach();
  return ZN_PENDING;
}

static int32_t init(const ZnHostApi* h, void** self) { host = h; *self = nullptr; return ZN_OK; }

static const ZnExport exports[] = {ZN_ink_EXPORTS};

extern "C" const ZnModule* zn_module_Ink(void) {
  static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Ink", exports, sizeof exports / sizeof exports[0], nullptr, 0, ZN_THREADS, init, nullptr, nullptr};
  return &m;
}
