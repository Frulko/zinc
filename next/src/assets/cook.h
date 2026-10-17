#pragma once
#include <cstdint>
#include <map>
#include <string>
#include <vector>

namespace zn::assets {

struct CookProfile {
  std::string name;
  std::uint32_t triBudget = 0;
  int posBits = 16;
  bool floatPos = false;  // only true profiles may emit float positions
};

struct CookReceipt {
  std::string scene;
  std::string profile;
  std::uint64_t triangles = 0;
  std::uint64_t vertices = 0;
  double quantErr = 0.0;
  std::vector<std::pair<std::string, std::uint64_t>> lodTris;
  bool ok = true;
  std::string error;
};

/** Cook a glTF scene into a quantized, LOD'd mesh pack for `profile`. Writes `outDir/<profile>.zcook` and `outDir/<profile>.receipt.json`.
 *  Returns false with `err` on budget overrun or io failure. */
bool cook(const std::string& gltfPath, const CookProfile& profile, const std::string& outDir, CookReceipt& receipt, std::string& err);

}  // namespace zn::assets