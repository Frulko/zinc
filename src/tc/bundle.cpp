#include "tc/bundle.h"

#include <unistd.h>

#include "platform/platform.h"

#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>

#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#include <dlfcn.h>
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
#ifdef __ENVIRONMENT_MAC_OS_X_VERSION_MIN_REQUIRED__
  constexpr int minimum = __ENVIRONMENT_MAC_OS_X_VERSION_MIN_REQUIRED__;
  kv("LSMinimumSystemVersion", std::to_string(minimum / 10000) + "." + std::to_string(minimum / 100 % 100) + "." + std::to_string(minimum % 100));
#else
  kv("LSMinimumSystemVersion", "11.0");
#endif
  if (!s.category.empty()) kv("LSApplicationCategoryType", s.category);
  if (!s.copyright.empty()) kv("NSHumanReadableCopyright", s.copyright);
  if (hasIcon) kv("CFBundleIconFile", "icon");
  o << "<key>NSHighResolutionCapable</key><true/>\n";
  for (const auto& [k, v] : s.usage) {
    kv(k.c_str(), v);
    // an iPhone as a webcam (Continuity Camera, macOS 14+) is listed under its own device type, without AVFoundation's deprecation warning
    if (k == "NSCameraUsageDescription") o << "<key>NSCameraUseContinuityCameraDeviceType</key><true/>\n";
  }
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

std::string entitlementsPlist(const BundleSpec& s) {
  std::string o = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\"><dict>\n";
  for (const std::string& e : s.entitlements) o += "<key>" + esc(e) + "</key><true/>\n";
  return o + "</dict></plist>\n";
}

bool ensureDevBundle(const BundleSpec& spec, const std::string& engine, const std::string& cacheDir, std::string& appPath, bool& refreshed, std::string& err) {
  refreshed = false;
  appPath = cacheDir + "/" + spec.id + ".app";
  fs::path exe = fs::path(appPath) / "Contents/MacOS" / spec.exeName, plist = fs::path(appPath) / "Contents/Info.plist", stamp = fs::path(cacheDir) / (spec.id + ".stamp");   // beside the bundle, not in it: the signature seals what is inside
  long long size = 0, mtime = 0;
  if (!zn::plat::fileStamp(engine, size, mtime)) { err = "cannot read the engine " + engine; return false; }
  std::string want = std::to_string(size) + " " + std::to_string(mtime / 1000000000LL) + " " + std::to_string(mtime % 1000000000LL);
  // the modules zinc loads from beside it (libzn_window, libzn_webgl: ZN-592.01, ZN-330) go into the bundle with it
  std::vector<fs::path> modules;
  std::error_code ec;
  for (const auto& e : fs::directory_iterator(fs::path(engine).parent_path(), ec)) {
    const std::string n = e.path().filename().string();
    if (n.rfind("libzn_", 0) == 0 && e.path().extension() == ".dylib" && zn::plat::fileStamp(e.path().string(), size, mtime)) {
      modules.push_back(e.path());
      want += " " + n + " " + std::to_string(size) + " " + std::to_string(mtime / 1000000000LL);
    }
  }
  std::string plistText = infoPlist(spec, false);
  if (fs::exists(exe, ec) && readAll(stamp) == want && readAll(plist) == plistText) return true;   // nothing changed: two small reads and a few stats
  fs::create_directories(exe.parent_path(), ec);
  fs::remove(exe, ec);
  fs::copy_file(engine, exe, fs::copy_options::overwrite_existing, ec);
  if (ec) { err = "cannot copy the engine into " + appPath + ": " + ec.message(); return false; }
  fs::permissions(exe, fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  for (const fs::path& m : modules) {
    fs::copy_file(m, exe.parent_path() / m.filename(), fs::copy_options::overwrite_existing, ec);
    if (ec) { err = "cannot copy " + m.string() + " into " + appPath + ": " + ec.message(); return false; }
    if (!run("codesign --force --sign - " + q((exe.parent_path() / m.filename()).string()), err, "codesign")) return false;   // the bundle's signature covers signed code only
  }
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
  fs::remove_all(res / "assets", ec);   // the assets the app reads (zinc:assets, zinc:// pages): inside the bundle, sealed by its signature (ZN-645)
  if (!spec.assets.empty() && fs::is_directory(spec.assets)) {
    fs::copy(spec.assets, res / "assets", fs::copy_options::recursive, ec);
    if (ec) { err = "cannot copy " + spec.assets + " into the bundle: " + ec.message(); return false; }
  }
  { std::ofstream(fs::path(appPath) / "Contents/Info.plist") << infoPlist(spec, hasIcon); }
  // ad hoc as before, or the identity of zinc.json "signing" with the hardened runtime notarization asks for (ZN-321); the entitlements follow the permissions
  const bool adhoc = spec.identity.empty() || spec.identity == "-";
  std::string cmd = "codesign --force --sign " + q(adhoc ? "-" : spec.identity);
  if (!spec.keychain.empty()) cmd += " --keychain " + q(spec.keychain);
  if (!adhoc) cmd += " --options runtime";
  if (spec.identity.rfind("Developer ID", 0) == 0) cmd += " --timestamp";   // Apple's secure timestamp, which notarization requires
  const fs::path ent = fs::temp_directory_path() / ("zinc-entitlements-" + std::to_string(::getpid()) + ".plist");
  if (!spec.entitlements.empty()) { std::ofstream(ent) << entitlementsPlist(spec); cmd += " --entitlements " + q(ent.string()); }
  const bool ok = run(cmd + " --identifier " + q(spec.id) + " " + q(appPath), err, "codesign");
  fs::remove(ent, ec);
  return ok;
}

// CoreFoundation is opened here, not linked: linking it runs ~400 initializers of the frameworks behind it (Network, SkyLight) at every
// launch of zinc, about 2 ms on the Intel Mac (ZN-592.01)
std::string runningBundleId() {
#ifdef __APPLE__
  void* cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL);
  auto mainBundle = cf ? reinterpret_cast<CFBundleRef (*)()>(dlsym(cf, "CFBundleGetMainBundle")) : nullptr;
  auto identifier = cf ? reinterpret_cast<CFStringRef (*)(CFBundleRef)>(dlsym(cf, "CFBundleGetIdentifier")) : nullptr;
  auto cString = cf ? reinterpret_cast<Boolean (*)(CFStringRef, char*, CFIndex, CFStringEncoding)>(dlsym(cf, "CFStringGetCString")) : nullptr;
  CFBundleRef b = mainBundle && identifier && cString ? mainBundle() : nullptr;
  CFStringRef id = b ? identifier(b) : nullptr;
  char buf[256];
  if (id && cString(id, buf, sizeof buf, kCFStringEncodingUTF8)) return buf;
#endif
  return "";
}

}  // namespace zn::tc
