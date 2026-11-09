// Math through V8's fdlibm port (include/zn/jsmath.h, ZN-703). pow follows v8::internal::math::pow (src/numbers/ieee754.cc of
// V8 13.6): the ECMAScript edges first, then x * x and sqrt for the exponents V8's compilers rewrite, then CORE-MATH's correctly
// rounded pow where V8 calls the platform's (Node's own pow differs between its builds; a correctly rounded one is the same bits
// everywhere and agrees with Node wherever the platform's is right: 13 of 10000 arguments of tests/golden/math were not).
#include "zn/jsmath.h"

#include <cmath>
#include <limits>

#include "src/base/ieee754.h"

namespace ie = v8::base::ieee754;

extern "C" double cr_pow(double x, double y);  // third_party/core-math/pow.c

extern "C" {
double zn_js_sin(double x) { return ie::sin(x); }
double zn_js_cos(double x) { return ie::cos(x); }
double zn_js_tan(double x) { return ie::tan(x); }
double zn_js_exp(double x) { return ie::exp(x); }
double zn_js_log(double x) { return ie::log(x); }
double zn_js_atan2(double y, double x) { return ie::atan2(y, x); }
double zn_js_pow(double x, double y) {
  if (std::isnan(y)) return std::numeric_limits<double>::quiet_NaN();                     // 1 ** NaN is NaN, not 1
  if (std::isinf(y) && (x == 1 || x == -1)) return std::numeric_limits<double>::quiet_NaN();  // (±1) ** ±Infinity is NaN
  if (y == 2) return x * x;
  if (y == 0.5) return std::isinf(x) ? std::numeric_limits<double>::infinity() : std::sqrt(x + 0);  // -0 ** 0.5 is +0
  return cr_pow(x, y);
}
}
