// zinc:map (plugins/map): first byte even, a MapLibre style (JSON); odd, a Mapbox Vector Tile (protobuf), decoded,
// filled, stroked and queried for label properties the way render_tile does.
#include "fuzz.h"
#include "../../plugins/map/native/map.host.cpp"

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n < 1 || n > (1 << 16)) return 0;
  if (!(d[0] & 1)) {
    static NativeMapEngine* e = zinc_create_MapEngine();
    (void)e->setStyle(zfuzz::str(d + 1, n - 1));
    zfuzz::clear();
    return 0;
  }
  Vec<Layer> ls;
  parse_tile(d + 1, (uint32_t)(n - 1), ls);
  static uint32_t px[TILE * TILE];
  static const char* keys[] = {"$type", "class", "name", "rank", ""};
  for (uint32_t l = 0; l < ls.n; l++) for (uint32_t f = 0; f < ls[l].feats.n; f++) {
    const Feature& ft = ls[l].feats[f];
    Vec<float> pts, strokes; float bb[4];
    decode(ft, (float)TILE / ls[l].extent, 0, 0, pts, bb);
    if (ft.type == 3) fill(px, pts.p, pts.n, 0xFF336699, 1);
    for (uint32_t i = 0; i < pts.n; i += 1 + 2 * (uint32_t)pts[i]) stroke_into(strokes, &pts[i + 1], (uint32_t)pts[i], 2, ft.type == 3);
    if (strokes.n) fill(px, strokes.p, strokes.n, 0xFF000000, 1);
    Feat q{&ls[l], &ft}; Val v;
    for (const char* k : keys) (void)get(q, k, v);
    pts.release(); strokes.release();
  }
  free_layers(ls);
  return 0;
}
