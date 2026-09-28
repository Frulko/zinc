// What PSn00bSDK's libc lacks for the runtime (it has no libm and no floating-point printf/strtod): the number
// conversions of runtime/host.cpp (decision 0003) and the double math the runtime calls. Soft-float (R3000, no FPU).
#include <stdint.h>
#include <string.h>

namespace {
inline uint64_t bits(double x) { uint64_t u; memcpy(&u, &x, 8); return u; }
inline double from(uint64_t u) { double x; memcpy(&x, &u, 8); return x; }
const double INF = __builtin_inf();

// ---------- exact big integers (32-bit limbs, enough for 10^340 * 2^1080) ----------
struct Big {
  uint32_t w[40]; int n = 0;
  explicit Big(uint64_t v = 0) { for (; v; v >>= 32) w[n++] = (uint32_t)v; }
  void mul(uint32_t m) { uint64_t c = 0; for (int i = 0; i < n; i++) { c += (uint64_t)w[i] * m; w[i] = (uint32_t)c; c >>= 32; } if (c) w[n++] = (uint32_t)c; }
  void pow10(int k) { for (; k >= 9; k -= 9) mul(1000000000u); while (k-- > 0) mul(10); }
  void shl(int s) {
    int q = s / 32, r = s % 32;
    if (r) { uint32_t c = 0; for (int i = 0; i < n; i++) { uint32_t x = w[i]; w[i] = x << r | c; c = x >> (32 - r); } if (c) w[n++] = c; }
    if (q && n) { for (int i = n - 1; i >= 0; i--) w[i + q] = w[i]; for (int i = 0; i < q; i++) w[i] = 0; n += q; }
  }
  void shr(int s) {
    int q = s / 32, r = s % 32;
    if (q >= n) { n = 0; return; }
    for (int i = 0; i < n - q; i++) w[i] = w[i + q];
    n -= q;
    if (r) { for (int i = 0; i < n; i++) w[i] = w[i] >> r | (i + 1 < n ? w[i + 1] << (32 - r) : 0); }
    while (n && !w[n - 1]) n--;
  }
  void add(const Big& b) { uint64_t c = 0; for (int i = 0; i < b.n || c; i++) { if (i == n) w[n++] = 0; c += (uint64_t)w[i] + (i < b.n ? b.w[i] : 0); w[i] = (uint32_t)c; c >>= 32; } }
  void sub(const Big& b) { int64_t c = 0; for (int i = 0; i < n; i++) { c += (int64_t)w[i] - (i < b.n ? b.w[i] : 0); w[i] = (uint32_t)c; c >>= 32; } while (n && !w[n - 1]) n--; }
  uint32_t divmod(uint32_t d) { uint64_t r = 0; for (int i = n - 1; i >= 0; i--) { r = r << 32 | w[i]; w[i] = (uint32_t)(r / d); r %= d; } while (n && !w[n - 1]) n--; return (uint32_t)r; }
  int cmp(const Big& b) const { if (n != b.n) return n < b.n ? -1 : 1; for (int i = n; i-- > 0;) if (w[i] != b.w[i]) return w[i] < b.w[i] ? -1 : 1; return 0; }
};
// v = f * 2^e for finite v > 0
void split(double v, uint64_t* f, int* e) {
  uint64_t u = bits(v); int be = (int)(u >> 52 & 0x7ff);
  *f = u & ((1ull << 52) - 1);
  if (be) { *f |= 1ull << 52; *e = be - 1075; } else *e = -1074;
}
}  // namespace

// Shortest digits that read back as v (Steele & White / Burger & Dybvig free-format, exact): 0.d1d2.. * 10^(exp10+1).
extern "C" int zrt_host_shortest(double v, char* digits, int* exp10) {
  uint64_t f; int e;
  split(v, &f, &e);
  bool even = !(f & 1), edge = f == 1ull << 52 && e > -1074;  // edge: the gap below v is half the gap above
  Big r(f), s(1), mp(1), mm(1);
  if (e >= 0) { r.shl(e + 1 + edge); s.shl(1 + edge); mp.shl(e + edge); mm.shl(e); }
  else { r.shl(1 + edge); s.shl(1 - e + edge); mp.shl(edge); }
  int bl = 64 - __builtin_clzll(f), k = ((e + bl - 1) * 78913) >> 18;  // floor(log10 v) + 1, up to 2 low
  if (k >= 0) s.pow10(k); else { r.pow10(-k); mp.pow10(-k); mm.pow10(-k); }
  Big t = r; t.add(mp);
  while (even ? t.cmp(s) >= 0 : t.cmp(s) > 0) { s.mul(10); k++; }
  int n = 0;
  for (;;) {
    r.mul(10); mp.mul(10); mm.mul(10);
    int d = 0;
    while (r.cmp(s) >= 0) { r.sub(s); d++; }
    t = r; t.add(mp);
    bool lo = even ? r.cmp(mm) <= 0 : r.cmp(mm) < 0, hi = even ? t.cmp(s) >= 0 : t.cmp(s) > 0;
    if (lo && hi) { t = r; t.shl(1); int c = t.cmp(s); if (c > 0 || (c == 0 && (d & 1))) d++; }
    else if (hi) d++;
    digits[n++] = (char)('0' + d);
    if (lo || hi) break;
  }
  *exp10 = k - 1;
  return n;
}

