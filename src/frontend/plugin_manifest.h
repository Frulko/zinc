#pragma once
// plugin.json: the manifest of a plugin (plugins/<name>/plugin.json), read with yyjson. Only what the frontend needs is typed; the rest is kept as JSON text
// for the tasks that build and link plugins (native-module ABI, display drivers).
#include <map>
#include <string>
#include <string_view>
#include <vector>

namespace zn::frontend {

// One option of a plugin (`options` of plugin.json, `plugins.<name>` of zinc.json): the C++ side sees it as ZP_<PLUGIN>_<KEY>=<cpp>.
struct PluginOption {
  std::string key;
  std::string cpp;   // the value as a C++ token: 36, 0.5, 1 (true), "text" (a JSON string literal)
};

// What `targets.<id>` of a plugin.json says about building the native part for one target (docs/plugins.md).
struct PluginTarget {
  std::vector<std::string> sources, pkg, frameworks, libs, linkFlags, defines, flags, packages, idf;
  std::string cargo;                                  // a Rust crate of the plugin ("rust"): cargo builds it as a static library that the plugin links
  std::vector<std::string> vendorFlags;               // flags of the vendored sources only (libdatachannel's -frtti, which the plugin's own code, built against zrt, cannot take)
  std::map<std::string, std::string> idfComponents;   // ESP Component Registry dependencies
  std::vector<std::string> sdkconfig;                 // esp32: the firmware settings the native code needs ("CONFIG_AUTOSTART_ARDUINO=n"), added to its sdkconfig defaults
  std::vector<std::string> nodeFlags;                 // the old simulator's: read, never used
  // the phone targets (android, ios; ZN-628, docs/plugins.md "Phones"): what zinc export merges into the generated project. `sources` there may
  // hold .java and .kt (Android, compiled by Gradle) and .m, .mm and .swift (iOS) beside the C++.
  std::vector<std::string> gradle;                    // android: dependencies of app/build.gradle ("androidx.webkit:webkit:1.12.1")
  std::vector<std::string> permissions;               // android: manifest.permissions, <uses-permission> names ("VIBRATE" means android.permission.VIBRATE)
  std::string manifestXml, applicationXml;            // android: manifest.manifest (inside <manifest>: <queries>...) and manifest.application (inside <application>)
  int minSdk = 0;                                     // android: the lowest API level the plugin needs (the export takes the highest of all)
  std::string plistJson, entitlementsJson;            // ios: Info.plist keys and entitlements, as JSON objects (strings, booleans, numbers, arrays, objects)
  std::string privacyJson;                            // ios: required-reason API categories the plugin's native code calls, with their reasons ({"NSPrivacyAccessedAPICategoryUserDefaults": ["CA92.1"]}; ZN-629)
  std::string lifecycle;                              // android: a Java class implementing dev.zinc.app.ZincLifecycle; ios: an ObjC class conforming to ZincLifecycle
  std::string nativeClass;                            // android and ios: the Java or ObjC/Swift class behind the spec (zinc native-gen --android/--ios), in place of a C++ implementation
};

struct PluginManifest {
  std::string name;
  std::string kind = "module";           // "module" or "display"
  std::string module;                    // the specifier it provides: "zinc:pixelfont" (empty for display plugins)
  std::string entry = "index.ts";        // the Zinc source of the module, relative to the plugin directory
  std::string description;
  std::vector<std::string> requires_;    // capabilities the plugin needs
  std::map<std::string, std::string> aliases;  // `modules`: bare import specifiers (three/addons/...) the plugin answers, to the file that serves them
  std::vector<std::string> targets;      // names of the targets it supports (macos, linux, rpi1, esp32, wasm, rmpp, ps2, sim)
  std::string optionsJson;               // the `options` object as JSON text ("" when absent)
  std::string targetsJson;               // the `targets` object as JSON text
  std::vector<PluginOption> options;     // `options`, in file order
  std::map<std::string, PluginTarget> targetSettings;
  // v2 keys (docs/reports/parity/03 section 3), all optional
  int abi = 1;                           // the native-module ABI the native part targets
  std::string nativeSpec, nativeName;    // `native`: the spec file and the module name (default: native/<x>.spec.ts by convention)
  std::map<std::string, std::string> nativeImpl;  // `native.impl`: target -> source (default: <x>.<target>.cpp, else <x>.host.cpp)
  std::string sim;                       // a Zinc stand-in for the native part
  bool deterministic = false, threads = false;
  bool live = false;   // "live": the plugin's stand-in only serves deterministic runs; anywhere else its native code wins even over an x.next.ts (video: real decoding)
  std::string license, link;             // link: "static" or "dynamic"
};

// Parses the manifest text. False with `err` set when it is not a JSON object or a typed key has the wrong type. Unknown top-level keys are not an error: they go to `warnings`.
bool parsePluginManifest(std::string_view text, PluginManifest& out, std::string& err, std::vector<std::string>& warnings);

// The plugins visible from a project, as the prototype's `discover`: the engine's `plugins/`, the project's `plugins/`, then each `pluginDirs` of its zinc.json; a later
// plugin of the same name shadows an earlier one. Manifests that do not load are described in `problems` (warnings too, once each).
struct FoundPlugin { PluginManifest manifest; std::string dir; };
std::vector<FoundPlugin> discoverPlugins(const std::string& engineRoot, const std::string& projectDir, std::vector<std::string>& problems);

// `zinc plugins`: the toolbox table of the prototype (`plugin (import / display)  targets  description`).
std::string listPlugins(const std::vector<FoundPlugin>& plugins);

// The options of a plugin for a target, merged like the prototype's `optionsOf`: plugin.json defaults, then zinc.json `plugins.<name>`, then `targets.<target>.plugins.<name>`
// (a `board` of zinc.json supplies defaults of its own), and for a display plugin the options of the project's `display` object.
std::vector<PluginOption> pluginOptions(const FoundPlugin& p, const std::string& projectDir, const std::string& engineRoot, const std::string& target);
// The display of a project for a target (ZN-104): the driver named by ZINC_DISPLAY, else by `targets.<target>.display`, else by `display` of zinc.json (a name, or { driver, ... }),
// with the board file (`board`) supplying defaults; and the program surface the board says (`width`, `height`, 0 when none). Empty driver: the host window.
struct DisplaySelection { std::string driver; int width = 0, height = 0; };
DisplaySelection selectDisplay(const std::string& projectDir, const std::string& engineRoot, const std::string& target);

// ZP_<PLUGIN>_<KEY>=<value> for each option, then ZP_<PLUGIN>=1.
std::vector<std::string> pluginDefines(const FoundPlugin& p, const std::string& projectDir, const std::string& engineRoot, const std::string& target);

// One line per plugin of `dir` (a directory of plugin directories): `name kind module entry targets`, sorted by name; the manifests that do not load are described in `problems`.
std::string describePlugins(const std::string& dir, std::vector<std::string>& problems);

}  // namespace zn::frontend
