#pragma once
// Arithmetic from three.js r162/r186 (MIT; third_party/three/LICENSE).
// Keep JavaScript grouping; compile with -ffp-contract=off. Inputs are snapshots.
#include <algorithm>
#include <cmath>

namespace zn::three::math {

inline void multiply(double* out, const double* a, const double* b) {
  const double* ae = a;
  const double* be = b;
  double* te = out;
  const double a11 = ae[ 0 ], a12 = ae[ 4 ], a13 = ae[ 8 ], a14 = ae[ 12 ];
  const double a21 = ae[ 1 ], a22 = ae[ 5 ], a23 = ae[ 9 ], a24 = ae[ 13 ];
  const double a31 = ae[ 2 ], a32 = ae[ 6 ], a33 = ae[ 10 ], a34 = ae[ 14 ];
  const double a41 = ae[ 3 ], a42 = ae[ 7 ], a43 = ae[ 11 ], a44 = ae[ 15 ];
  const double b11 = be[ 0 ], b12 = be[ 4 ], b13 = be[ 8 ], b14 = be[ 12 ];
  const double b21 = be[ 1 ], b22 = be[ 5 ], b23 = be[ 9 ], b24 = be[ 13 ];
  const double b31 = be[ 2 ], b32 = be[ 6 ], b33 = be[ 10 ], b34 = be[ 14 ];
  const double b41 = be[ 3 ], b42 = be[ 7 ], b43 = be[ 11 ], b44 = be[ 15 ];
  te[ 0 ] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
  te[ 4 ] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
  te[ 8 ] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
  te[ 12 ] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
  te[ 1 ] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
  te[ 5 ] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
  te[ 9 ] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
  te[ 13 ] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
  te[ 2 ] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
  te[ 6 ] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
  te[ 10 ] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
  te[ 14 ] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
  te[ 3 ] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
  te[ 7 ] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
  te[ 11 ] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
  te[ 15 ] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
}

inline void invert186(double* out, const double* input) {
  // based on https://github.com/toji/gl-matrix
  const double* te = input;
  const double
  n11 = te[ 0 ], n21 = te[ 1 ], n31 = te[ 2 ], n41 = te[ 3 ],
  n12 = te[ 4 ], n22 = te[ 5 ], n32 = te[ 6 ], n42 = te[ 7 ],
  n13 = te[ 8 ], n23 = te[ 9 ], n33 = te[ 10 ], n43 = te[ 11 ],
  n14 = te[ 12 ], n24 = te[ 13 ], n34 = te[ 14 ], n44 = te[ 15 ],
  t1 = n11 * n22 - n21 * n12,
  t2 = n11 * n32 - n31 * n12,
  t3 = n11 * n42 - n41 * n12,
  t4 = n21 * n32 - n31 * n22,
  t5 = n21 * n42 - n41 * n22,
  t6 = n31 * n42 - n41 * n32,
  t7 = n13 * n24 - n23 * n14,
  t8 = n13 * n34 - n33 * n14,
  t9 = n13 * n44 - n43 * n14,
  t10 = n23 * n34 - n33 * n24,
  t11 = n23 * n44 - n43 * n24,
  t12 = n33 * n44 - n43 * n34;
  const double det = t1 * t12 - t2 * t11 + t3 * t10 + t4 * t9 - t5 * t8 + t6 * t7;
  if (det == 0) { std::fill_n(out, 16, 0.0); return; }
  const double detInv = 1 / det;
  out[ 0 ] = ( n22 * t12 - n32 * t11 + n42 * t10 ) * detInv;
  out[ 1 ] = ( n31 * t11 - n21 * t12 - n41 * t10 ) * detInv;
  out[ 2 ] = ( n24 * t6 - n34 * t5 + n44 * t4 ) * detInv;
  out[ 3 ] = ( n33 * t5 - n23 * t6 - n43 * t4 ) * detInv;
  out[ 4 ] = ( n32 * t9 - n12 * t12 - n42 * t8 ) * detInv;
  out[ 5 ] = ( n11 * t12 - n31 * t9 + n41 * t8 ) * detInv;
  out[ 6 ] = ( n34 * t3 - n14 * t6 - n44 * t2 ) * detInv;
  out[ 7 ] = ( n13 * t6 - n33 * t3 + n43 * t2 ) * detInv;
  out[ 8 ] = ( n12 * t11 - n22 * t9 + n42 * t7 ) * detInv;
  out[ 9 ] = ( n21 * t9 - n11 * t11 - n41 * t7 ) * detInv;
  out[ 10 ] = ( n14 * t5 - n24 * t3 + n44 * t1 ) * detInv;
  out[ 11 ] = ( n23 * t3 - n13 * t5 - n43 * t1 ) * detInv;
  out[ 12 ] = ( n22 * t8 - n12 * t10 - n32 * t7 ) * detInv;
  out[ 13 ] = ( n11 * t10 - n21 * t8 + n31 * t7 ) * detInv;
  out[ 14 ] = ( n24 * t2 - n14 * t4 - n34 * t1 ) * detInv;
  out[ 15 ] = ( n13 * t4 - n23 * t2 + n33 * t1 ) * detInv;
}

inline void invert162(double* out, const double* input) {
  // based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
  const double* te = input;
  const double
  n11 = te[ 0 ], n21 = te[ 1 ], n31 = te[ 2 ], n41 = te[ 3 ],
  n12 = te[ 4 ], n22 = te[ 5 ], n32 = te[ 6 ], n42 = te[ 7 ],
  n13 = te[ 8 ], n23 = te[ 9 ], n33 = te[ 10 ], n43 = te[ 11 ],
  n14 = te[ 12 ], n24 = te[ 13 ], n34 = te[ 14 ], n44 = te[ 15 ],
  t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44,
  t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44,
  t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44,
  t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const double det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det == 0) { std::fill_n(out, 16, 0.0); return; }
  const double detInv = 1 / det;
  out[ 0 ] = t11 * detInv;
  out[ 1 ] = ( n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44 ) * detInv;
  out[ 2 ] = ( n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44 ) * detInv;
  out[ 3 ] = ( n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43 ) * detInv;
  out[ 4 ] = t12 * detInv;
  out[ 5 ] = ( n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44 ) * detInv;
  out[ 6 ] = ( n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44 ) * detInv;
  out[ 7 ] = ( n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43 ) * detInv;
  out[ 8 ] = t13 * detInv;
  out[ 9 ] = ( n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44 ) * detInv;
  out[ 10 ] = ( n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44 ) * detInv;
  out[ 11 ] = ( n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43 ) * detInv;
  out[ 12 ] = t14 * detInv;
  out[ 13 ] = ( n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34 ) * detInv;
  out[ 14 ] = ( n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34 ) * detInv;
  out[ 15 ] = ( n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33 ) * detInv;
}

