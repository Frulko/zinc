#pragma once
#include <stdint.h>

namespace zn_gl {
// One extra point closes a chunk without an ES 2 unsigned-int index extension.
static constexpr uint32_t fringe_edges = 21844; // (21844 + 1) * 3 <= 65536
inline void fringe_indices(uint16_t* out, uint32_t first, uint32_t next, uint32_t side) {
  const uint16_t a = (uint16_t)(first * 3), b = (uint16_t)(next * 3);
  const uint16_t q[6] = {a, b, (uint16_t)(b + side), a, (uint16_t)(b + side), (uint16_t)(a + side)};
  for (int i = 0; i < 6; ++i) out[i] = q[i];
}
template<class Vertex>
inline void fringe_point(Vertex* v, float x, float y, const float* m) {
  v[0].x = x; v[0].y = y; v[0].u = 0;
  v[1].x = x + 0.5f * m[0]; v[1].y = y + 0.5f * m[1]; v[1].u = m[2];
  v[2].x = x - 0.5f * m[0]; v[2].y = y - 0.5f * m[1]; v[2].u = m[2];
}
}
