#pragma once
// macOS app bundles (ZN-234, docs/reports/system-integration.md 5.1): the Info.plist of a zinc.json `app`, the dev bundle `zinc run` executes from so the process has a bundle id, name and
// icon (notifications, app menu, dock, URL schemes), and `zinc build --bundle`. Ad-hoc signing only; signing with an identity and notarisation are commands for the owner.
#include <string>
#include <vector>

namespace zn::tc {

struct BundleSpec {
  std::string id, name, version, category, copyright, icon;   // icon: a PNG path (made absolute by the caller), "" = none
  bool dock = true;                                          // false: LSUIElement, a tray-only app
  std::vector<std::string> urlSchemes, fileTypes;            // file types are extensions without the dot
  std::string exeName = "zinc";                              // the executable inside Contents/MacOS
};

/** The Info.plist text (XML) of `spec`. */
std::string infoPlist(const BundleSpec& spec, bool hasIcon);

/** The dev bundle of `spec` in `<cacheDir>/<id>.app` holding a copy of `engine` (hard links do not survive code signing): created or refreshed when the engine or the plist changed (a stat
 *  comparison when nothing did), signed ad hoc, registered with LaunchServices once. `appPath` is the bundle; `refreshed` says whether anything was written. */
bool ensureDevBundle(const BundleSpec& spec, const std::string& engine, const std::string& cacheDir, std::string& appPath, bool& refreshed, std::string& err);

/** Writes a complete bundle at `appPath` around the executable `exe` (copied or moved in as Contents/MacOS/<exeName>): Info.plist, icon.icns from the PNG (sips), ad-hoc signature. */
bool writeBundle(const BundleSpec& spec, const std::string& exe, const std::string& appPath, std::string& err);

/** CFBundleIdentifier of the running process, "" outside a bundle. */
std::string runningBundleId();

}  // namespace zn::tc
