// Fixed point (ZN-121.02): the shared ops of zn/ops.h against a port of the prototype's Fx<F> (runtime/zrt_ext.h), over edge values and a few thousand pseudo-random ones.
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <string>
#include <vector>

#include "zn/ops.h"

using namespace zn::ops;
using zn::Slot;
static int failures = 0;
#define CHECK(c, ...) do { if (!(c)) { if (failures++ < 20) { std::printf("FAIL line %d: ", __LINE__); std::printf(__VA_ARGS__); std::printf("\n"); } } } while (0)

// the reference: Fx<F> of the prototype, copied (cvt<int32_t> = trunc, modulo 2^32, 0 for NaN and infinity)
template <int F> struct Ref {
  int32_t v = 0;
  static constexpr int64_t ONE = int64_t{1} << F;
  static int32_t cvt32(double x) { if (!(x - x == 0)) return 0; double t = std::fmod(std::trunc(x), 4294967296.0); if (t < 0) t += 4294967296.0; return static_cast<int32_t>(static_cast<uint32_t>(t)); }
  static Ref raw(int32_t r) { Ref x; x.v = r; return x; }
  static Ref from_d(double d) { return raw(cvt32(std::floor(d * static_cast<double>(ONE) + 0.5))); }
  Ref operator*(Ref o) const { return raw(static_cast<int32_t>((static_cast<int64_t>(v) * o.v) >> F)); }
  Ref operator/(Ref o) const { return raw(static_cast<int32_t>((static_cast<int64_t>(v) * ONE) / o.v)); }
  double d() const { return static_cast<double>(v) / static_cast<double>(ONE); }
  static Ref sqrt(Ref a) {
    if (a.v <= 0) return Ref();
    uint64_t n = static_cast<uint64_t>(a.v) << F, r = 0, bit = uint64_t{1} << 62;
    while (bit > n) bit >>= 2;
    while (bit) { if (n >= r + bit) { n -= r + bit; r = (r >> 1) + bit; } else r >>= 1; bit >>= 2; }
    return raw(static_cast<int32_t>(r));
  }
  static Ref sin(Ref a) {
    int32_t i = static_cast<int32_t>((static_cast<int64_t>(a.v) * kFxIdxK) >> (F + 16)) & 4095;
    int32_t s = kFxSin[i];
    return raw(F >= 16 ? s << (F - 16) : s >> (16 - F));
  }
  static Ref cos(Ref a) {
    int32_t i = (static_cast<int32_t>((static_cast<int64_t>(a.v) * kFxIdxK) >> (F + 16)) + 1024) & 4095;
    int32_t s = kFxSin[i];
    return raw(F >= 16 ? s << (F - 16) : s >> (16 - F));
  }
};

struct Ops {
  Slot (*mul)(Slot, Slot);
  Slot (*div)(Slot, Slot);
  bool (*divOk)(Slot, Slot);
  Slot (*fromDouble)(Slot, Slot);
  Slot (*toDouble)(Slot, Slot);
  Slot (*fromInt)(Slot, Slot);
  Slot (*toInt)(Slot, Slot);
  Slot (*sqrtOp)(Slot, Slot);
  Slot (*sinOp)(Slot, Slot);
  Slot (*cosOp)(Slot, Slot);
};

template <int F> static void run(const Ops& o) {
  uint64_t seed = 88172645463325252ull;
  auto next = [&]() { seed ^= seed << 13; seed ^= seed >> 7; seed ^= seed << 17; return seed; };
  std::vector<int32_t> vals{0, 1, -1, 2, 4095, 4096, -4096, 65536, 1 << 20, -(1 << 20), INT32_MAX, INT32_MIN, 12345, -12345, 6144, 1365};
  for (int i = 0; i < 4000; i++) vals.push_back(static_cast<int32_t>(next()) >> (next() % 24));
  for (int32_t a : vals) {
    Slot sa = sx32(a);
    CHECK(fxRaw(o.sqrtOp(sa, 0)) == Ref<F>::sqrt(Ref<F>::raw(a)).v, "sqrt(%d)", a);
    CHECK(fxRaw(o.sinOp(sa, 0)) == Ref<F>::sin(Ref<F>::raw(a)).v, "sin(%d)", a);
    CHECK(fxRaw(o.cosOp(sa, 0)) == Ref<F>::cos(Ref<F>::raw(a)).v, "cos(%d)", a);
    CHECK(asD(o.toDouble(sa, 0)) == Ref<F>::raw(a).d(), "toDouble(%d)", a);
    int32_t want = static_cast<int32_t>(std::trunc(Ref<F>::raw(a).d()));
    CHECK(fxRaw(o.toInt(sa, 0)) == want, "toInt(%d): %d vs %d", a, fxRaw(o.toInt(sa, 0)), want);
    for (int k = 0; k < 4; k++) {
      int32_t b = vals[next() % vals.size()];
      Slot sb = sx32(b);
      CHECK(fxRaw(o.mul(sa, sb)) == (Ref<F>::raw(a) * Ref<F>::raw(b)).v, "mul(%d,%d)", a, b);
      CHECK(o.divOk(sa, sb) == (b != 0), "div defined (%d)", b);
      if (b != 0) CHECK(fxRaw(o.div(sa, sb)) == (Ref<F>::raw(a) / Ref<F>::raw(b)).v, "div(%d,%d)", a, b);
    }
  }
  // from double (rounding half up, wrap modulo 2^32, 0 for NaN and infinity) and from int
  for (double d : {0.0, 0.5, -0.5, 1.5, -1.5, 0.1, -0.1, 1e-7, 123e20, -123e20, 524287.99, 524288.0, 1e10, -1e10, 33.333333333333336, 0.30000000000000004, std::nan(""), HUGE_VAL})
    CHECK(fxRaw(o.fromDouble(fromD(d), 0)) == Ref<F>::from_d(d).v, "fromDouble(%g): %d vs %d", d, fxRaw(o.fromDouble(fromD(d), 0)), Ref<F>::from_d(d).v);
  for (int32_t i : {0, 1, -1, 100, -100, 524287, -524288})
    CHECK(fxRaw(o.fromInt(sx32(i), 0)) == static_cast<int32_t>(static_cast<uint32_t>(i) << F), "fromInt(%d)", i);
}

int main() {
  run<12>({MulFx12, DivFx12, DivFx12Defined, F64ToFx12, [](Slot x, Slot) { return Fx12ToF64(x, 0); }, [](Slot x, Slot) { return I32ToFx12(x, 0); }, [](Slot x, Slot) { return Fx12ToI32(x, 0); },
           [](Slot x, Slot) { return SqrtFx12(x, 0); }, [](Slot x, Slot) { return SinFx12(x, 0); }, [](Slot x, Slot) { return CosFx12(x, 0); }});
  run<16>({MulFx16, DivFx16, DivFx16Defined, F64ToFx16, [](Slot x, Slot) { return Fx16ToF64(x, 0); }, [](Slot x, Slot) { return I32ToFx16(x, 0); }, [](Slot x, Slot) { return Fx16ToI32(x, 0); },
           [](Slot x, Slot) { return SqrtFx16(x, 0); }, [](Slot x, Slot) { return SinFx16(x, 0); }, [](Slot x, Slot) { return CosFx16(x, 0); }});
  CHECK(std::string(DivFx12Message()) == "panic: fixed-point division by zero" && std::string(DivI32Message()) == "division by zero", "trap messages");
  if (failures) { std::printf("%d failures\n", failures); return 1; }
  std::printf("all checks passed\n");
  return 0;
}
