#pragma once
// The native code of plugins (ZN-101, decision D2): a plugin's native sources are compiled on first use into ~/.zinc/cache/<target>/plugins/<name>-<hash>/ and
// found there again while nothing they depend on changes. Vendored C libraries (`.c` files of the manifest) go into a separate static archive that an edit of the
// plugin's own sources does not rebuild. The desktop interpreter dlopens the shared library; an AOT program links the static archives.
#include <string>
#include <vector>

#include "frontend/plugin_manifest.h"

namespace zn::tc {

struct PluginLib {
  std::string plugin;                  // the manifest name: "sqlite"
  std::string module;                  // what requireNative names: "Sqlite"
  std::string shared;                  // plugin.dylib / plugin.so: dlopen
  std::string archive, vendor;         // static archives of the plugin's objects and of its vendored C libraries (vendor empty when it has none)
  std::vector<std::string> linkArgs;   // -l, -framework, pkg-config --libs and linkFlags for a program that links the archives
  bool display = false;                // a display driver (kind "display"): no native module, its static constructor registers it with the HAL; AOT links it whole
  bool rebuilt = false;                // false when the cache already held it
  bool prebuilt = false;               // the plugin's own prebuilt/<target>/ libraries were used (ZN-328.03)
  std::string key;                     // what prebuilt/<target>/key must hold for them to be used: the ABI headers and the defines
  double seconds = 0;
};

// The plugin of `plugins` whose spec names native module `module`; null when none does.
const frontend::FoundPlugin* pluginForModule(const std::vector<frontend::FoundPlugin>& plugins, const std::string& module);

// Builds (or finds in the cache, or in the plugin's prebuilt/<target>/ when its key matches) the native code of `p` for `target` ("macos" or "linux": this machine). False with `err` when it cannot: the target is not in its
// manifest, a compiler or a system library is missing (the message names the package to install), or the compiler fails.
bool buildPlugin(const frontend::FoundPlugin& p, const std::string& engineRoot, const std::string& projectDir, const std::string& target, PluginLib& out, std::string& err);

// dlopen the shared library and register its module in the native registry (include/zn/native.h).
bool loadPlugin(const PluginLib& lib, std::string& err);

// Cross builds (zinc build --target aarch64-linux): while set, buildPlugin compiles with `zig c++ -target <zigTarget>` and produces only the static archive (no shared
// library to dlopen); the cache entry is keyed by the target. System libraries (`pkg`) are not available that way: such a plugin is refused with a message.
void setCrossTarget(const std::string& name, const std::string& zigTarget, const std::string& zig);
void clearCrossTarget();

// "macos" or "linux": the plugin target of this machine.
std::string pluginTarget();

}  // namespace zn::tc
