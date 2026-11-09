#pragma once
// Platform capabilities (targets/capabilities.json, docs/targets/capabilities.md; ZN-122): what a profile offers and the `requires` of programs, plugins and tests.
#include <map>
#include <string>
#include <vector>

#include "frontend/profile.h"

namespace zn::frontend {

// capability name -> "true", "false", "plugin", "optional", a number (heap in bytes, width, height) or a string (numbers = f64)
using Caps = std::map<std::string, std::string>;

/** The hardware flags of the profile from `<engineRoot>/targets/capabilities.json`, plus heap, numbers, fpu, width and height of the profile table. */
Caps capsFor(const Profile& p, const std::string& engineRoot);
/** The same from the file itself (a path to targets/capabilities.json). */
Caps capsFromFile(const Profile& p, const std::string& capabilitiesJson);
/** Whether the list `key` of the profile ("modules", "plugins") names `word`. */
inline bool capsList(const Caps& caps, const std::string& key, const std::string& word) {
  auto it = caps.find(key);
  return it != caps.end() && it->second.find(" " + word + " ") != std::string::npos;
}
/** One requirement: `touch`, `touch|pointer`, `!eink`, `heap>=256K`, `numbers=f64`. */
bool satisfied(const std::string& req, const Caps& caps);
/** "heap>=256K (esp32 has heap 160K)": a readable reason for each requirement that does not hold, joined by ", " (empty: compatible). */
std::string explain(const std::vector<std::string>& requires_, const Caps& caps, const std::string& profile);

}  // namespace zn::frontend
