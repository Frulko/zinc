#pragma once
#include "zn/shortest.h"
#include <cctype>
#include <set>
#include <limits>
#include <algorithm>
#include <cmath>
#include <cstring>
#include <ctime>
#include <string>
#include <vector>
#if defined(__APPLE__)
#include <dlfcn.h>
#endif

namespace zn::host::intl {
inline std::vector<std::string> split(const std::string& s, char sep = '|') {
  std::vector<std::string> out; size_t p = 0;
  for (;;) { const auto q = s.find(sep, p); out.push_back(s.substr(p, q - p)); if (q == std::string::npos) return out; p = q + 1; }
}
#if defined(__APPLE__)
// CoreFoundation owns its data. Each call owns and releases its locale, zone and formatter; no native handles escape.
struct CF {
  void* lib = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL);
  template<class T> T fn(const char* name) const { return lib ? reinterpret_cast<T>(dlsym(lib, name)) : nullptr; }
  const void* key(const char* name) const { const auto p = fn<const void**>(name); return p ? *p : nullptr; }
  const void* string(const std::string& s) const { const auto f = fn<const void*(*)(const void*, const char*, unsigned)>("CFStringCreateWithCString"); return f ? f(nullptr, s.c_str(), 0x08000100) : nullptr; }
  void release(const void* p) const { if (p) fn<void(*)(const void*)>("CFRelease")(p); }
  std::string text(const void* p) const {
    if (!p) return "!OS formatter unavailable";
    const auto len = fn<long(*)(const void*)>("CFStringGetLength")(p);
    std::string s(static_cast<size_t>(len) * 4 + 1, '\0');
    if (!fn<unsigned char(*)(const void*, char*, long, unsigned)>("CFStringGetCString")(p, s.data(), static_cast<long>(s.size()), 0x08000100)) return "!OS formatter encoding failed";
    s.resize(std::strlen(s.c_str())); return s;
  }
  ~CF() { if (lib) dlclose(lib); }
};
struct Owned {
  const CF& cf; const void* p;
  Owned(const CF& c, const void* v) : cf(c), p(v) {}
  Owned(const Owned&) = delete; Owned& operator=(const Owned&) = delete;
  ~Owned() { cf.release(p); }
};
inline bool osAvailable() { CF cf; return cf.fn<void*>("CFNumberFormatterCreate") && cf.fn<void*>("CFDateFormatterCreateDateFormatFromTemplate"); }
#else
inline bool osAvailable() { return false; }
#endif
inline std::string canonical(const std::string& input) {
  auto p = split(input, '-');
  auto alpha = [](const std::string& s) { return !s.empty() && std::all_of(s.begin(), s.end(), [](unsigned char c) { return c >= 'a' && c <= 'z'; }); };
  auto digit = [](const std::string& s) { return !s.empty() && std::all_of(s.begin(), s.end(), [](unsigned char c) { return c >= '0' && c <= '9'; }); };
  for (auto& part : p) {
    if (part.empty() || part.size() > 8) return "!Invalid language tag: " + input;
    for (char& c : part) { c = static_cast<char>(std::tolower(static_cast<unsigned char>(c))); if (!((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'))) return "!Invalid language tag: " + input; }
  }
  if (p[0].size() < 2 || p[0].size() == 4 || !alpha(p[0])) return "!Invalid language tag: " + input;
  size_t i = 1;
  if (i < p.size() && p[i].size() == 4 && alpha(p[i])) { p[i][0] = static_cast<char>(std::toupper(static_cast<unsigned char>(p[i][0]))); ++i; }
  if (i < p.size() && ((p[i].size() == 2 && alpha(p[i])) || (p[i].size() == 3 && digit(p[i])))) { for (char& c : p[i]) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c))); ++i; }
  std::set<std::string> variants;
  while (i < p.size() && (p[i].size() >= 5 || (p[i].size() == 4 && p[i][0] >= '0' && p[i][0] <= '9'))) { if (!variants.insert(p[i++]).second) return "!Invalid language tag: " + input; }
  std::set<char> extensions;
  while (i < p.size() && p[i].size() == 1) {
    const char key = p[i++][0]; if (!extensions.insert(key).second) return "!Invalid language tag: " + input;
    const size_t begin = i;
    while (i < p.size() && (key == 'x' || p[i].size() >= 2)) ++i;
    if (i == begin) return "!Invalid language tag: " + input;
  }
  if (i != p.size()) return "!Invalid language tag: " + input;
  std::string result;
  for (const auto& part : p) { if (!result.empty()) result += '-'; result += part; }
  return result;
}
inline bool hostAvailable(const std::string& host) {
#if defined(__APPLE__)
  CF cf;
  if (cf.lib) {
    Owned names(cf, cf.fn<const void*(*)()>("CFLocaleCopyAvailableLocaleIdentifiers")());
    const auto count = cf.fn<long(*)(const void*)>("CFArrayGetCount")(names.p);
    for (long i = 0; i < count; ++i) {
      auto candidate = cf.text(cf.fn<const void*(*)(const void*, long)>("CFArrayGetValueAtIndex")(names.p, i));
      std::replace(candidate.begin(), candidate.end(), '_', '-');
      if (canonical(candidate) == host) return true;
    }
  }
#else
  (void)host;
#endif
  return false;
}
inline std::string supported(const std::string& tag, const std::string& host) {
  if (tag == "en" || tag == "en-US") return tag;
  if (!osAvailable()) return "";
  if (tag == "fr" || tag == "fr-FR") return tag;
  return tag == host && hostAvailable(host) ? host : "";
}
inline std::string locale(const std::string& requests, bool filter, const std::string& host) {
  std::string result, chosen; std::set<std::string> seen;
  if (!requests.empty()) for (const auto& request : split(requests, '\n')) {
    const auto tag = canonical(request); if (tag[0] == '!') return tag;
    const auto match = supported(tag, host);
    if (!match.empty()) { if (chosen.empty()) chosen = match; if (seen.insert(tag).second) { if (!result.empty()) result += '\n'; result += tag; } }
  }
  if (filter) return result;
  if (!chosen.empty()) return chosen;
  const auto fallback = supported(canonical(host), canonical(host)); return fallback.empty() ? "en-US" : fallback;
}
inline std::string zone(const std::string& request) {
  std::string name = request;
  if (name.empty()) {
    if (const char* tz = std::getenv("TZ"); tz && *tz) name = tz;
    else if (std::getenv("ZINC_DETERMINISTIC")) return "UTC";
  }
  if (name == "UTC" || name == "GMT" || name == "Etc/UTC" || name == "Etc/GMT" || name == "utc") return "UTC";
#if defined(__APPLE__)
  CF cf;
  if (cf.lib) {
    if (name.empty()) {
      Owned tz(cf, cf.fn<const void*(*)()>("CFTimeZoneCopyDefault")());
      return cf.text(cf.fn<const void*(*)(const void*)>("CFTimeZoneGetName")(tz.p));
    }
    Owned names(cf, cf.fn<const void*(*)()>("CFTimeZoneCopyKnownNames")());
    const auto count = cf.fn<long(*)(const void*)>("CFArrayGetCount")(names.p);
    std::string lower = name; for (char& c : lower) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    for (long i = 0; i < count; ++i) {
      std::string candidate = cf.text(cf.fn<const void*(*)(const void*, long)>("CFArrayGetValueAtIndex")(names.p, i));
      std::string folded = candidate; for (char& c : folded) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      if (folded == lower) return candidate;
    }
  }
#else
  if (name.empty()) return "UTC"; // shortcut: portable Intl has UTC only; add an OS zone backend when a caller needs it.
#endif
  return "!Unsupported or invalid Intl timeZone: " + request;
}
inline std::string decimal(double value, int lo, int hi, bool group) {
  if (std::isnan(value)) return "NaN";
  if (std::isinf(value)) return std::signbit(value) ? "-∞" : "∞";
  const bool neg = std::signbit(value);
  char buf[64]; const auto end = zn::shortestDouble(buf, buf + sizeof buf, std::abs(value), false);
  std::string s(buf, end); int exponent = 0;
  const auto e = s.find_first_of("eE"); if (e != std::string::npos) { exponent = static_cast<int>(std::strtol(s.c_str() + e + 1, nullptr, 10)); s.resize(e); }
  auto dot = s.find('.'); int point = static_cast<int>(dot == std::string::npos ? s.size() : dot) + exponent;
  if (dot != std::string::npos) s.erase(dot, 1);
  if (point < 0) { s.insert(0, static_cast<size_t>(-point), '0'); point = 0; }
  const size_t keep = static_cast<size_t>(point + hi);
  if (s.size() > keep) {
    const bool up = s[keep] >= '5'; s.resize(keep);
    if (up) { size_t i = s.size(); while (i && s[i - 1] == '9') s[--i] = '0'; if (i) ++s[i - 1]; else { s.insert(0, 1, '1'); ++point; } }
  }
  if (s.size() < static_cast<size_t>(point)) s.append(static_cast<size_t>(point) - s.size(), '0');
  std::string ip = point ? s.substr(0, static_cast<size_t>(point)) : "0", fp = s.substr(static_cast<size_t>(point));
  while (fp.size() > static_cast<size_t>(lo) && fp.back() == '0') fp.pop_back();
  if (fp.size() < static_cast<size_t>(lo)) fp.append(static_cast<size_t>(lo) - fp.size(), '0');
  if (group) for (int p = static_cast<int>(ip.size()) - 3; p > 0; p -= 3) ip.insert(static_cast<size_t>(p), ",");
  return (neg ? "-" : "") + ip + (fp.empty() ? "" : "." + fp);
}
inline std::string number(const std::string& locale, double value, double loValue, double hiValue, bool group) {
  if (!std::isfinite(loValue) || !std::isfinite(hiValue) || loValue < 0 || hiValue < loValue || hiValue > 20 || std::floor(loValue) != loValue || std::floor(hiValue) != hiValue) return "!Invalid Intl fraction digits";
  const int lo = static_cast<int>(loValue), hi = static_cast<int>(hiValue);
  if (lo < 0 || hi < lo || hi > 20) return "!Invalid Intl fraction digits";
#if defined(__APPLE__)
  CF cf;
  if (cf.lib) {
    Owned id(cf, cf.string(locale + "@numbers=latn"));
    Owned loc(cf, cf.fn<const void*(*)(const void*, const void*)>("CFLocaleCreate")(nullptr, id.p));
    Owned fmt(cf, cf.fn<const void*(*)(const void*, const void*, long)>("CFNumberFormatterCreate")(nullptr, loc.p, 1));
    if (!fmt.p) return "!OS number formatter unavailable";
    auto set = cf.fn<void(*)(const void*, const void*, const void*)>("CFNumberFormatterSetProperty");
    for (const auto& pair : {std::pair{"kCFNumberFormatterMinFractionDigits", lo}, {"kCFNumberFormatterMaxFractionDigits", hi}, {"kCFNumberFormatterRoundingMode", 6}, {"kCFNumberFormatterMaxIntegerDigits", 309}}) {
      int v = pair.second; Owned n(cf, cf.fn<const void*(*)(const void*, long, const void*)>("CFNumberCreate")(nullptr, 9, &v)); set(fmt.p, cf.key(pair.first), n.p);
    }
    set(fmt.p, cf.key("kCFNumberFormatterUseGroupingSeparator"), cf.key(group ? "kCFBooleanTrue" : "kCFBooleanFalse"));
    Owned out(cf, cf.fn<const void*(*)(const void*, const void*, long, const void*)>("CFNumberFormatterCreateStringWithValue")(nullptr, fmt.p, 13, &value));
    return cf.text(out.p);
  }
#endif
  if ((locale != "en-US" && locale != "en")) return "!Intl locale requires an OS formatter";
  return decimal(value, lo, hi, group);
}
inline std::string skeleton(const std::string& locale, const std::string& spec) {
  const auto p = split(spec); if (p.size() != 8) return "!Invalid Intl date options";
  const bool twelve = p[7] == "12" || (p[7].empty() && (locale == "en-US" || locale == "en"));
  std::string pattern;
  for (size_t i = 0; i < 7; ++i) {
    const auto& v = p[i]; if (v.empty()) continue;
    const char c = i == 0 ? 'y' : i == 1 ? 'M' : i == 2 ? 'd' : i == 3 ? 'E' : i == 4 ? (p[7].empty() ? 'j' : twelve ? 'h' : 'H') : i == 5 ? 'm' : 's';
    const int n = v == "2-digit" ? 2 : v == "short" ? 3 : v == "long" ? 4 : v == "narrow" ? 5 : 1;
    pattern.append(static_cast<size_t>(n), c);
  }
  return pattern;
}
#if defined(__APPLE__)
inline std::string pattern(const CF& cf, const void* loc, const std::string& locale, const std::string& spec) {
  Owned skel(cf, cf.string(skeleton(locale, spec)));
  Owned resolved(cf, cf.fn<const void*(*)(const void*, const void*, unsigned long, const void*)>("CFDateFormatterCreateDateFormatFromTemplate")(nullptr, skel.p, 0, loc));
  if (!resolved.p) return "!OS date pattern unavailable";
  std::string text = cf.text(resolved.p);
  const auto options = split(spec);
  bool quoted = false;
  for (size_t i = 0; i < text.size();) {
    const char c = text[i];
    if (c == '\'') { quoted = !quoted; ++i; continue; }
    size_t end = i + 1; while (end < text.size() && text[end] == c) ++end;
    if (!quoted && options[4].size() && (c == 'h' || c == 'H' || c == 'K' || c == 'k')) {
      const size_t count = options[4] == "2-digit" || c == 'H' || c == 'k' ? 2 : 1;
      text.replace(i, end - i, count, c); i += count;
    } else i = end;
  }
  if ((locale == "en-US" || locale == "en")) for (size_t i; (i = text.find("\xe2\x80\xaf")) != std::string::npos;) text.replace(i, 3, " ");
  return text;
}
#endif
inline std::string portablePattern(const std::string& locale, const std::string& spec) {
  const auto p = split(spec); if (p.size() != 8) return "!Invalid Intl date options";
  const bool twelve = p[7] == "12" || (p[7].empty() && (locale == "en-US" || locale == "en"));
  auto token = [&](size_t i, char c) { const auto& v = p[i]; const size_t n = v == "2-digit" ? 2 : v == "short" ? 3 : v == "long" ? 4 : v == "narrow" ? 5 : 1; return v.empty() ? std::string() : std::string(n, c); };
  const bool numeric = p[1] == "numeric" || p[1] == "2-digit";
  const auto y = token(0, 'y'), month = token(1, 'M'), day = token(2, 'd'), weekday = token(3, 'E');
  std::string date = month;
  if (!day.empty()) { if (!date.empty()) date += numeric ? "/" : " "; date += day; }
  if (!y.empty()) { if (!date.empty()) date += numeric ? "/" : (!day.empty() ? ", " : " "); date += y; }
  if (month.empty() && !y.empty() && !day.empty()) date = y + "' (day: '" + day + "')'";
  std::string out = weekday;
  if (!date.empty()) { if (!out.empty()) out += ", "; out += date; }
  if (!weekday.empty() && !month.empty() && day.empty() && y.empty()) out = weekday + "' (month: '" + month + "')'";
  std::string time;
  if (!p[4].empty()) time = std::string(p[4] == "2-digit" || !twelve ? 2 : 1, twelve ? 'h' : 'H');
  if (!p[5].empty()) { if (!time.empty()) time += ':'; time += p[4].empty() && p[6].empty() ? "m" : "mm"; }
  if (!p[6].empty() && (!p[5].empty() || p[4].empty())) { if (!time.empty()) time += ':'; time += p[5].empty() ? "s" : "ss"; }
  if (!p[4].empty() && twelve) time += " a";
  if (!p[4].empty() && p[5].empty() && !p[6].empty()) time += "' (second: 's')'";
  if (!time.empty()) { if (!out.empty()) out += ", "; out += time; }
  return out;
}
inline std::string resolved(const std::string& locale, const std::string& spec, const std::string& zone) {
  const auto p = split(spec); if (p.size() != 8) return "!Invalid Intl date options";
  std::string fmt;
#if defined(__APPLE__)
  CF cf;
  if (cf.lib) {
    Owned id(cf, cf.string(locale + "@calendar=gregorian;numbers=latn"));
    Owned loc(cf, cf.fn<const void*(*)(const void*, const void*)>("CFLocaleCreate")(nullptr, id.p));
    fmt = pattern(cf, loc.p, locale, spec);
  }
#endif
  if (fmt.empty()) fmt = portablePattern(locale, spec);
  if (fmt.empty() || fmt[0] == '!') return fmt;
  auto width = [&](char c, bool literals = true) { size_t longest = 0; bool quoted = false; for (size_t i = 0; i < fmt.size();) { const size_t begin = i++; if (fmt[begin] == '\'') quoted = !quoted; while (i < fmt.size() && fmt[i] == fmt[begin]) ++i; if ((literals || !quoted) && fmt[begin] == c) longest = std::max(longest, i - begin); } return longest; };
  const size_t hour = std::max({width('h'), width('H'), width('K'), width('k')});
  const bool twelve = width('h', false) || width('K', false);
  std::string out = "{\"locale\":\"" + locale + "\",\"calendar\":\"gregory\",\"numberingSystem\":\"latn\",\"timeZone\":\"" + zone + "\"";
  if (!p[4].empty()) out += ",\"hourCycle\":\"" + std::string(twelve ? (width('K', false) ? "h11" : "h12") : (width('k', false) ? "h24" : "h23")) + "\",\"hour12\":" + (twelve ? "true" : "false");
  auto field = [&](const char* key, size_t n, bool name = false) { if (!n) return; out += ",\"" + std::string(key) + "\":\"" + (name && n >= 3 ? (n == 3 ? "short" : n == 4 ? "long" : "narrow") : n == 2 ? "2-digit" : "numeric") + "\""; };
  field("weekday", std::max({width('E', false), width('c', false), width('e', false)}), true); field("year", width('y')); field("month", std::max(width('M'), width('L')), true); field("day", width('d')); field("hour", hour); field("minute", width('m')); field("second", width('s'));
  return out + '}';
}
inline std::string portableDate(const std::string& locale, const std::string& spec, const std::string& zone, double value) {
  if (!std::isfinite(value) || std::abs(value) > 8.64e15) return "!Invalid time value";
  const auto p = split(spec); if (p.size() != 8) return "!Invalid Intl date options";
  if ((locale != "en-US" && locale != "en") || zone != "UTC") return "!Intl date requires an OS formatter";
  const double seconds = std::floor(std::trunc(value) / 1000);
  if (seconds < static_cast<double>(std::numeric_limits<std::time_t>::lowest()) || seconds > static_cast<double>(std::numeric_limits<std::time_t>::max())) return "!Intl date outside the platform UTC calendar range";
  const std::time_t t = static_cast<std::time_t>(seconds); std::tm tm{};
#ifdef _WIN32
  if (gmtime_s(&tm, &t) != 0) return "!Invalid time value";
#else
  if (!gmtime_r(&t, &tm)) return "!Invalid time value";
#endif
  const char* months[] = {"January","February","March","April","May","June","July","August","September","October","November","December"};
  const char* days[] = {"Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"};
  const int year = tm.tm_year + 1900 <= 0 ? 1 - (tm.tm_year + 1900) : tm.tm_year + 1900;
  const auto pattern = portablePattern(locale, spec);
  std::string out; bool quoted = false;
  auto digits = [](int value, size_t width) { auto text = std::to_string(value); if (width == 2 && text.size() < 2) text = '0' + text; return text; };
  for (size_t i = 0; i < pattern.size();) {
    const char c = pattern[i];
    if (c == '\'') { if (i + 1 < pattern.size() && pattern[i + 1] == '\'') { out += '\''; i += 2; } else { quoted = !quoted; ++i; } continue; }
    if (quoted) { out += c; ++i; continue; }
    size_t end = i + 1; while (end < pattern.size() && pattern[end] == c) ++end;
    const size_t width = end - i;
    if (c == 'y') out += digits(width == 2 ? year % 100 : year, width);
    else if (c == 'M') { if (width <= 2) out += digits(tm.tm_mon + 1, width); else { std::string name = months[tm.tm_mon]; if (width == 3) name.resize(3); if (width == 5) name.resize(1); out += name; } }
    else if (c == 'E') { std::string name = days[tm.tm_wday]; if (width == 3) name.resize(3); if (width == 5) name.resize(1); out += name; }
    else if (c == 'd') out += digits(tm.tm_mday, width);
    else if (c == 'h') out += digits(tm.tm_hour % 12 ? tm.tm_hour % 12 : 12, width);
    else if (c == 'H') out += digits(tm.tm_hour, width);
    else if (c == 'm') out += digits(tm.tm_min, width);
    else if (c == 's') out += digits(tm.tm_sec, width);
    else if (c == 'a') out += tm.tm_hour < 12 ? "AM" : "PM";
    else out.append(width, c);
    i = end;
  }
  return out;
}

inline std::string date(const std::string& locale, const std::string& spec, const std::string& zone, double value) {
  if (!std::isfinite(value) || std::abs(value) > 8.64e15) return "!Invalid time value";
  const auto p = split(spec); if (p.size() != 8) return "!Invalid Intl date options";
#if defined(__APPLE__)
  CF cf;
  if (cf.lib) {
    Owned id(cf, cf.string(locale + "@calendar=gregorian;numbers=latn"));
    Owned loc(cf, cf.fn<const void*(*)(const void*, const void*)>("CFLocaleCreate")(nullptr, id.p));
    Owned fmt(cf, cf.fn<const void*(*)(const void*, const void*, long, long)>("CFDateFormatterCreate")(nullptr, loc.p, 0, 0));
    Owned name(cf, cf.string(zone));
    Owned tz(cf, cf.fn<const void*(*)(const void*, const void*, unsigned char)>("CFTimeZoneCreateWithName")(nullptr, name.p, 0));
    if (!fmt.p || !tz.p) return "!OS date formatter unavailable";
    cf.fn<void(*)(const void*, const void*, const void*)>("CFDateFormatterSetProperty")(fmt.p, cf.key("kCFDateFormatterTimeZone"), tz.p);
    const std::string fmtText = pattern(cf, loc.p, locale, spec);
    if (fmtText.empty() || fmtText[0] == '!') return fmtText;
    Owned exact(cf, cf.string(fmtText)); cf.fn<void(*)(const void*, const void*)>("CFDateFormatterSetFormat")(fmt.p, exact.p);
    Owned out(cf, cf.fn<const void*(*)(const void*, const void*, double)>("CFDateFormatterCreateStringWithAbsoluteTime")(nullptr, fmt.p, std::trunc(value) / 1000 - 978307200));
    return cf.text(out.p);
  }
#endif
  return portableDate(locale, spec, zone, value);
}

} // namespace zn::host::intl
