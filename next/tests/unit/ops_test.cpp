// The shared operation semantics (include/zn/ops.h): the corner cases both engines depend on.
#include <cmath>
#include <cstdio>

#include "zn/ops.h"

using namespace zn;
using namespace zn::ops;

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { std::printf("FAIL %s:%d: %s\n", __FILE__, __LINE__, #cond); ++failures; } } while (0)

int main() {
  CHECK(AddI32(sx32(INT32_MAX), sx32(1)) == sx32(INT32_MIN));                       // 32-bit wrap-around, sign-extended canonical form
  CHECK(DivI32(sx32(INT32_MIN), sx32(-1)) == sx32(INT32_MIN));                      // no overflow trap
  CHECK(RemI32(sx32(INT32_MIN), sx32(-1)) == 0);
  CHECK(!DivI32Defined(sx32(5), 0) && DivI32Defined(sx32(5), 2));
  CHECK(MulU32(zx32(0xFFFFFFFFu), zx32(2)) == zx32(0xFFFFFFFEu));
  CHECK(F64ToI64(fromD(NAN), 0) == 0 && F64ToI64(fromD(1e300), 0) == sx(INT64_MAX) && F64ToI64(fromD(-1e300), 0) == sx(INT64_MIN));
  CHECK(F64ToU64(fromD(-1), 0) == static_cast<Slot>(-1));
  CHECK(std::signbit(asD(MinF64(fromD(0.0), fromD(-0.0)))));                         // min(0, -0) is -0
  CHECK(!std::signbit(asD(MaxF64(fromD(-0.0), fromD(0.0)))));                        // max(-0, 0) is 0
  CHECK(std::isnan(asD(MaxF64(fromD(1.0), fromD(NAN)))));
  CHECK(asD(RoundF64(fromD(2.5), 0)) == 3 && asD(RoundF64(fromD(-2.5), 0)) == -2);  // half toward +infinity
  CHECK(ShlI32(sx32(1), 33) == sx32(2));                                              // the shift count is masked
  CHECK(NarrowI8(sx(300), 0) == sx(44) && NarrowU8(sx(-1), 0) == 255);
  CHECK(JLtI(sx(-1), sx(1)) && !JLtU(sx(-1), sx(1)));
  CHECK(AddI32K(sx32(5), -7) == sx32(-2));
  if (failures == 0) std::puts("ops_test: ok");
  return failures ? 1 : 0;
}
