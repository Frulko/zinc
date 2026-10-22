#include "i18n/i18n.h"

#include <cctype>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <map>
#include <string_view>
#include <vector>
#if defined(__APPLE__)
#include <dlfcn.h>
#endif

#include "yyjson.h"

namespace zn::i18n {
namespace {

struct English { const char* area; const char* json; };
const English kEnglish[] = {
#include "en.inc"
};

using Catalog = std::map<std::string, std::string, std::less<>>;
// The process's catalogs, read on first use: the command line prints from many places, and threading a catalog through all of them
// buys nothing (ponytail: one state per process, like ZINC_LOG's).
struct State {
  std::string dir, config, lang;
  std::map<std::string, Catalog> areas;   // "<lang>/<area>"
};
State& state() { static State s; return s; }

void parse(const char* text, std::size_t size, Catalog& into) {
  yyjson_doc* doc = yyjson_read(text, size, 0);
  yyjson_val* root = doc ? yyjson_doc_get_root(doc) : nullptr;
  std::size_t i, n;
  yyjson_val *k, *v;
  if (yyjson_is_obj(root)) yyjson_obj_foreach(root, i, n, k, v) if (yyjson_is_str(v)) into.emplace(yyjson_get_str(k), yyjson_get_str(v));
  yyjson_doc_free(doc);
}

const Catalog& catalog(const std::string& lang, std::string_view area) {
  State& s = state();
  const std::string key = lang + "/" + std::string(area);
  if (auto it = s.areas.find(key); it != s.areas.end()) return it->second;
  Catalog& c = s.areas[key];
  if (lang == "en") {   // the compiled-in source; a file would only be a copy of it
    for (const English& e : kEnglish) if (area == e.area) parse(e.json, std::strlen(e.json), c);
  } else if (!s.dir.empty()) {
    const std::string path = s.dir + "/" + lang + "/" + std::string(area) + ".json";
    if (std::FILE* f = std::fopen(path.c_str(), "rb")) {
      std::string text;
      char buf[16384];
      for (std::size_t got; (got = std::fread(buf, 1, sizeof buf, f)) > 0;) text.append(buf, got);
      std::fclose(f);
      parse(text.data(), text.size(), c);
    }
  }
  return c;
}

const std::string* find(const std::string& lang, std::string_view id) {
  const Catalog& c = catalog(lang, id.substr(0, id.find('.')));
  const auto it = c.find(id);
  return it == c.end() ? nullptr : &it->second;
}

std::string fill(const std::string& text, const std::vector<Arg>& args) {
  std::string out;
  for (std::size_t i = 0; i < text.size(); ++i) {
    if (text[i] != '{') { out += text[i]; continue; }
    if (i + 1 < text.size() && text[i + 1] == '{') { out += '{'; ++i; continue; }
    const std::size_t end = text.find('}', i);
    const Arg* a = nullptr;
    if (end != std::string::npos)
      for (const Arg& x : args) if (text.compare(i + 1, end - i - 1, x.name) == 0 && std::strlen(x.name) == end - i - 1) a = &x;
    if (!a) { out += '{'; continue; }   // not a placeholder of this message: printed as it is
    out += a->value;
    i = end;
  }
  return out;
}

bool englishLocale(const char* v) { return !std::strcmp(v, "C") || !std::strcmp(v, "POSIX") || !std::strncmp(v, "C.", 2); }

#if defined(__APPLE__)
// An app or a shell started without LANG still has the person's languages, in order, in the system settings.
// ponytail: the same CoreFoundation lookup as systemLocale() in src/host/sys_host.cpp (first entry only there); one copy in src/platform when a third caller comes
std::string macLanguage() {
  void* cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL);
  if (!cf) return "";
  using Langs = const void* (*)();
  using Count = long (*)(const void*);
  using At = const void* (*)(const void*, long);
  using Str = unsigned char (*)(const void*, char*, long, unsigned);
  using Rel = void (*)(const void*);
  auto langs = reinterpret_cast<Langs>(dlsym(cf, "CFLocaleCopyPreferredLanguages"));
  auto count = reinterpret_cast<Count>(dlsym(cf, "CFArrayGetCount"));
  auto at = reinterpret_cast<At>(dlsym(cf, "CFArrayGetValueAtIndex"));
  auto str = reinterpret_cast<Str>(dlsym(cf, "CFStringGetCString"));
  auto rel = reinterpret_cast<Rel>(dlsym(cf, "CFRelease"));
  std::string found;
  if (langs && count && at && str && rel)
    if (const void* a = langs()) {
      for (long k = 0; k < count(a) && found.empty(); ++k) {
        char b[64] = {0};
        if (str(at(a, k), b, sizeof b, 0x08000100u /* kCFStringEncodingUTF8 */)) found = match(b);
      }
      rel(a);
    }
  return found;
}
#endif

std::string resolve() {
  const State& s = state();
  if (const char* z = std::getenv("ZINC_LANG"); z && *z) { const std::string m = match(z); return m.empty() ? "en" : m; }
  if (!s.config.empty())
    if (yyjson_doc* doc = yyjson_read_file(s.config.c_str(), 0, nullptr, nullptr)) {
      const char* v = yyjson_get_str(yyjson_obj_get(yyjson_doc_get_root(doc), "lang"));
      const std::string m = v ? match(v) : "";
      yyjson_doc_free(doc);
      if (!m.empty()) return m;
    }
  if (const char* l = std::getenv("LANGUAGE"); l && *l) {   // GNU: a list, best first
    std::string list = l;
    for (std::size_t at = 0; at <= list.size();) {
      const std::size_t colon = std::min(list.find(':', at), list.size());
      if (const std::string m = match(list.substr(at, colon - at)); !m.empty()) return m;
      at = colon + 1;
    }
  }
  for (const char* k : {"LC_ALL", "LC_MESSAGES", "LANG"})
    if (const char* v = std::getenv(k); v && *v) {
      if (englishLocale(v)) return "en";
      const std::string m = match(v);
      return m.empty() ? "en" : m;
    }
#if defined(__APPLE__)
  if (std::string m = macLanguage(); !m.empty()) return m;
#endif
  return "en";
}

std::string number(double n) {
  char b[32];
  if (std::floor(n) == n && std::fabs(n) < 1e15) std::snprintf(b, sizeof b, "%.0f", n);
  else std::snprintf(b, sizeof b, "%g", n);
  return b;
}

}  // namespace

