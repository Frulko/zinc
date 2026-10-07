#include "frontend/profile.h"

namespace zn::frontend {
namespace {
// The table of compiler/src/cli.ts (PROFILES), the one the prototype's targets use.
constexpr Profile kProfiles[] = {
    {"macos", Num::f64, 320, 240, false, 512ull << 20, false},
    {"linux", Num::f64, 320, 240, false, 512ull << 20, false},
    {"sim", Num::f64, 320, 240, false, 512ull << 20, false},
    {"wasm", Num::f64, 320, 240, false, 64ull << 20, false},
    {"rpi1", Num::f64, 1280, 720, false, 64ull << 20, false},
    {"esp32", Num::f32, 320, 240, true, 160ull << 10, false},
    {"ps2", Num::f32, 640, 448, false, 16ull << 20, false},
    {"ps1", Num::fx12, 320, 240, true, 256ull << 10, true},
    {"rmpp", Num::f64, 1620, 2160, false, 256ull << 20, false},
};
}  // namespace

const Profile* findProfile(const std::string& name) {
  for (const Profile& p : kProfiles) if (name == p.name) return &p;
  return nullptr;
}
std::vector<std::string> profileNames() {
  std::vector<std::string> out;
  for (const Profile& p : kProfiles) out.push_back(p.name);
  return out;
}
namespace {
const Profile* gCurrent = nullptr;
bool gForce = false;
}  // namespace
void applyProfile(const Profile& p) { gCurrent = &p; setNumberAlias(p.number); }
const Profile* currentProfile() { return gCurrent; }
void setForce(bool on) { gForce = on; }
bool force() { return gForce; }

}  // namespace zn::frontend
