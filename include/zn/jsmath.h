#pragma once
// The Math functions whose last bits differ between libms (Apple arm64 and x86_64, glibc, newlib, musl), computed by V8's fdlibm
// port (third_party/ieee754) instead, so every engine on every CPU gives the bits Node gives (ZN-703). Plain C names: the
// interpreter and the AOT programs reach them through include/zn/ops.h, QuickJS-ng through its patch 0005.
#ifdef __cplusplus
extern "C" {
#endif
double zn_js_sin(double x);
double zn_js_cos(double x);
double zn_js_tan(double x);
double zn_js_exp(double x);
double zn_js_log(double x);
double zn_js_atan2(double y, double x);
double zn_js_pow(double x, double y);  // Math.pow and **, with JavaScript's rules where they differ from C's
#ifdef __cplusplus
}
#endif
