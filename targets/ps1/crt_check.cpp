// Host self-check of crt_ps1.cpp against the host libc/libm:
//   c++ -std=c++17 -O1 targets/ps1/crt_check.cpp -o /tmp/crt_check && /tmp/crt_check
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
namespace ps1 {
#define sqrt z_sqrt
#define trunc z_trunc
#define floor z_floor
#define ceil z_ceil
#define fabs z_fabs
#define fmod z_fmod
#define sqrtf z_sqrtf
#define hypot z_hypot
#define exp z_exp
#define log z_log
#define pow z_pow
#define sin z_sin
#define cos z_cos
#define tan z_tan
#define sinf z_sinf
#define cosf z_cosf
#define atan z_atan
#define atan2 z_atan2
#include "crt_ps1.cpp"
#undef sqrt
#undef trunc
#undef floor
#undef ceil
#undef fabs
#undef fmod
#undef exp
#undef log
#undef pow
#undef sin
#undef cos
#undef tan
#undef atan
#undef atan2
}

static int fails = 0;
static void check(bool ok, const char* what, double x) { if (!ok && fails++ < 20) printf("FAIL %s (%.17g)\n", what, x); }
static double rnd() { uint64_t u = ((uint64_t)rand() << 42) ^ ((uint64_t)rand() << 21) ^ (uint64_t)rand(); double d; memcpy(&d, &u, 8); return d; }
static double ulps(double a, double b) { return a == b ? 0 : fabs(a - b) / fabs(nextafter(b, INFINITY) - b); }

int main() {
  for (int i = 0; i < 200000; i++) {
    double v = i < 1000 ? (i - 500) / 4096.0 : i < 2000 ? pow(10, i % 600 - 300) : fabs(rnd());
    if (!(v > 0) || isinf(v)) continue;
    char d[32], buf[40]; int e;
    int k = ps1::zrt_host_shortest(v, d, &e);
    d[k] = 0;
    snprintf(buf, sizeof buf, "0.%se%d", d, e + 1);
    check(strtod(buf, nullptr) == v, "shortest round-trip", v);
    for (int p = 1; p < k; p++) { snprintf(buf, sizeof buf, "%.*e", p - 1, v); check(strtod(buf, nullptr) != v, "shortest is shortest", v); }
    int used; check(ps1::zrt_host_strtod(buf, &used) == strtod(buf, nullptr) && used == (int)strlen(buf), "strtod", v);
  }
  const struct { double v; int d; const char* s; } fx[] = {{1.005, 2, "1.00"}, {1.5, 0, "2"}, {2.5, 0, "3"}, {-1.25, 1, "-1.3"}, {0, 2, "0.00"},
    {123.456, 1, "123.5"}, {1e20, 2, "100000000000000000000.00"}, {0.000001, 3, "0.000"}, {1 / 3.0, 5, "0.33333"}};
  for (auto& t : fx) { char b[400]; ps1::zrt_host_fixed(t.v, t.d, b, sizeof b); check(!strcmp(b, t.s), t.s, t.v); }
  double worst[8] = {0};
  for (int i = 0; i < 100000; i++) {
    double x = (rand() / (double)RAND_MAX - 0.5) * 200, y = rand() / (double)RAND_MAX * 10;
    check(ps1::z_floor(x) == floor(x) && ps1::z_ceil(x) == ceil(x) && ps1::z_trunc(x) == trunc(x), "floor/ceil/trunc", x);
    check(ps1::z_fmod(x, y + 0.1) == fmod(x, y + 0.1), "fmod", x);
    double r[8] = {ulps(ps1::z_sqrt(fabs(x)), sqrt(fabs(x))), ulps(ps1::z_exp(x / 3), exp(x / 3)), ulps(ps1::z_log(y), log(y)),
      ulps(ps1::z_sin(x), sin(x)), ulps(ps1::z_cos(x), cos(x)), ulps(ps1::z_atan2(x, y - 5), atan2(x, y - 5)), ulps(ps1::z_pow(y, x / 20), pow(y, x / 20)), ulps(ps1::z_tan(x), tan(x))};
    for (int j = 0; j < 8; j++) if (r[j] > worst[j] && fabs(x) > 1e-3) worst[j] = r[j];
  }
  printf("worst ulps: sqrt %.0f exp %.0f log %.0f sin %.0f cos %.0f atan2 %.0f pow %.0f tan %.0f\n", worst[0], worst[1], worst[2], worst[3], worst[4], worst[5], worst[6], worst[7]);
  for (int j = 0; j < 8; j++) check(worst[j] < 64, "libm accuracy", worst[j]);
  printf(fails ? "%d failure(s)\n" : "ok\n", fails);
  return fails != 0;
}
