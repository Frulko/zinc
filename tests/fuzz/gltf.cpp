// three (plugins/three): a .gltf / .glb document, then every scene, node, mesh primitive and material query the
// loader makes (GLTFLoader.js). Embedded images go through stb_image (image.cpp fuzzes that alone).
#include "fuzz.h"
#include "../../plugins/three/native/three.host.cpp"
using namespace zrt;

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 16)) return 0;
  static NativeThree* t = zinc_create_Three();
  Array<uint8_t> bytes = Array<uint8_t>::with_cap((int32_t)n);
  for (size_t i = 0; i < n; i++) bytes.push(d[i]);
  int32_t h = t->parse(bytes);
  if (h < 0) { zfuzz::clear(); return 0; }
  (void)t->assetInfo(h);
  for (int32_t i = 0; i < t->bufferCount(h) && i < 16; i++) (void)t->bufferUri(h, i);
  for (int32_t i = 0; i < t->imageCount(h) && i < 4; i++) { (void)t->imageUri(h, i); int32_t id = t->imageDecode(h, i); if (id >= 0) raster::dyn_destroy(id); }
  Array<int32_t> ids = Array<int32_t>::with_cap(0);
  for (int32_t s = 0; s < t->sceneCount(h) && s < 16; s++) { (void)t->sceneName(h, s); t->sceneNodes(h, s, ids); }
  Array<double> xf = Array<double>::with_cap(0);
  for (int32_t k = 0; k < t->nodeCount(h) && k < 256; k++) { (void)t->nodeName(h, k); (void)t->nodeMesh(h, k); t->nodeChildren(h, k, ids); t->nodeTransform(h, k, xf); }
  for (int32_t m = 0; m < t->meshCount(h) && m < 64; m++) {
    (void)t->meshName(h, m);
    for (int32_t p = 0; p < t->primitiveCount(h, m) && p < 16; p++) {
      Array<double> pos = Array<double>::with_cap(0), nrm = Array<double>::with_cap(0), uv = Array<double>::with_cap(0), col = Array<double>::with_cap(0);
      Array<int32_t> idx = Array<int32_t>::with_cap(0);
      (void)t->primitive(h, m, p, pos, nrm, uv, col, idx);
    }
  }
  for (int32_t m = 0; m < t->materialCount(h) && m < 64; m++) { (void)t->materialName(h, m); t->materialColor(h, m, xf); (void)t->materialTexture(h, m); (void)t->materialFlags(h, m); }
  t->free(h);
  zfuzz::clear();
  return 0;
}