static double scale2(double x, int k) {  // x * 2^k (exact unless the result is subnormal)
  for (; k > 1023; k -= 1023) x *= from(0x7feull << 52);
  for (; k < -1022; k += 1022) x *= from(1ull << 52);
  return x * from((uint64_t)(k + 1023) << 52);
}
// q * 2^e2 rounded to nearest even (sticky: nonzero bits below q), subnormals included
static double compose(uint64_t q, int e2, bool sticky) {
  int drop = 64 - __builtin_clzll(q) - 53;
  if (e2 + drop < -1074) drop = -1074 - e2;
  if (drop > 63) return 0;
  if (drop > 0) {
    uint64_t rem = q & ((1ull << drop) - 1), half = 1ull << (drop - 1);
    q >>= drop; e2 += drop;
    if (rem > half || (rem == half && (sticky || (q & 1)))) q++;
  }
  return scale2((double)q, e2);
}

// JS parseFloat prefix, correctly rounded (exact bignum). ponytail: digits past the 19th are dropped.
extern "C" double zrt_host_strtod(const char* s, int* consumed) {
  const char* p = s;
  bool neg = *p == '-';
  if (*p == '-' || *p == '+') p++;
  if (!strncmp(p, "Infinity", 8)) { *consumed = (int)(p + 8 - s); return neg ? -INF : INF; }
  uint64_t m = 0; int nd = 0, e10 = 0; bool any = false;
  for (; *p >= '0' && *p <= '9'; p++, any = true) if (nd < 19) { m = m * 10 + (uint64_t)(*p - '0'); if (m) nd++; } else e10++;
  if (*p == '.') for (p++; *p >= '0' && *p <= '9'; p++, any = true) if (nd < 19) { m = m * 10 + (uint64_t)(*p - '0'); if (m) nd++; e10--; }
  if (!any) { *consumed = 0; return 0; }
  if (*p == 'e' || *p == 'E') {
    const char* q = p + 1; bool en = *q == '-';
    if (*q == '-' || *q == '+') q++;
    if (*q >= '0' && *q <= '9') { int x = 0; for (; *q >= '0' && *q <= '9'; q++) if (x < 1000) x = x * 10 + (*q - '0'); e10 += en ? -x : x; p = q; }
  }
  *consumed = (int)(p - s);
  double v;
  if (!m || nd + e10 < -330) v = 0;
  else if (nd + e10 > 310) v = INF;
  else if (e10 >= 0) {  // m * 10^e10: top 64 bits + sticky
    Big n(m); n.pow10(e10);
    int bl = n.n * 32 - __builtin_clz(n.w[n.n - 1]), sh = bl > 64 ? bl - 64 : 0;
    Big t = n; t.shr(sh);
    uint64_t q = (uint64_t)t.w[0] | (t.n > 1 ? (uint64_t)t.w[1] << 32 : 0);
    Big back = t; back.shl(sh);
    v = compose(q, sh, back.cmp(n) != 0);
  } else {  // m / 10^-e10: 57 quotient bits by shift-subtract, remainder is the sticky bit
    Big d(1); d.pow10(-e10);
    int sh = 57 + (d.n * 32 - __builtin_clz(d.w[d.n - 1])) - (64 - __builtin_clzll(m));
    Big r(m); r.shl(sh);
    uint64_t q = 0;
    for (int b = 57; b >= 0; b--) { Big t = d; t.shl(b); if (r.cmp(t) >= 0) { r.sub(t); q |= 1ull << b; } }
    v = compose(q, -sh, r.n != 0);
  }
  return neg ? -v : v;
}