inline void compose(double* out, const double* position, const double* q, const double* scale) {
  double* te = out;
  const double x = q[0], y = q[1], z = q[2], w = q[3];
  const double x2 = x + x,	y2 = y + y, z2 = z + z;
  const double xx = x * x2, xy = x * y2, xz = x * z2;
  const double yy = y * y2, yz = y * z2, zz = z * z2;
  const double wx = w * x2, wy = w * y2, wz = w * z2;
  const double sx = scale[0], sy = scale[1], sz = scale[2];
  te[ 0 ] = ( 1 - ( yy + zz ) ) * sx;
  te[ 1 ] = ( xy + wz ) * sx;
  te[ 2 ] = ( xz - wy ) * sx;
  te[ 3 ] = 0;
  te[ 4 ] = ( xy - wz ) * sy;
  te[ 5 ] = ( 1 - ( xx + zz ) ) * sy;
  te[ 6 ] = ( yz + wx ) * sy;
  te[ 7 ] = 0;
  te[ 8 ] = ( xz + wy ) * sz;
  te[ 9 ] = ( yz - wx ) * sz;
  te[ 10 ] = ( 1 - ( xx + yy ) ) * sz;
  te[ 11 ] = 0;
  te[ 12 ] = position[0];
  te[ 13 ] = position[1];
  te[ 14 ] = position[2];
  te[ 15 ] = 1;
}

inline void invert3(double* out, const double* input) {
  const double* te = input;
  const double
  n11 = te[ 0 ], n21 = te[ 1 ], n31 = te[ 2 ],
  n12 = te[ 3 ], n22 = te[ 4 ], n32 = te[ 5 ],
  n13 = te[ 6 ], n23 = te[ 7 ], n33 = te[ 8 ],
  t11 = n33 * n22 - n32 * n23,
  t12 = n32 * n13 - n33 * n12,
  t13 = n23 * n12 - n22 * n13,
  det = n11 * t11 + n21 * t12 + n31 * t13;
  if (det == 0) { std::fill_n(out, 9, 0.0); return; }
  const double detInv = 1 / det;
  out[ 0 ] = t11 * detInv;
  out[ 1 ] = ( n31 * n23 - n33 * n21 ) * detInv;
  out[ 2 ] = ( n32 * n21 - n31 * n22 ) * detInv;
  out[ 3 ] = t12 * detInv;
  out[ 4 ] = ( n33 * n11 - n31 * n13 ) * detInv;
  out[ 5 ] = ( n31 * n12 - n32 * n11 ) * detInv;
  out[ 6 ] = t13 * detInv;
  out[ 7 ] = ( n21 * n13 - n23 * n11 ) * detInv;
  out[ 8 ] = ( n22 * n11 - n21 * n12 ) * detInv;
}

