// zinc:ink's recogniser on the native ABI (include/zn/native.h): a point-cloud matcher in the $P/$Q family (Vatavu, Anthony and Wobbrock;
// University of Washington, depts.washington.edu/acelab/proj/dollar). Strokes are resampled to 32 points by arc length, scaled to a unit box
// (aspect kept: a letter is not rotation- or shape-invariant) and centred; the distance of two clouds is the greedy weighted nearest-point
// match from several start points, in both directions, abandoned early once it cannot beat the best so far ($Q's early abandoning).
// recog.ts is the TypeScript reference of the very same steps, in the same order: the results agree to the last digits.
#include <algorithm>
#include <cmath>
#include <cstdio>
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

static int32_t init(const ZnHostApi* h, void** self) { host = h; *self = nullptr; return ZN_OK; }

static const ZnExport exports[] = {ZN_ink_EXPORTS};

extern "C" const ZnModule* zn_module_Ink(void) {
  static const ZnModule m = {ZN_ABI_VERSION, sizeof(ZnModule), "Ink", exports, sizeof exports / sizeof exports[0], nullptr, 0, ZN_THREADS, init, nullptr, nullptr};
  return &m;
}
