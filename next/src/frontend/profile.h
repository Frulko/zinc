#pragma once
// Target profiles (ZN-120): what `number` means, the heap budget, the default screen and the typing mode of a target.
// `zinc run|build|test --profile esp32` (or "profile" in zinc.json) applies one on the host.
#include <cstdint>
#include <string>
#include <vector>

#include "frontend/check.h"

namespace zn::frontend {

struct Profile {
  const char* name;
  Num number;                 // the type behind `number`: f64, f32 or fx12
  int width, height;          // default screen
  bool strict;                // strict typing (no `any`, no dynamic features)
  std::uint64_t heapBytes;    // heap budget of the target
  bool noFpu;
};

const Profile* findProfile(const std::string& name);
std::vector<std::string> profileNames();
/** Applies the number alias of `p` to the checker. */
void applyProfile(const Profile& p);

}  // namespace zn::frontend
