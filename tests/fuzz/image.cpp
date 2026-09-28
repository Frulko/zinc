// PNG / JPEG decoding (stb_image v2.30, configured as plugins/three uses it: glTF textures) into a runtime image.
#include "fuzz.h"
#include "../../plugins/three/native/three.host.cpp"

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* d, size_t n) {
  if (n > (1 << 16)) return 0;
  int32_t id = decode_bytes(d, (uint32_t)n);
  if (id >= 0) zrt::raster::dyn_destroy(id);
  return 0;
}