std::string match(const std::string& tag) {
  std::string lang;
  for (char c : tag) {
    if (c == '-' || c == '_' || c == '.' || c == '@') break;
    lang += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
  }
  for (const char* l : kLanguages) if (lang == l) return lang;
  return "";
}

void configure(const std::string& dir, const std::string& configFile) {
  State& s = state();
  const char* over = std::getenv("ZINC_I18N_DIR");
  s.dir = over && *over ? over : dir;
  s.config = configFile;
  s.lang.clear();
  s.areas.clear();
}

std::string language() {
  State& s = state();
  if (s.lang.empty()) s.lang = resolve();
  return s.lang;
}

void use(const std::string& lang) { const std::string m = match(lang); state().lang = m.empty() ? "en" : m; }

const char* plural(const std::string& lang, double n) {
  // CLDR 44 cardinals (unicode-org/cldr-json, supplemental/plurals.json). A double has no visible fraction digits, so an integral
  // value is read as v = 0 (1.0 is "one" in English here, "other" in CLDR's written form: a count never comes as 1.0)
  const double a = std::fabs(n);
  const bool integral = std::floor(a) == a;
  const double i = std::floor(a);
  const bool million = integral && i != 0 && std::fmod(i, 1000000.0) == 0;   // e = 0 and i != 0 and i % 1000000 = 0 and v = 0
  if (lang == "fr") return i == 0 || i == 1 ? "one" : million ? "many" : "other";   // one: i = 0,1 (so 0 and 1.5 too)
  if (lang == "es") return a == 1 ? "one" : million ? "many" : "other";              // one: n = 1
  if (lang == "it") return i == 1 && integral ? "one" : million ? "many" : "other";  // one: i = 1 and v = 0
  return i == 1 && integral ? "one" : "other";                                        // en, de
}

std::string tr(const char* id, std::initializer_list<Arg> args) {
  const std::string lang = language();
  const std::string* t = lang == "en" ? nullptr : find(lang, id);
  if (!t) t = find("en", id);
  return t ? fill(*t, std::vector<Arg>(args)) : std::string(id);
}

std::string trn(const char* id, double count, std::initializer_list<Arg> args) {
  std::vector<Arg> all(args);
  all.push_back({"count", number(count)});
  auto pick = [&](const std::string& lang) -> const std::string* {
    const std::string cat = plural(lang, count);
    for (const std::string& k : {std::string(id) + "_" + cat, std::string(id) + "_other", std::string(id)})
      if (const std::string* t = find(lang, k)) return t;
    return nullptr;
  };
  const std::string lang = language();
  const std::string* t = lang == "en" ? nullptr : pick(lang);
  if (!t) t = pick("en");
  return t ? fill(*t, all) : std::string(id);
}

}  // namespace zn::i18n