// Number.prototype.toFixed: n / 10^digits nearest to |v|, ties to the larger n (exact).
extern "C" int zrt_host_fixed(double v, int digits, char* out, int cap) {
  if (digits < 0) digits = 0;
  if (digits > 100) digits = 100;
  const char* special = v != v ? "NaN" : v == INF ? "Infinity" : v == -INF ? "-Infinity" : nullptr;
  int len = 0;
  if (special) { while (special[len] && len < cap - 1) { out[len] = special[len]; len++; } out[len] = 0; return len; }
  bool neg = v < 0;
  if (neg) v = -v;
  Big N;
  if (v != 0) {
    uint64_t f; int e;
    split(v, &f, &e);
    N = Big(f);
    N.pow10(digits);
    if (e >= 0) N.shl(e);
    else { Big half(1); half.shl(-e - 1); N.add(half); N.shr(-e); }
  }
  char tmp[420]; int t = 0;
  do tmp[t++] = (char)('0' + N.divmod(10)); while ((N.n || t <= digits) && t < (int)sizeof tmp);
  if (neg && len < cap - 1) out[len++] = '-';
  for (int i = t - 1; i >= 0 && len < cap - 1; i--) { if (i == digits - 1) out[len++] = '.'; if (len < cap - 1) out[len++] = tmp[i]; }
  out[len] = 0;
  return len;
}

