#include "frontend/style_level.h"

#include <cctype>
#include <cmath>
#include <regex>

#include "frontend/capabilities.h"
#include "frontend/lexer.h"

namespace zn::frontend {

const char* styleLevel(int tier) { return tier <= 0 ? "core" : tier <= 2 ? "extended" : "full"; }

int profileTier(const Profile& p, const std::string& capsFile) {
  const Caps caps = capsFromFile(p, capsFile);
  const auto t = caps.find("tier");
  return t != caps.end() && t->second.size() == 2 && t->second[0] == 'T' && t->second[1] >= '0' && t->second[1] <= '4' ? t->second[1] - '0' : 1;
}

namespace {
// The words of zinc:ui's painter (lib/std/ui.ts paintGradient, tierWarn), so the build and the run-time line say the same thing.
const char* const kConic = "a conic gradient is drawn as the average of its stops";
const char* const kStops = "a gradient beyond two stops along an axis is drawn from its first to its last colour";

bool offAxis(double deg) { return std::fmod(std::fabs(deg), 90.0) != 0; }

// bg-[linear-gradient(...)]'s arguments (spaces are `_` in a token): more than two stops, a corner or an angle off the axes
bool linearBeyondTwo(const std::string& args) {
  std::vector<std::string> parts(1);
  int depth = 0;
  for (char c : args) {
    if (c == '(') ++depth;
    if (c == ')') --depth;
    if (c == ',' && depth == 0) parts.emplace_back(); else parts.back() += c;
  }
  std::size_t stops = parts.size();
  const std::string& first = parts[0];
  if (first.rfind("to_", 0) == 0) { --stops; if (first.find('_', 3) != std::string::npos) return true; }   // to_top_right: a corner
  else if (!first.empty() && (std::isdigit(static_cast<unsigned char>(first[0])) || first[0] == '-' || first[0] == '.')) {
    --stops;
    const double v = std::strtod(first.c_str(), nullptr);
    if (first.find("turn") != std::string::npos ? offAxis(v * 360) : first.find("rad") != std::string::npos ? offAxis(v * 180 / 3.141592653589793) : offAxis(v)) return true;
  }
  // ponytail: stop positions and stop alphas are not looked at here; zinc:ui's line at run time still names the gradient
  return stops > 2;
}
}  // namespace

int styleTokenTier(const std::string& raw, std::string& what) {
  std::string t = raw;
  if (!t.empty() && t[0] == '@') t.erase(0, 1);   // a style object's token
  std::size_t cut = 0;
  int depth = 0;
  for (std::size_t i = 0; i < t.size(); ++i) {   // hover:, md:, data-[x=y]: the variants before the token
    if (t[i] == '[') ++depth;
    else if (t[i] == ']') --depth;
    else if (t[i] == ':' && depth == 0) cut = i + 1;
  }
  t = t.substr(cut);
  if (t.size() < 4) return 0;
  static const std::regex conic(R"(^(-?bg-conic(-\d+(\.\d+)?)?(/[a-z]+)?|bg-conic-\[\S+\]|bg-\[(repeating-)?conic-gradient\(.*)$)");
  static const std::regex beyond(R"(^(via-.+|bg-radial.*|bg-\[(repeating-linear|radial|repeating-radial)-gradient\(.*)$)");
  static const std::regex angle(R"(^-?bg-linear-(\d+(\.\d+)?)(/[a-z]+)?$)"), arbitrary(R"(^bg-linear-\[(-?\d+(\.\d+)?)deg\]$)");
  static const std::regex stopAt(R"(^(from|to)-(\d+(\.\d+)?)%$)"), linear(R"(^bg-\[linear-gradient\((.*)\)\]$)");
  std::smatch m;
  if (std::regex_match(t, conic)) { what = kConic; return 3; }
  if (std::regex_match(t, beyond)) { what = kStops; return 2; }
  if ((std::regex_match(t, m, angle) || std::regex_match(t, m, arbitrary)) && offAxis(std::strtod(m[1].str().c_str(), nullptr))) { what = kStops; return 2; }
  if (std::regex_match(t, m, stopAt)) {   // from-0% and to-100% are where the stops are anyway
    const double v = std::strtod(m[2].str().c_str(), nullptr);
    if (m[1].str() == "from" ? v > 0 : v < 100) { what = kStops; return 2; }
  }
  if (std::regex_match(t, m, linear) && linearBeyondTwo(m[1].str())) { what = kStops; return 2; }
  return 0;
}

std::vector<StyleUse> styleUses(std::string_view text, int tier) {
  std::vector<StyleUse> out;
  if (tier >= 3) return out;   // every token the painter knows is drawn as written from T3 up
  for (const Token& k : lex(text, false)) {
    if ((k.kind != Tok::String && k.kind != Tok::TemplateNoSub) || k.end < k.start + 2) continue;
    const std::string_view s = text.substr(k.start + 1, k.end - k.start - 2);
    if (s.find("bg-") == std::string_view::npos && s.find("via-") == std::string_view::npos && s.find("from-") == std::string_view::npos && s.find("to-") == std::string_view::npos) continue;
    for (std::size_t at = 0; at < s.size();) {
      while (at < s.size() && std::isspace(static_cast<unsigned char>(s[at]))) ++at;
      std::size_t end = at;
      while (end < s.size() && !std::isspace(static_cast<unsigned char>(s[end]))) ++end;
      const std::string word(s.substr(at, end - at));
      std::string what;
      if (const int need = word.empty() ? 0 : styleTokenTier(word, what); need > tier) {
        std::string shown = word;   // a style object's value as it was written: @bg-[linear-gradient(45deg,_red,_blue)] is 'linear-gradient(45deg, red, blue)'
        if (shown.rfind("@bg-[", 0) == 0 && shown.back() == ']') { shown = shown.substr(5, shown.size() - 6); for (char& c : shown) if (c == '_') c = ' '; }
        out.push_back({static_cast<std::uint32_t>(k.start + 1 + at), shown, what, need});
      }
      at = end;
    }
  }
  return out;
}

}  // namespace zn::frontend
