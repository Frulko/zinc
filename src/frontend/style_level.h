#pragma once
// Style levels (ZN-278, docs/reports/ui-style-system.md 5.6): what zinc:ui draws of a style on the drawing tier of a profile. The level is the
// profile's `tier` of targets/capabilities.json (T0 core, T1 and T2 extended, T3 and T4 full), the one zinc:ui's painter reads as TIER, so the
// build and the painter never disagree. A style token written in a program that its profile does not draw as written is reported when the program
// is built: a warning U0005 by default, an error under zinc.json "ui": {"style": "strict"}, nothing under "off".
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "frontend/profile.h"

namespace zn::frontend {

/** "core", "extended" or "full" for a drawing tier 0..4. */
const char* styleLevel(int tier);
/** The drawing tier of `p` in targets/capabilities.json (`capsFile`); a profile with no row there draws as tier 1, as zinc:platform says. */
int profileTier(const Profile& p, const std::string& capsFile);
/** The lowest tier that draws the class token `token` (or the token a style object lowers to, `@bg-[conic-gradient(..)]`) as written, and in
 *  `what` what a lower tier draws instead; 0 when every tier draws it. A variant prefix (`hover:`, `md:`) is looked through. */
int styleTokenTier(const std::string& token, std::string& what);

/** A token of a program's text that its profile does not draw as written. */
struct StyleUse { std::uint32_t pos; std::string token, what; int tier; };   // pos: in the text scanned; token: as written in the source; tier: the lowest one that draws it
/** The tokens in the string literals of `text` (TypeScript, after the JSX and StyleSheet lowering) that `tier` does not draw as written. */
std::vector<StyleUse> styleUses(std::string_view text, int tier);

}  // namespace zn::frontend