// ---------- libm subset (-fno-builtin: GCC calls these for __builtin_floor etc.) ----------
// ponytail: series kernels, ~1 ulp on reduced ranges; huge sin/cos arguments (> 2^20) lose precision (no Payne-Hanek).
extern "C" {
double sqrt(double x);
double trunc(double x) {
  int e = (int)(bits(x) >> 52 & 0x7ff) - 1023;
  if (e >= 52) return x;
  if (e < 0) return from(bits(x) & 1ull << 63);
  return from(bits(x) & ~((1ull << (52 - e)) - 1));
}
double floor(double x) { double t = trunc(x); return t > x ? t - 1 : t; }
double ceil(double x) { double t = trunc(x); return t < x ? t + 1 : t; }
double fabs(double x) { return from(bits(x) & ~(1ull << 63)); }
double fmod(double x, double y) {  // exact (shift-subtract on the mantissas), sign of x
  uint64_t ux = bits(x), uy = bits(y), sx = ux & 1ull << 63;
  int ex = (int)(ux >> 52 & 0x7ff), ey = (int)(uy >> 52 & 0x7ff);
  if (y != y || x != x || ex == 0x7ff || y == 0) return (x * y) / (x * y);
  if ((ux << 1) <= (uy << 1)) return (ux << 1) == (uy << 1) ? 0 * x : x;
  uint64_t mx = ux & ((1ull << 52) - 1), my = uy & ((1ull << 52) - 1);
  if (ex) mx |= 1ull << 52; else for (ex = 1; !(mx >> 52); ex--) mx <<= 1;
  if (ey) my |= 1ull << 52; else for (ey = 1; !(my >> 52); ey--) my <<= 1;
  for (; ex > ey; ex--) { if (mx >= my) mx -= my; mx <<= 1; }
  if (mx >= my) mx -= my;
  if (!mx) return 0 * x;
  for (; !(mx >> 52); ex--) mx <<= 1;
  return from((ex > 0 ? (mx - (1ull << 52)) | (uint64_t)ex << 52 : mx >> (1 - ex)) | sx);
}
double sqrt(double x) {
  if (!(x > 0) || x == INF) return x == 0 || x == INF ? x : (x - x) / (x - x);
  double y = from((bits(x) >> 1) + (0x3ffull << 51));  // halved exponent
  y = 0.5 * (y + x / y);  // now above the root: Newton decreases until it stops
  for (int i = 0; i < 64; i++) { double z = 0.5 * (y + x / y); if (z >= y) break; y = z; }
  return y;
}
float sqrtf(float x) { return (float)sqrt(x); }
double hypot(double a, double b) { return sqrt(a * a + b * b); }  // ponytail: no overflow scaling
static const double LN2_HI = 6.93147180369123816490e-01, LN2_LO = 1.90821492927058770002e-10;
double exp(double x) {
  if (x != x) return x;
  if (x > 709.8) return INF;
  if (x < -745.2) return 0;
  int k = (int)floor(x * 1.44269504088896338700 + 0.5);
  double r = (x - k * LN2_HI) - k * LN2_LO, p = 1;
  for (int n = 14; n > 0; n--) p = 1 + p * r / n;  // Taylor to r^14/14!, |r| <= 0.35
  return scale2(p, k);
}
double log(double x) {
  if (x != x || x == INF) return x;
  if (x == 0) return -INF;
  if (x < 0) return (x - x) / (x - x);
  int e = 0;
  if (!(bits(x) >> 52)) { x *= from((1023ull + 54) << 52); e = -54; }  // subnormal
  e += (int)(bits(x) >> 52) - 1023;
  double m = from((bits(x) & ((1ull << 52) - 1)) | 0x3ffull << 52);
  if (m > 1.41421356237309504880) { m *= 0.5; e++; }
  double s = (m - 1) / (m + 1), s2 = s * s, p = 0;
  for (int n = 25; n >= 1; n -= 2) p = 1.0 / n + s2 * p;  // atanh series, |s| < 0.172
  return e * LN2_HI + (2 * s * p + e * LN2_LO);
}
double pow(double x, double y) {
  if (y == 0) return 1;
  if (x != x || y != y) return x + y;
  if (y == trunc(y) && fabs(y) < 2147483648.0) {  // exact-ish by squaring, like the host libms for small integers
    uint32_t n = (uint32_t)fabs(y); double r = 1, b = x;
    for (; n; n >>= 1, b *= b) if (n & 1) r *= b;
    return y < 0 ? 1 / r : r;
  }
  double ax = fabs(x);
  if (y == INF || y == -INF) return ax == 1 ? 1 : (ax > 1) == (y > 0) ? INF : 0;
  if (x < 0) return (x - x) / (x - x);
  if (x == 0) return y > 0 ? 0 : INF;
  if (x == INF) return y > 0 ? INF : 0;
  return exp(y * log(x));
}
// sin/cos on [-pi/4, pi/4] after reduction by pi/2 (Cody-Waite, two-part constant)
static int reduce(double x, double* r) {
  double k = floor(x * 0.636619772367581382433 + 0.5);
  *r = (x - k * 1.57079632673412561417) - k * 6.07710050650619224932e-11;
  return (int)((int64_t)k & 3);
}
static double ksin(double r) { double r2 = r * r, p = 1; for (int n = 17; n > 1; n -= 2) p = 1 - p * r2 / (n * (n - 1)); return r * p; }
static double kcos(double r) { double r2 = r * r, p = 1; for (int n = 18; n > 0; n -= 2) p = 1 - p * r2 / (n * (n - 1)); return p; }
double sin(double x) {
  if (x != x || x == INF || x == -INF) return (x - x) / (x - x);
  double r; int q = reduce(x, &r);
  return q == 0 ? ksin(r) : q == 1 ? kcos(r) : q == 2 ? -ksin(r) : -kcos(r);
}
double cos(double x) {
  if (x != x || x == INF || x == -INF) return (x - x) / (x - x);
  double r; int q = reduce(x, &r);
  return q == 0 ? kcos(r) : q == 1 ? -ksin(r) : q == 2 ? -kcos(r) : ksin(r);
}
double tan(double x) { return sin(x) / cos(x); }
float sinf(float x) { return (float)sin(x); }
float cosf(float x) { return (float)cos(x); }
static const double PI = 3.14159265358979311600, PI_2 = 1.57079632679489655800;
double atan(double x) {
  if (x != x) return x;
  double ax = fabs(x), a;
  if (ax == INF) a = PI_2;
  else {
    bool inv = ax > 1;
    double t = inv ? 1 / ax : ax;
    for (int i = 0; i < 2; i++) t = t / (1 + sqrt(1 + t * t));  // atan(t) = 2 atan(t / (1 + sqrt(1 + t^2)))
    double t2 = t * t, p = 0;
    for (int n = 23; n >= 1; n -= 2) p = (((n >> 1) & 1) ? -1.0 : 1.0) / n + t2 * p;  // sum (-1)^k t^2k / (2k+1)
    a = 4 * t * p;
    if (inv) a = PI_2 - a;
  }
  return x < 0 ? -a : a;
}
double atan2(double y, double x) {
  if (x != x || y != y) return x + y;
  bool sx = bits(x) >> 63, sy = bits(y) >> 63;
  if (y == 0) return sx ? (sy ? -PI : PI) : y;
  if (x == 0) return sy ? -PI_2 : PI_2;
  double a = atan(y / x);
  return !sx ? a : sy ? a - PI : a + PI;
}
}
