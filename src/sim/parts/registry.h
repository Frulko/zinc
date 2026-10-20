#pragma once
// The part types the simulator knows and their aliases (ZN-294): `wokwi-led` is `zn-led`. Chips themselves arrive with ZN-297 and the later tasks; the registry only names them.
#include <string>

namespace zn::sim {
std::string canonicalPartType(const std::string& type);   // the zn- name of a known type or alias, "" when unknown
bool knownPartType(const std::string& type);
}  // namespace zn::sim
