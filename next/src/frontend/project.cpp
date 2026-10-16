#include "frontend/project.h"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <filesystem>

#include "yyjson.h"

namespace zn::frontend {
namespace {

bool strKey(yyjson_val* o, const char* key, std::string& dst, std::string& err) {
  yyjson_val* v = yyjson_obj_get(o, key);
  if (!v) return true;
  if (!yyjson_is_str(v)) { err = std::string("\"") + key + "\" must be a string"; return false; }
  dst = yyjson_get_str(v);
  return true;
}

// The 1-based line of the first `"value"` (or `"key"`) in the manifest text, for the diagnostics of the manifest rules.
int lineOf(const std::string& text, const std::string& needle) {
  std::size_t at = text.find("\"" + needle + "\"");
  if (at == std::string::npos) return 1;
  int line = 1;
  for (std::size_t i = 0; i < at; ++i) if (text[i] == '\n') ++line;
  return line;
}

bool reverseDns(const std::string& id) {   // com.example.notes: two or more dot-separated labels of letters, digits and hyphens, the first starting with a letter
  int labels = 0;
  std::size_t from = 0;
  while (from <= id.size()) {
    std::size_t dot = id.find('.', from);
    std::string label = id.substr(from, dot == std::string::npos ? std::string::npos : dot - from);
    if (label.empty() || (labels == 0 && !std::isalpha(static_cast<unsigned char>(label[0])))) return false;
    for (char c : label) if (!std::isalnum(static_cast<unsigned char>(c)) && c != '-') return false;
    ++labels;
    if (dot == std::string::npos) break;
    from = dot + 1;
  }
  return labels >= 2;
}

const std::vector<std::string>* gGranted = nullptr;
std::string gAppJson;

// ---------------------------------------------------------------- the game keys (ZN-435)
// Formats and codecs a profile may name (docs/reports/games/toolchain-assets-loading.md §3); what follows a ':' is the encoder's setting
// (ktx2:uastc, opus:96). A name joins the list with its encoder.
const std::vector<std::string> kTextureFormats = {"rgba8", "rgb565", "rgba4444", "rgba5551", "bc1", "bc3", "bc7", "etc1", "etc1a4", "etc2", "astc", "pvrtc", "clut4", "clut8", "ktx2"};
const std::vector<std::string> kAudioCodecs = {"pcm", "opus", "vorbis", "mp3", "aac", "qoa", "adpcm", "vag", "dsp-adpcm", "atrac3"};
const std::vector<std::string> kBudgetKeys = {"download", "boot", "gpu", "ram", "flash"};

bool oneOf(const std::string& v, const std::vector<std::string>& names) { return std::find(names.begin(), names.end(), v) != names.end(); }
std::string joined(const std::vector<std::string>& names) { std::string s; for (const std::string& n : names) s += (s.empty() ? "" : ", ") + n; return s; }
std::string str(yyjson_val* v) { return yyjson_is_str(v) ? yyjson_get_str(v) : ""; }
std::string jsonText(yyjson_val* v) { char* js = yyjson_val_write(v, 0, nullptr); std::string s = js ? js : ""; std::free(js); return s; }
bool strList(yyjson_val* v, std::vector<std::string>& dst) {
  if (!yyjson_is_arr(v)) return false;
  size_t i, n; yyjson_val* e;
  yyjson_arr_foreach(v, i, n, e) { if (!yyjson_is_str(e)) return false; dst.push_back(yyjson_get_str(e)); }
  return true;
}
bool millis(yyjson_val* v, int& dst) { if (!yyjson_is_uint(v) || yyjson_get_uint(v) > 600000) return false; dst = static_cast<int>(yyjson_get_uint(v)); return true; }
bool colour(const std::string& c) {   // #rgb, #rrggbb, #rrggbbaa
  if (c.size() != 4 && c.size() != 7 && c.size() != 9) return false;
  return c[0] == '#' && std::all_of(c.begin() + 1, c.end(), [](char x) { return std::isxdigit(static_cast<unsigned char>(x)) != 0; });
}

/** A failed key: `key` locates its line in the manifest, `msg` says what is wrong. */
struct Bad { std::string key, msg; };

/** The keys of an asset profile at `where` (assets.profiles.<name>, targets.<id>.assets, a target's default); `skip` is a key the caller
 *  reads. Unknown keys are warnings when `warnings` is given. */
bool profileKeys(yyjson_val* o, const std::string& where, AssetProfile& dst, std::vector<std::string>* warnings, Bad& bad, const char* skip) {
  size_t i, n; yyjson_val *k, *v;
  yyjson_obj_foreach(o, i, n, k, v) {
    const std::string key = yyjson_get_str(k), at = where + "." + key, s = str(v);
    auto fail = [&](const std::string& msg) { bad = {key, at + " " + msg}; return false; };
    if (skip && key == skip) continue;
    if (key == "texture") {
      if (s.empty()) return fail("must be texture formats in preference order, like \"bc7|bc1\"");
      for (std::size_t from = 0; from <= s.size();) {
        const std::size_t bar = std::min(s.find('|', from), s.size());
        const std::string f = s.substr(from, bar - from), name = f.substr(0, f.find(':'));
        if (!oneOf(name, kTextureFormats)) return fail("names \"" + f + "\", not a texture format (" + joined(kTextureFormats) + ")");
        from = bar + 1;
      }
      dst[key] = s;
    } else if (key == "audio" || key == "sfx") {
      if (!oneOf(s.substr(0, s.find(':')), kAudioCodecs)) return fail("must be an audio codec with an optional setting, like \"opus:96\" (" + joined(kAudioCodecs) + ")");
      dst[key] = s;
    } else if (key == "maxSize") {
      if (!yyjson_is_uint(v) || yyjson_get_uint(v) < 1 || yyjson_get_uint(v) > 16384) return fail("must be a number of pixels from 1 to 16384");
      dst[key] = std::to_string(yyjson_get_uint(v));
    } else if (key == "pot") {
      if (!yyjson_is_bool(v)) return fail("must be true or false");
      dst[key] = yyjson_get_bool(v) ? "true" : "false";
    } else if (key == "pack") {
      if (!oneOf(s, {"none", "lz4", "zstd", "zstd-dict"})) return fail("must be \"none\", \"lz4\", \"zstd\" or \"zstd-dict\"");
      dst[key] = s;
    } else if (key == "split") {
      if (!oneOf(s, {"none", "group"})) return fail("must be \"none\" or \"group\"");
      dst[key] = s;
    } else if (warnings) warnings->push_back("unknown key \"" + at + "\"");
  }
  return true;
}

bool budgetKeys(yyjson_val* o, const std::string& where, AssetBudgets& dst, Bad& bad) {
  if (!yyjson_is_obj(o)) { bad = {"budgets", where + " must be an object of limits: { \"download\": \"48MB\", ... }"}; return false; }
  size_t i, n; yyjson_val *k, *v;
  yyjson_obj_foreach(o, i, n, k, v) {
    const std::string key = yyjson_get_str(k);
    std::uint64_t bytes = 0;
    if (!oneOf(key, kBudgetKeys)) { bad = {key, where + "." + key + " is not a budget (" + joined(kBudgetKeys) + ")"}; return false; }
    if (yyjson_is_uint(v)) bytes = yyjson_get_uint(v);
    else if (!yyjson_is_str(v) || !parseByteSize(yyjson_get_str(v), bytes)) { bad = {key, where + "." + key + " must be a size: a number of bytes or a string like \"48MB\" (B, KB, MB, GB)"}; return false; }
    dst[key] = bytes;
  }
  return true;
}

bool splashOf(yyjson_val* v, const std::string& where, Splash& dst, std::vector<std::string>& warnings, Bad& bad) {
  dst.present = true;
  if (yyjson_is_str(v)) { dst.image = yyjson_get_str(v); return true; }
  if (!yyjson_is_obj(v)) { bad = {"splash", where + " must be an image path or an object: { \"image\", \"background\", \"fit\", \"minMs\", \"fadeMs\" }"}; return false; }
  size_t i, n; yyjson_val *k, *x;
  yyjson_obj_foreach(v, i, n, k, x) {
    const std::string key = yyjson_get_str(k), at = where + "." + key;
    auto fail = [&](const std::string& msg) { bad = {key, at + " " + msg}; return false; };
    if (key == "image") { if (!yyjson_is_str(x)) return fail("must be a path"); dst.image = yyjson_get_str(x); }
    else if (key == "background") { if (!colour(str(x))) return fail("must be a colour: \"#rgb\", \"#rrggbb\" or \"#rrggbbaa\""); dst.background = str(x); }
    else if (key == "fit") { if (!oneOf(str(x), {"contain", "cover", "center"})) return fail("must be \"contain\", \"cover\" or \"center\""); dst.fit = str(x); }
    else if (key == "minMs" || key == "fadeMs") { if (!millis(x, key == "minMs" ? dst.minMs : dst.fadeMs)) return fail("must be a number of milliseconds from 0 to 600000"); }
    else warnings.push_back("unknown key \"" + at + "\"");
  }
  if (dst.image.empty() && dst.background.empty()) { bad = {"splash", where + " needs an \"image\" or a \"background\""}; return false; }
  return true;
}

/** assets, splash, loading, launcher, targets.<id>.assets and targets.<id>.splash; every error names its key and is fatal. */
bool parseGameKeys(yyjson_val* root, const std::string& text, Project& out, std::string& err) {
  Bad bad;
  auto fail = [&](const std::string& key, const std::string& msg) { out.fatal = true; err = "line " + std::to_string(lineOf(text, key)) + ": " + msg; return false; };
  auto failBad = [&]() { return fail(bad.key, bad.msg); };
  auto unknown = [&](const std::string& at) { out.warnings.push_back("unknown key \"" + at + "\""); };
  Assets& a = out.assets;
  if (yyjson_val* as = yyjson_obj_get(root, "assets")) {
    if (yyjson_is_str(as)) a.dir = yyjson_get_str(as);
    else if (!yyjson_is_obj(as)) return fail("assets", "\"assets\" must be the assets directory or an object: { \"dir\", \"rules\", \"groups\", \"profiles\", \"budgets\" }");
    size_t i, n; yyjson_val *k, *v;
    if (yyjson_is_obj(as)) yyjson_obj_foreach(as, i, n, k, v) {
      const std::string key = yyjson_get_str(k);
      if (key == "dir") { if (str(v).empty()) return fail(key, "assets.dir must be the assets directory, relative to the project"); a.dir = str(v); }
      else if (key == "rules") {
        if (!yyjson_is_arr(v)) return fail(key, "assets.rules must be an array of { \"match\", \"as\", options... }");
        size_t ri, rn; yyjson_val* r;
        yyjson_arr_foreach(v, ri, rn, r) {
          const std::string at = "assets.rules[" + std::to_string(ri) + "]";
          if (!yyjson_is_obj(r)) return fail(key, at + " must be an object: { \"match\", \"as\", options... }");
          AssetRule rule;
          size_t oi, on; yyjson_val *ok, *ov;
          yyjson_obj_foreach(r, oi, on, ok, ov) {
            const std::string opt = yyjson_get_str(ok);
            if ((opt == "match" || opt == "as") && !yyjson_is_str(ov)) return fail(opt, at + "." + opt + " must be a string");
            if (opt == "match") rule.match = yyjson_get_str(ov);
            else if (opt == "as") rule.as = yyjson_get_str(ov);
            else rule.options[opt] = yyjson_is_str(ov) ? yyjson_get_str(ov) : jsonText(ov);
          }
          if (rule.match.empty()) return fail(key, at + " needs \"match\": a glob of the files it applies to");
          a.rules.push_back(std::move(rule));
        }
      } else if (key == "groups") {
        if (!yyjson_is_obj(v)) return fail(key, "assets.groups must be an object: { \"<name>\": { \"include\": [globs] } }");
        size_t gi, gn; yyjson_val *gk, *gv;
        yyjson_obj_foreach(v, gi, gn, gk, gv) {
          AssetGroup g;
          g.name = yyjson_get_str(gk);
          const std::string at = "assets.groups." + g.name;
          if (!yyjson_is_obj(gv) || !strList(yyjson_obj_get(gv, "include"), g.include)) return fail(g.name, at + " needs \"include\": an array of globs");
          size_t fi, fn; yyjson_val *fk, *fv;
          yyjson_obj_foreach(gv, fi, fn, fk, fv) {
            const std::string f = yyjson_get_str(fk);
            if (f == "exclude") { if (!strList(fv, g.exclude)) return fail(f, at + ".exclude must be an array of globs"); }
            else if (f == "priority") { if (!yyjson_is_int(fv)) return fail(f, at + ".priority must be an integer"); g.priority = static_cast<int>(yyjson_get_int(fv)); }
            else if (f != "include") unknown(at + "." + f);
          }
          a.groups.push_back(std::move(g));
        }
      } else if (key == "profiles") {
        if (!yyjson_is_obj(v)) return fail(key, "assets.profiles must be an object: { \"<name>\": { \"texture\", \"maxSize\", \"pot\", \"audio\", \"sfx\", \"pack\", \"split\" } }");
        size_t pi, pn; yyjson_val *pk, *pv;
        yyjson_obj_foreach(v, pi, pn, pk, pv) {
          const std::string name = yyjson_get_str(pk);
          if (!yyjson_is_obj(pv)) return fail(name, "assets.profiles." + name + " must be an object");
          if (!profileKeys(pv, "assets.profiles." + name, a.profiles[name], &out.warnings, bad, nullptr)) return failBad();
        }
      } else if (key == "budgets") {
        if (!yyjson_is_obj(v)) return fail(key, "assets.budgets must be an object: { \"<target>\": { \"download\", \"boot\", \"gpu\", \"ram\", \"flash\" } }");
        size_t bi, bn; yyjson_val *bk, *bv;
        yyjson_obj_foreach(v, bi, bn, bk, bv) if (!budgetKeys(bv, std::string("assets.budgets.") + yyjson_get_str(bk), a.budgets[yyjson_get_str(bk)], bad)) return failBad();
      } else unknown("assets." + key);
    }
    if (a.dir.empty()) return fail("assets", "\"assets\" must name the assets directory");
  }
  if (yyjson_val* s = yyjson_obj_get(root, "splash"); s && !splashOf(s, "splash", out.splash, out.warnings, bad)) return failBad();
  if (yyjson_val* l = yyjson_obj_get(root, "loading")) {
    Loading& ld = out.loading;
    ld.present = true;
    if (!yyjson_is_obj(l)) return fail("loading", "\"loading\" must be an object: { \"screen\", \"groups\", \"minMs\", \"fadeMs\" }");
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(l, i, n, k, v) {
      const std::string key = yyjson_get_str(k);
      if (key == "screen") { if (str(v).empty()) return fail(key, "loading.screen must be \"default\", \"bar\" or a module"); ld.screen = str(v); }
      else if (key == "groups") {
        if (!strList(v, ld.groups)) return fail(key, "loading.groups must be an array of group names");
        for (const std::string& g : ld.groups)
          if (g != "default" && std::none_of(a.groups.begin(), a.groups.end(), [&](const AssetGroup& x) { return x.name == g; }))
            return fail(g, "loading.groups names \"" + g + "\", which assets.groups does not define");
      } else if (key == "minMs" || key == "fadeMs") { if (!millis(v, key == "minMs" ? ld.minMs : ld.fadeMs)) return fail(key, "loading." + key + " must be a number of milliseconds from 0 to 600000"); }
      else unknown("loading." + key);
    }
  }
  if (yyjson_val* l = yyjson_obj_get(root, "launcher")) {
    Launcher& la = out.launcher;
    la.present = true;
    if (!yyjson_is_obj(l)) return fail("launcher", "\"launcher\" must be an object: { \"entry\", \"skippable\", \"targets\" }");
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(l, i, n, k, v) {
      const std::string key = yyjson_get_str(k);
      if (key == "entry") la.entry = str(v);
      else if (key == "skippable") { if (!yyjson_is_bool(v)) return fail(key, "launcher.skippable must be true or false"); la.skippable = yyjson_get_bool(v); }
      else if (key == "targets") { if (!strList(v, la.targets)) return fail(key, "launcher.targets must be an array of target names"); }
      else unknown("launcher." + key);
    }
    if (la.entry.empty()) return fail("launcher", "launcher.entry must name the launcher's module, like \"src/launcher.tsx\"");
  }
  if (yyjson_val* t = yyjson_obj_get(root, "targets"); yyjson_is_obj(t)) {
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(t, i, n, k, v) {
      const std::string id = yyjson_get_str(k), at = "targets." + id;
      TargetOptions& o = out.targets[id];
      if (yyjson_val* x = yyjson_obj_get(v, "splash"); x && !splashOf(x, at + ".splash", o.splash, out.warnings, bad)) return failBad();
      yyjson_val* x = yyjson_obj_get(v, "assets");
      if (!x) continue;
      if (!yyjson_is_obj(x)) return fail(id, at + ".assets must be an object: { \"profile\", profile keys... }");
      if (yyjson_val* pr = yyjson_obj_get(x, "profile")) {
        o.assetProfile = str(pr);
        if (!a.profiles.count(o.assetProfile)) return fail("profile", at + ".assets.profile names \"" + o.assetProfile + "\", which assets.profiles does not define");
      }
      if (!profileKeys(x, at + ".assets", o.assets, &out.warnings, bad, "profile")) return failBad();
    }
  }
  return true;
}

}  // namespace

bool parseByteSize(const std::string& s, std::uint64_t& bytes) {
  std::size_t i = 0;
  while (i < s.size() && (std::isdigit(static_cast<unsigned char>(s[i])) || s[i] == '.')) ++i;
  if (i == 0 || std::count(s.begin(), s.begin() + static_cast<long>(i), '.') > 1 || s[0] == '.') return false;
  std::string unit = s.substr(i);
  for (char& c : unit) c = static_cast<char>(std::toupper(static_cast<unsigned char>(c)));
  const double scale = unit.empty() || unit == "B" ? 1 : unit == "KB" ? 1024.0 : unit == "MB" ? 1048576.0 : unit == "GB" ? 1073741824.0 : 0;
  const double v = std::strtod(s.substr(0, i).c_str(), nullptr) * scale;
  if (scale == 0 || v >= 1.8e19) return false;
  bytes = static_cast<std::uint64_t>(v);
  return true;
}

std::string byteSize(std::uint64_t b) {
  static const std::pair<const char*, std::uint64_t> units[] = {{"GB", 1ull << 30}, {"MB", 1ull << 20}, {"KB", 1ull << 10}};
  for (const auto& [unit, size] : units)
    if (b && b % size == 0) return std::to_string(b / size) + unit;
  return std::to_string(b) + "B";
}

bool assetProfiles(const Project& p, const std::string& capabilities, std::vector<TargetAssets>& out, std::string& err) {
  yyjson_doc* doc = yyjson_read(capabilities.data(), capabilities.size(), 0);
  if (!doc) { err = "targets/capabilities.json is not valid JSON"; return false; }
  struct Free { yyjson_doc* d; ~Free() { yyjson_doc_free(d); } } guard{doc};
  size_t i, n; yyjson_val *k, *v;
  yyjson_obj_foreach(yyjson_doc_get_root(doc), i, n, k, v) {
    if (!yyjson_is_obj(v)) continue;   // $comment
    TargetAssets t;
    t.target = yyjson_get_str(k);
    Bad bad;
    if (yyjson_val* d = yyjson_obj_get(v, "assets")) {
      yyjson_val* b = yyjson_obj_get(d, "budgets");
      if (!yyjson_is_obj(d) || !profileKeys(d, t.target + ".assets", t.keys, nullptr, bad, "budgets") || (b && !budgetKeys(b, t.target + ".assets.budgets", t.budgets, bad))) {
        err = "targets/capabilities.json: " + (bad.msg.empty() ? t.target + ".assets must be an object" : bad.msg);
        return false;
      }
    }
    if (auto o = p.targets.find(t.target); o != p.targets.end()) {
      if (!o->second.assetProfile.empty()) {
        t.profile = o->second.assetProfile;
        for (const auto& [key, val] : p.assets.profiles.at(t.profile)) t.keys[key] = val;   // parseProject checked the name
      }
      for (const auto& [key, val] : o->second.assets) t.keys[key] = val;
    }
    if (auto b = p.assets.budgets.find(t.target); b != p.assets.budgets.end())
      for (const auto& [key, val] : b->second) t.budgets[key] = val;
    out.push_back(std::move(t));
  }
  return true;
}

const std::vector<std::string>& systemFeatures() {
  static const std::vector<std::string> f = {"notification", "menu", "tray", "dialog", "window", "shortcut", "instance", "deep-link", "autostart", "dock", "power", "clipboard", "opener", "update"};
  return f;
}
void setSystemAppJson(const std::string& json) { gAppJson = json; }
std::string gScopesJson;
void setSystemScopesJson(const std::string& json) { gScopesJson = json; }
namespace { std::string gUiLayout = "classic"; }
void setUiLayout(const std::string& layout) { gUiLayout = layout.empty() ? "classic" : layout; }
const std::string& uiLayout() { return gUiLayout; }
namespace { std::string gUiPreset; }
void setUiPreset(const std::string& preset) { gUiPreset = preset; }
const std::string& uiPreset() { return gUiPreset; }
namespace { bool gDirectLayout = false; }
void noteDirectLayoutUse() { gDirectLayout = true; }
bool directLayoutUse() { return gDirectLayout; }
bool resolveUiLayout(const Project& p, const std::map<std::string, std::string>& caps, const std::string& target, std::string& layout, std::string& err) {
  auto cap = [&](const char* k) { auto it = caps.find(k); return it == caps.end() ? std::string() : it->second; };
  layout = p.uiLayout.empty() ? (p.uiPreset == "react-native" ? "rn" : "auto") : p.uiLayout;
  if (layout == "auto") layout = cap("ui.layout").empty() ? "classic" : cap("ui.layout");
  if (layout == "rn" && cap("ui.rn") == "false" && p.uiLayout.empty()) { layout = "classic"; return true; }   // the preset on a target without Yoga: classic with RN styles (ZN-288)
  if (layout == "rn" && cap("ui.rn") == "false") {
    const std::string why = cap("ui.why");
    err = "the rn layout (Yoga) is not available on " + target + (why.empty() ? "" : ": " + why) + "; use \"ui\": {\"layout\": \"classic\"} or \"auto\"";
    return false;
  }
  return true;
}
const std::string& systemScopesJson() { return gScopesJson; }
const std::string& systemAppJson() { return gAppJson; }
void setSystemPermissions(const std::vector<std::string>* granted) { gGranted = granted; }
const std::vector<std::string>* systemPermissions() { return gGranted; }
std::string systemFeatureOf(const std::string& spec) {
  if (spec.rfind("zinc:system/", 0) != 0) return "";
  std::string f = spec.substr(12);
  return f == "deeplink" ? "deep-link" : f;
}

std::vector<std::string> permissionsFor(const Project& p, const std::string& target) {
  std::vector<std::string> out = p.permissions;
  auto it = p.targetPermissions.find(target);
  if (it == p.targetPermissions.end()) return out;
  for (const std::string& e : it->second) {
    if (!e.empty() && e[0] == '-') { std::string id = e.substr(1); out.erase(std::remove(out.begin(), out.end(), id), out.end()); }
    else if (std::find(out.begin(), out.end(), e) == out.end()) out.push_back(e);
  }
  return out;
}

std::vector<std::pair<std::string, std::string>> usageStrings(const Project& p, const std::string& target, const std::string& who) {
  std::vector<std::pair<std::string, std::string>> out;
  auto say = [&](const char* perm, const std::string& fallback) { auto it = p.permissionStrings.find(perm); return it != p.permissionStrings.end() ? it->second : fallback; };
  for (const std::string& e : permissionsFor(p, target)) {
    if (e == "camera") out.push_back({"NSCameraUsageDescription", say("camera", who + " uses the camera.")});
    else if (e == "microphone") out.push_back({"NSMicrophoneUsageDescription", say("microphone", who + " uses the microphone.")});
    else if (e == "location") {
      out.push_back({"NSLocationWhenInUseUsageDescription", say("location", who + " uses your location.")});
      if (target == "macos") out.push_back({"NSLocationUsageDescription", say("location", who + " uses your location.")});
    }
  }
  return out;
}

namespace {
std::string xmlEsc(const std::string& s) {
  std::string o;
  for (char c : s) o += c == '&' ? "&amp;" : c == '<' ? "&lt;" : c == '>' ? "&gt;" : c == '"' ? "&quot;" : std::string(1, c);
  return o;
}
}  // namespace

std::string iosInfoPlist(const Project& p) {
  const std::string name = !p.app.name.empty() ? p.app.name : p.name, id = !p.app.id.empty() ? p.app.id : "dev.zinc." + p.name;
  const std::string version = !p.app.version.empty() ? p.app.version : "1.0";
  std::string o = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n";
  auto kv = [&](const std::string& k, const std::string& v) { o += "<key>" + k + "</key><string>" + xmlEsc(v) + "</string>\n"; };
  kv("CFBundleIdentifier", id);
  kv("CFBundleName", name);
  kv("CFBundleDisplayName", name);
  kv("CFBundleExecutable", "zinc");
  kv("CFBundlePackageType", "APPL");
  kv("CFBundleShortVersionString", version);
  kv("CFBundleVersion", p.app.versionCode > 0 ? std::to_string(p.app.versionCode) : version);
  kv("MinimumOSVersion", "15.0");
  o += "<key>UIDeviceFamily</key><array><integer>1</integer><integer>2</integer></array>\n";
  o += "<key>UILaunchScreen</key><dict/>\n";   // a blank launch screen: no storyboard to ship
  o += "<key>UIRequiresFullScreen</key><true/>\n";
  const std::string& r = p.app.orientation;
  o += "<key>UISupportedInterfaceOrientations</key><array>";
  if (r != "landscape") o += "<string>UIInterfaceOrientationPortrait</string>";
  if (r != "portrait") o += "<string>UIInterfaceOrientationLandscapeLeft</string><string>UIInterfaceOrientationLandscapeRight</string>";
  o += "</array>\n";
  for (const auto& [k, v] : usageStrings(p, "ios", name)) kv(k, v);
  return o + "</dict></plist>\n";
}

std::string androidManifestPermissions(const Project& p) {
  std::string perms;
  auto perm = [&](const char* name) { if (perms.find(std::string(name) + "\"") == std::string::npos) perms += std::string("    <uses-permission android:name=\"android.permission.") + name + "\" />\n"; };
  if (!p.permissionsDeclared) perm("INTERNET");   // not declared: the app is not restricted (as on the desktop), and the network is the common need
  bool camera = false;
  for (const std::string& f : permissionsFor(p, "android")) {
    if (f == "net") perm("INTERNET");
    else if (f == "camera") { perm("CAMERA"); camera = true; }
    else if (f == "microphone") perm("RECORD_AUDIO");
    else if (f == "location") perm("ACCESS_FINE_LOCATION");
  }
  // without it, CAMERA would make the Play Store hide the app from the devices that have no camera
  if (camera) perms += "    <uses-feature android:name=\"android.hardware.camera\" android:required=\"false\" />\n";
  return perms;
}

bool parseProject(const std::string& text, Project& out, std::string& err) {
  yyjson_read_err re;
  yyjson_doc* doc = yyjson_read_opts(const_cast<char*>(text.data()), text.size(), YYJSON_READ_ALLOW_COMMENTS | YYJSON_READ_ALLOW_TRAILING_COMMAS, nullptr, &re);
  if (!doc) { err = std::string("invalid JSON: ") + re.msg + " at byte " + std::to_string(re.pos); return false; }
  struct Free { yyjson_doc* d; ~Free() { yyjson_doc_free(d); } } guard{doc};
  yyjson_val* root = yyjson_doc_get_root(doc);
  if (!yyjson_is_obj(root)) { err = "the manifest must be a JSON object"; return false; }
  std::string main;
  if (!strKey(root, "name", out.name, err) || !strKey(root, "entry", out.entry, err) || !strKey(root, "main", main, err)) return false;
  if (out.entry.empty()) out.entry = main;
  if (yyjson_val* pr = yyjson_obj_get(root, "profile")) {
    if (!yyjson_is_str(pr)) { err = "\"profile\" must be a string"; return false; }
    out.profile = yyjson_get_str(pr);
  }
  if (yyjson_val* x = yyjson_obj_get(root, "keyboard"); x && yyjson_is_str(x)) out.keyboard = yyjson_get_str(x);
  if (yyjson_val* x = yyjson_obj_get(root, "webgl"); x && yyjson_is_bool(x)) out.webgl = yyjson_get_bool(x);
  if (yyjson_val* x = yyjson_obj_get(root, "web")) out.web = yyjson_is_obj(x) || yyjson_is_true(x);
  if (yyjson_val* x = yyjson_obj_get(root, "engine"); x && yyjson_is_str(x)) out.engine = yyjson_get_str(x);
  if (yyjson_val* d = yyjson_obj_get(root, "dev"); d && yyjson_is_obj(d))
    if (yyjson_val* x = yyjson_obj_get(d, "perfHud"); x && yyjson_is_bool(x)) out.perfHud = yyjson_get_bool(x);
  if (yyjson_val* x = yyjson_obj_get(root, "scheme"); x && yyjson_is_str(x)) out.scheme = yyjson_get_str(x);
  if (yyjson_val* x = yyjson_obj_get(root, "text"); x && yyjson_is_str(x)) {
    out.text = yyjson_get_str(x);
    if (out.text != "shaped" && out.text != "simple") out.warnings.push_back("\"text\" must be \"shaped\" or \"simple\"");
  }
  if (yyjson_val* u = yyjson_obj_get(root, "ui")) {   // ZN-285
    if (!yyjson_is_obj(u)) { err = "\"ui\" must be an object"; out.fatal = true; return false; }
    if (yyjson_val* l = yyjson_obj_get(u, "layout")) {
      out.uiLayout = yyjson_is_str(l) ? yyjson_get_str(l) : "";
      if (out.uiLayout != "classic" && out.uiLayout != "rn" && out.uiLayout != "auto") { err = "\"ui.layout\" must be \"classic\", \"rn\" or \"auto\""; out.fatal = true; return false; }
    }
    if (yyjson_val* pr = yyjson_obj_get(u, "preset")) {
      out.uiPreset = yyjson_is_str(pr) ? yyjson_get_str(pr) : "";
      if (out.uiPreset != "react-native") { err = "\"ui.preset\" must be \"react-native\""; out.fatal = true; return false; }
    }
  }
  if (yyjson_val* r = yyjson_obj_get(root, "requires")) {
    if (!yyjson_is_arr(r)) { err = "\"requires\" must be an array"; return false; }
    size_t i, n;
    yyjson_val* e;
    yyjson_arr_foreach(r, i, n, e) if (yyjson_is_str(e)) out.requires_.push_back(yyjson_get_str(e));
  }
  if (yyjson_val* t = yyjson_obj_get(root, "targets")) {
    if (!yyjson_is_obj(t)) { err = "\"targets\" must be an object"; return false; }
    size_t i, n;
    yyjson_val *k, *v;
    yyjson_obj_foreach(t, i, n, k, v) {
      if (!yyjson_is_obj(v)) { err = std::string("target \"") + yyjson_get_str(k) + "\" must be an object"; return false; }
      TargetOptions o;
      auto num = [&](const char* key) -> yyjson_val* { yyjson_val* x = yyjson_obj_get(v, key); return x && yyjson_is_num(x) ? x : nullptr; };
      auto flag = [&](const char* key, bool& dst) { yyjson_val* x = yyjson_obj_get(v, key); if (x && yyjson_is_bool(x)) dst = yyjson_get_bool(x); };
      if (yyjson_val* x = num("width")) o.width = static_cast<int>(yyjson_get_num(x));
      if (yyjson_val* x = num("height")) o.height = static_cast<int>(yyjson_get_num(x));
      if (yyjson_val* x = num("zoom")) o.zoom = yyjson_get_num(x);
      if (yyjson_val* x = num("heap")) o.heap = static_cast<long>(yyjson_get_num(x));
      flag("fullscreen", o.fullscreen); flag("kiosk", o.kiosk); flag("growDrawCommands", o.growDrawCommands);
      if (yyjson_val* x = yyjson_obj_get(v, "resize"); x && yyjson_is_str(x)) o.resize = yyjson_get_str(x);
      if (yyjson_val* x = yyjson_obj_get(v, "pixelScale"); x && yyjson_is_str(x)) o.pixelScale = yyjson_get_str(x);
      if (yyjson_val* x = yyjson_obj_get(v, "display")) {
        if (yyjson_is_str(x)) o.display = yyjson_get_str(x);
        else if (yyjson_is_obj(x)) if (yyjson_val* d = yyjson_obj_get(x, "driver"); d && yyjson_is_str(d)) o.display = yyjson_get_str(d);
      }
      out.targets[yyjson_get_str(k)] = o;
    }
  }
  auto fatal = [&](int line, const std::string& msg) { out.fatal = true; err = "line " + std::to_string(line) + ": " + msg; return false; };
  auto permissionList = [&](yyjson_val* arr, std::vector<std::string>& dst, const char* where) -> bool {
    if (!yyjson_is_arr(arr)) return fatal(1, std::string("\"") + where + "\" must be an array of permission ids");
    size_t i, n; yyjson_val* e;
    yyjson_arr_foreach(arr, i, n, e) {
      if (!yyjson_is_str(e)) return fatal(1, std::string("\"") + where + "\" holds a non-string entry");
      std::string id = yyjson_get_str(e), base = id.size() && id[0] == '-' ? id.substr(1) : id;
      std::string feature = base.substr(0, base.find(':'));
      static const std::vector<std::string> hostFeatures = {"net", "fs", "process", "serial", "camera", "microphone", "location"};   // checked by the host modules at run time (ZN-322)
      if (std::find(systemFeatures().begin(), systemFeatures().end(), feature) == systemFeatures().end() && std::find(hostFeatures.begin(), hostFeatures.end(), feature) == hostFeatures.end()) {
        std::string all; for (const std::string& f : systemFeatures()) all += (all.empty() ? "" : ", ") + f;
        for (const std::string& f : hostFeatures) all += ", " + f;
        return fatal(lineOf(text, id), "unknown permission '" + id + "' (known features: " + all + ")");
      }
      dst.push_back(id);
    }
    return true;
  };
  if (yyjson_val* a = yyjson_obj_get(root, "app")) {
    if (!yyjson_is_obj(a)) return fatal(lineOf(text, "app"), "\"app\" must be an object");
    AppInfo& app = out.app;
    app.present = true;
    { char* js = yyjson_val_write(a, 0, nullptr); if (js) { app.json = js; std::free(js); } }
    auto str = [&](const char* key, std::string& dst) -> bool { yyjson_val* x = yyjson_obj_get(a, key); if (!x) return true; if (!yyjson_is_str(x)) return fatal(lineOf(text, key), std::string("app.") + key + " must be a string"); dst = yyjson_get_str(x); return true; };
    if (!str("id", app.id) || !str("name", app.name) || !str("version", app.version) || !str("icon", app.icon) || !str("copyright", app.copyright) || !str("category", app.category)) return false;
    if (app.id.empty()) return fatal(lineOf(text, "app"), "app.id is required (a reverse-DNS id such as com.example.notes)");
    if (!reverseDns(app.id)) return fatal(lineOf(text, app.id), "app.id '" + app.id + "' is not a reverse-DNS id (letters, digits and hyphens in two or more dot-separated labels, like com.example.notes)");
    if (yyjson_val* vc = yyjson_obj_get(a, "versionCode")) {   // the build number of the stores (ZN-618): a positive integer that only grows
      if (!yyjson_is_int(vc) || yyjson_get_sint(vc) < 1 || yyjson_get_sint(vc) > 2100000000) return fatal(lineOf(text, "versionCode"), "app.versionCode must be a whole number from 1 to 2100000000");
      app.versionCode = static_cast<int>(yyjson_get_sint(vc));
    }
    if (!str("orientation", app.orientation)) return false;
    if (!app.orientation.empty() && app.orientation != "portrait" && app.orientation != "landscape" && app.orientation != "any")
      return fatal(lineOf(text, "orientation"), "app.orientation '" + app.orientation + "' is not one of portrait, landscape, any");
    if (app.orientation == "any") app.orientation.clear();
    if (yyjson_val* d = yyjson_obj_get(a, "dock")) { if (!yyjson_is_bool(d)) return fatal(lineOf(text, "dock"), "app.dock must be true or false"); app.dock = yyjson_get_bool(d); }
    for (const char* key : {"urlSchemes", "fileTypes"}) {
      yyjson_val* x = yyjson_obj_get(a, key);
      if (!x) continue;
      if (!yyjson_is_arr(x)) return fatal(lineOf(text, key), std::string("app.") + key + " must be an array of strings");
      size_t i, n; yyjson_val* e;
      yyjson_arr_foreach(x, i, n, e) if (yyjson_is_str(e)) (std::strcmp(key, "urlSchemes") == 0 ? app.urlSchemes : app.fileTypes).push_back(yyjson_get_str(e));
    }
    if (yyjson_val* w = yyjson_obj_get(a, "window")) { if (!yyjson_is_obj(w)) return fatal(lineOf(text, "window"), "app.window must be an object"); char* js = yyjson_val_write(w, 0, nullptr); if (js) { app.window = js; std::free(js); } }
  }
  if (yyjson_val* up = yyjson_obj_get(root, "update")) {   // app updates (ZN-324)
    if (!yyjson_is_obj(up)) return fatal(lineOf(text, "update"), "\"update\" must be an object: { \"url\", \"channel\", \"publicKey\" }");
    if (const char* v = yyjson_get_str(yyjson_obj_get(up, "url"))) out.updateUrl = v;
    if (const char* v = yyjson_get_str(yyjson_obj_get(up, "channel"))) out.updateChannel = v;
    if (const char* v = yyjson_get_str(yyjson_obj_get(up, "publicKey"))) out.updateKey = v;
  }
  if (yyjson_val* sg = yyjson_obj_get(root, "signing")) {   // macOS code signing (ZN-321)
    if (!yyjson_is_obj(sg)) return fatal(lineOf(text, "signing"), "\"signing\" must be an object: { \"identity\", \"keychain\", \"notaryProfile\" }");
    if (const char* v = yyjson_get_str(yyjson_obj_get(sg, "identity"))) out.signIdentity = v;
    if (const char* v = yyjson_get_str(yyjson_obj_get(sg, "keychain"))) out.signKeychain = v;
    if (const char* v = yyjson_get_str(yyjson_obj_get(sg, "notaryProfile"))) out.notaryProfile = v;
  }
  if (yyjson_val* pm = yyjson_obj_get(root, "permissions")) { out.permissionsDeclared = true; if (!permissionList(pm, out.permissions, "permissions")) return false; }
  if (yyjson_val* ps = yyjson_obj_get(root, "permissionStrings")) {   // the texts of the system's questions (iOS, macOS)
    if (!yyjson_is_obj(ps)) return fatal(lineOf(text, "permissionStrings"), "\"permissionStrings\" must be an object: { \"camera\": \"Webcam shows your camera and saves your photos.\" }");
    size_t i2, n2; yyjson_val *k2, *v2;
    yyjson_obj_foreach(ps, i2, n2, k2, v2) {
      if (!yyjson_is_str(v2)) return fatal(lineOf(text, "permissionStrings"), std::string("permissionStrings.") + yyjson_get_str(k2) + " must be a string");
      out.permissionStrings[yyjson_get_str(k2)] = yyjson_get_str(v2);
    }
  }
  if (yyjson_val* sc = yyjson_obj_get(root, "scopes")) {
    if (!yyjson_is_obj(sc)) return fatal(lineOf(text, "scopes"), "\"scopes\" must be an object");
    char* js = yyjson_val_write(sc, 0, nullptr); if (js) { out.scopes = js; std::free(js); }
  }
  if (yyjson_val* t = yyjson_obj_get(root, "targets")) {
    size_t i, n; yyjson_val *k, *v;
    yyjson_obj_foreach(t, i, n, k, v) if (yyjson_val* pm = yyjson_obj_get(v, "permissions")) if (!permissionList(pm, out.targetPermissions[yyjson_get_str(k)], "targets.<name>.permissions")) return false;
  }
  static const char* known[] = {"app", "permissions", "permissionStrings", "scopes", "name", "entry", "main", "assets", "version", "id", "icon", "crash", "display", "plugins", "pluginDirs", "targets", "board", "requires", "text", "scheme", "webgl", "web", "engine", "keyboard", "bench", "description", "profile", "ui", "icons", "template", "update", "signing", "lock", "pluginCompiler", "dependencies", "policy", "dev", "splash", "loading", "launcher"};
  size_t i, n;
  yyjson_val *k, *v;
  yyjson_obj_foreach(root, i, n, k, v) {
    bool ok = false;
    for (const char* key : known) if (!std::strcmp(yyjson_get_str(k), key)) ok = true;
    if (!ok) out.warnings.push_back(std::string("unknown key \"") + yyjson_get_str(k) + "\"");
  }
  return parseGameKeys(root, text, out, err);
}

std::string findProjectFile(const std::string& path) {
  namespace fs = std::filesystem;
  std::error_code ec;
  fs::path p = fs::absolute(path, ec).lexically_normal();
  if (!fs::is_directory(p, ec)) p = p.parent_path();
  for (; !p.empty(); p = p.parent_path()) {
    fs::path f = p / "zinc.json";
    if (fs::is_regular_file(f, ec)) return f.string();
    if (p == p.root_path()) break;
  }
  return "";
}

std::string entryOf(const std::string& dir, const Project* project) {
  namespace fs = std::filesystem;
  std::error_code ec;
  std::vector<std::string> candidates;
  if (project && !project->entry.empty()) candidates.push_back(project->entry);
  for (const char* c : {"src/main.ts", "src/main.tsx", "main.ts", "main.tsx"}) candidates.push_back(c);
  for (const std::string& c : candidates) {
    fs::path f = fs::path(dir) / c;
    if (fs::is_regular_file(f, ec)) return f.string();
  }
  return "";
}

namespace { LoaderStage gStage; }
void setLoaderStage(LoaderStage s) { gStage = std::move(s); }
const LoaderStage& loaderStage() { return gStage; }

}  // namespace zn::frontend
