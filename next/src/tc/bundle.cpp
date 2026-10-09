#include "tc/bundle.h"

#include <sys/stat.h>
#include <unistd.h>

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#endif

namespace fs = std::filesystem;

namespace zn::tc {
namespace {

std::string esc(const std::string& s) {
  std::string o;
  for (char c : s) { if (c == '&') o += "&amp;"; else if (c == '<') o += "&lt;"; else if (c == '>') o += "&gt;"; else if (c == '"') o += "&quot;"; else o += c; }
  return o;
}
std::string q(const std::string& s) { std::string o = "'"; for (char c : s) { if (c == '\'') o += "'\\''"; else o += c; } return o + "'"; }
std::string readAll(const fs::path& p) { std::ifstream in(p, std::ios::binary); std::stringstream ss; ss << in.rdbuf(); return ss.str(); }
bool run(const std::string& cmd, std::string& err, const char* what) {
  std::string full = cmd + " >/dev/null 2>/tmp/zinc-bundle.err";
  if (std::system(full.c_str()) == 0) return true;
  err = std::string(what) + " failed: " + readAll("/tmp/zinc-bundle.err").substr(0, 300);
  return false;
}

}  // namespace

std::string infoPlist(const BundleSpec& s, bool hasIcon) {
  std::ostringstream o;
  auto kv = [&](const char* k, const std::string& v) { o << "<key>" << k << "</key><string>" << esc(v) << "</string>\n"; };
  o << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n";
  kv("CFBundleIdentifier", s.id);
  kv("CFBundleName", s.name.empty() ? s.id : s.name);
  kv("CFBundleDisplayName", s.name.empty() ? s.id : s.name);
  kv("CFBundleExecutable", s.exeName);
  kv("CFBundlePackageType", "APPL");
  kv("CFBundleVersion", s.version.empty() ? "1" : s.version);
  kv("CFBundleShortVersionString", s.version.empty() ? "1.0" : s.version);
  kv("LSMinimumSystemVersion", "11.0");
  if (!s.category.empty()) kv("LSApplicationCategoryType", s.category);
  if (!s.copyright.empty()) kv("NSHumanReadableCopyright", s.copyright);
  if (hasIcon) kv("CFBundleIconFile", "icon");
  o << "<key>NSHighResolutionCapable</key><true/>\n";
  for (const auto& [k, v] : s.usage) kv(k.c_str(), v);
  if (!s.dock) o << "<key>LSUIElement</key><true/>\n";
  if (!s.urlSchemes.empty()) {
    o << "<key>CFBundleURLTypes</key><array><dict><key>CFBundleURLName</key><string>" << esc(s.id) << "</string><key>CFBundleURLSchemes</key><array>";
    for (const std::string& u : s.urlSchemes) o << "<string>" << esc(u) << "</string>";
    o << "</array></dict></array>\n";
  }
  if (!s.fileTypes.empty()) {
    o << "<key>CFBundleDocumentTypes</key><array><dict><key>CFBundleTypeName</key><string>" << esc(s.name.empty() ? s.id : s.name) << " document</string><key>CFBundleTypeRole</key><string>Editor</string><key>CFBundleTypeExtensions</key><array>";
    for (const std::string& e : s.fileTypes) o << "<string>" << esc(e) << "</string>";
    o << "</array></dict></array>\n";
  }
  o << "</dict></plist>\n";
  return o.str();
}

bool ensureDevBundle(const BundleSpec& spec, const std::string& engine, const std::string& cacheDir, std::string& appPath, bool& refreshed, std::string& err) {
  refreshed = false;
  appPath = cacheDir + "/" + spec.id + ".app";
  fs::path exe = fs::path(appPath) / "Contents/MacOS" / spec.exeName, plist = fs::path(appPath) / "Contents/Info.plist", stamp = fs::path(cacheDir) / (spec.id + ".stamp");   // beside the bundle, not in it: the signature seals what is inside
  struct stat st;
  if (stat(engine.c_str(), &st) != 0) { err = "cannot read the engine " + engine; return false; }
  std::string want = std::to_string(static_cast<long long>(st.st_size)) + " " + std::to_string(static_cast<long long>(st.st_mtime)) + " " + std::to_string(static_cast<long long>(st.st_mtimespec.tv_nsec));
  std::string plistText = infoPlist(spec, false);
  std::error_code ec;
  if (fs::exists(exe, ec) && readAll(stamp) == want && readAll(plist) == plistText) return true;   // nothing changed: two small reads and two stats
  fs::create_directories(exe.parent_path(), ec);
  fs::remove(exe, ec);
  fs::copy_file(engine, exe, fs::copy_options::overwrite_existing, ec);
  if (ec) { err = "cannot copy the engine into " + appPath + ": " + ec.message(); return false; }
  fs::permissions(exe, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  { std::ofstream(plist) << plistText; }
  if (!run("codesign --force --sign - --identifier " + q(spec.id) + " " + q(appPath), err, "codesign")) return false;
  run("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f " + q(appPath), err, "lsregister");   // URL schemes and the display name; failure is not fatal
  err.clear();
  { std::ofstream(stamp) << want; }
  refreshed = true;
  return true;
}

bool writeBundle(const BundleSpec& spec, const std::string& exe, const std::string& appPath, std::string& err) {
  std::error_code ec;
  fs::path macos = fs::path(appPath) / "Contents/MacOS", res = fs::path(appPath) / "Contents/Resources";
  fs::create_directories(macos, ec);
  fs::create_directories(res, ec);
  fs::path target = macos / spec.exeName;
  if (fs::absolute(exe) != fs::absolute(target)) { fs::remove(target, ec); fs::copy_file(exe, target, fs::copy_options::overwrite_existing, ec); if (ec) { err = "cannot write " + target.string() + ": " + ec.message(); return false; } }
  fs::permissions(target, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  bool hasIcon = false;
  if (!spec.icon.empty()) {
    if (!fs::exists(spec.icon)) { err = "app.icon " + spec.icon + " does not exist"; return false; }
    // an iconset of the sizes macOS asks for (sips scales the PNG, iconutil packs them): `sips -s format icns` alone refuses PNGs that are not exactly one icon size
    fs::path set = fs::temp_directory_path() / ("zinc-icon-" + std::to_string(::getpid()) + ".iconset");
    fs::remove_all(set, ec);
    fs::create_directories(set, ec);
    static const struct { int px; const char* name; } sizes[] = {{16, "icon_16x16"}, {32, "icon_16x16@2x"}, {32, "icon_32x32"}, {64, "icon_32x32@2x"}, {128, "icon_128x128"}, {256, "icon_128x128@2x"}, {256, "icon_256x256"}, {512, "icon_256x256@2x"}, {512, "icon_512x512"}, {1024, "icon_512x512@2x"}};
    for (const auto& z : sizes)
      if (!run("sips -z " + std::to_string(z.px) + " " + std::to_string(z.px) + " " + q(spec.icon) + " --out " + q((set / (std::string(z.name) + ".png")).string()), err, "sips (scaling the icon)")) { fs::remove_all(set, ec); return false; }
    bool ok = run("iconutil -c icns " + q(set.string()) + " -o " + q((res / "icon.icns").string()), err, "iconutil");
    fs::remove_all(set, ec);
    if (!ok) return false;
    hasIcon = true;
  }
  { std::ofstream(fs::path(appPath) / "Contents/Info.plist") << infoPlist(spec, hasIcon); }
  return run("codesign --force --sign - --identifier " + q(spec.id) + " " + q(appPath), err, "codesign");
}

std::string runningBundleId() {
#ifdef __APPLE__
  CFBundleRef b = CFBundleGetMainBundle();
  CFStringRef id = b ? CFBundleGetIdentifier(b) : nullptr;
  char buf[256];
  if (id && CFStringGetCString(id, buf, sizeof buf, kCFStringEncodingUTF8)) return buf;
#endif
  return "";
}

}  // namespace zn::tc