inline void normal(double* out, const double* m) {
  const double a[] = {m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]};
  invert3(out, a);
  std::swap(out[1], out[3]); std::swap(out[2], out[6]); std::swap(out[5], out[7]);
}

inline void vector3(double* out, const double* v, const double* m) {
  const double x = v[0], y = v[1], z = v[2];
  const double* e = m;
  const double w = 1 / ( e[ 3 ] * x + e[ 7 ] * y + e[ 11 ] * z + e[ 15 ] );
  out[0] = ( e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ] ) * w;
  out[1] = ( e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ] ) * w;
  out[2] = ( e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] ) * w;
}

inline void vector4(double* out, const double* v, const double* m) {
  const double x = v[0], y = v[1], z = v[2], w = v[3];
  const double* e = m;
  out[0] = e[ 0 ] * x + e[ 4 ] * y + e[ 8 ] * z + e[ 12 ] * w;
  out[1] = e[ 1 ] * x + e[ 5 ] * y + e[ 9 ] * z + e[ 13 ] * w;
  out[2] = e[ 2 ] * x + e[ 6 ] * y + e[ 10 ] * z + e[ 14 ] * w;
  out[3] = e[ 3 ] * x + e[ 7 ] * y + e[ 11 ] * z + e[ 15 ] * w;
}

inline double maxScale(const double* te) {
  const double x = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
  const double y = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
  const double z = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];
  if (std::isnan(x) || std::isnan(y) || std::isnan(z)) return NAN;
  return std::sqrt(std::max({x, y, z}));
}
inline void sphere(double* out, const double* input, const double* m) {
  vector3(out, input, m);
  out[3] = input[3] * maxScale(m);
}
inline bool intersects(const double* planes, const double* sphere) {
  const double negRadius = -sphere[3];
  for (int i = 0; i < 6; ++i) {
    const double* p = planes + i * 4;
    const double distance = (p[0] * sphere[0] + p[1] * sphere[1] + p[2] * sphere[2]) + p[3];
    if (distance < negRadius) return false;
  }
  return true;
}

enum class Euler { XYZ, YXZ, ZXY, ZYX, YZX, XZY };
inline void quaternion(double* out, Euler order, const double* c, const double* s) {
  const double c1=c[0], c2=c[1], c3=c[2], s1=s[0], s2=s[1], s3=s[2];
  switch ( order ) {
  case Euler::XYZ:
  out[0] = s1 * c2 * c3 + c1 * s2 * s3;
  out[1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[3] = c1 * c2 * c3 - s1 * s2 * s3;
  break;
  case Euler::YXZ:
  out[0] = s1 * c2 * c3 + c1 * s2 * s3;
  out[1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[3] = c1 * c2 * c3 + s1 * s2 * s3;
  break;
  case Euler::ZXY:
  out[0] = s1 * c2 * c3 - c1 * s2 * s3;
  out[1] = c1 * s2 * c3 + s1 * c2 * s3;
  out[2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[3] = c1 * c2 * c3 - s1 * s2 * s3;
  break;
  case Euler::ZYX:
  out[0] = s1 * c2 * c3 - c1 * s2 * s3;
  out[1] = c1 * s2 * c3 + s1 * c2 * s3;
  out[2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[3] = c1 * c2 * c3 + s1 * s2 * s3;
  break;
  case Euler::YZX:
  out[0] = s1 * c2 * c3 + c1 * s2 * s3;
  out[1] = c1 * s2 * c3 + s1 * c2 * s3;
  out[2] = c1 * c2 * s3 - s1 * s2 * c3;
  out[3] = c1 * c2 * c3 - s1 * s2 * s3;
  break;
  case Euler::XZY:
  out[0] = s1 * c2 * c3 - c1 * s2 * s3;
  out[1] = c1 * s2 * c3 - s1 * c2 * s3;
  out[2] = c1 * c2 * s3 + s1 * s2 * c3;
  out[3] = c1 * c2 * c3 + s1 * s2 * s3;
  break;
  default: return;
  }
}

inline void pivot(double* te, const double* p) {
  const double px=p[0], py=p[1], pz=p[2];
  te[12] += px - te[0] * px - te[4] * py - te[8] * pz;
  te[13] += py - te[1] * px - te[5] * py - te[9] * pz;
  te[14] += pz - te[2] * px - te[6] * py - te[10] * pz;
}
}  // namespace zn::three::math
