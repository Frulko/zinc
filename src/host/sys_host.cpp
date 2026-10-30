// The system modules of the host (ZN-049): zinc:sys, zinc:fs, zinc:storage, zinc:assets and zinc:os on a POSIX machine, behind the Rt::Host*
// entries from HostSysFirst (include/zn/runtime.h). The Zinc side (the module sources of src/frontend/modules.cpp) turns the flat calls into
// the API of lib/modules.d.ts: an error is reported with fsFailed()/fsError() and thrown there. Plain C++17, no dependency on the old runtime.
#include "host/assets_host.h"
#include "host/permissions.h"
#include "zpk/zpk.h"
#include "zrt_assets_dir.h"
#include <signal.h>
#include "zn/alloc_stats.h"
#define HOST_DEFINES_RESOURCE_STATS
#include "zn/resource_stats.h"
#include "zn/zim.h"
#include "zn/app.h"
#include "zn/platform.h"
#include "hal.h"
// the CPU decoders of the GPU block formats (ZN-439): the software raster draws a compressed texture from its decoded texels
#define BCDEC_STATIC
#define BCDEC_IMPLEMENTATION
#include "bcdec.h"
#define ETCDEC_STATIC
#define ETCDEC_IMPLEMENTATION
#include "etcdec.h"
#ifdef _WIN32
#include "posix_shims.h"   // the POSIX side of this file, behind Windows calls
#include <winsock2.h>
#else
#include <sys/wait.h>
#include <dirent.h>
#include <dlfcn.h>
#include <sys/utsname.h>
#include <pwd.h>
#include <grp.h>
#include <net/if.h>
#include <arpa/inet.h>
#include <ifaddrs.h>
#endif
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <cmath>
#include <fstream>
#include <array>
#include <map>
#include <random>
#include <sstream>
#include <string>
#include <vector>

#if defined(__APPLE__)
#include <TargetConditionals.h>
#include <mach-o/dyld.h>
#include <mach/mach.h>
#include <sys/sysctl.h>
#include <net/if_dl.h>
#elif defined(_WIN32)
#include <psapi.h>   // GetProcessMemoryInfo of the resource stats
#else
#include <linux/if_packet.h>
#endif
#ifdef __ANDROID__
#include <sys/system_properties.h>
#endif

#include "zn/host.h"
#include "zn/hostsys.h"
#include "zn/loop.h"
#include <uv.h>
#include "mqtt.h"
#include "netlog.h"
#include "http.h"
#include "sock.h"
#include "crypto.h"
#include "regexp.h"
#include "zn/runtime.h"

namespace {
struct ResourceProvider { const char* name; ZnResourceStatsFn read; void* owner; };
// Providers live with their loaded module; snapshots and registration run on the host thread.
ResourceProvider resourceProviders[64];
unsigned resourceProviderCount;
ZnResourceStats assetStats(void*) { return {0, (uint64_t)zn::host::assets::stat(0), 0, 0, (uint64_t)zn::host::assets::stat(5)}; }
ZnResourceStats runtimeStats(void*) { return {zn::rt::gAllocs - zn::rt::gFrees, 0, 0, 0, 0}; }
std::string resourceSnapshot() {
  static ZnResourceStatsRegistration runtimeStatsRegistration("runtime.blocks", runtimeStats);
  static ZnResourceStatsRegistration assetsStats("assets.resident", assetStats);
  std::string out = "{";
  for (unsigned i = 0; i < resourceProviderCount; ++i) {
    const auto& p = resourceProviders[i]; const auto v = p.read(p.owner);
    if (i) out += ",";
    out += "\"" + std::string(p.name) + "\":{\"objects\":" + std::to_string(v.objects) +
      ",\"cpuBytes\":" + std::to_string(v.cpuBytes) + ",\"gpuBytesEstimate\":" + std::to_string(v.gpuBytes) +
      ",\"borrowedBytes\":" + std::to_string(v.borrowedBytes) + ",\"active\":" + std::to_string(v.active) + "}";
  }
  return out + "}";
}
}
extern "C" const char* zn_resource_stats_json(void) {
  static std::string snapshot; snapshot = resourceSnapshot(); return snapshot.c_str();
}
extern "C" void zn_resource_stats_register(const char* name, ZnResourceStatsFn read, void* owner) {
  if (!name || !read) return;
  for (const char* c = name; *c; ++c) if (!((*c >= 'a' && *c <= 'z') || (*c >= '0' && *c <= '9') || *c == '.' || *c == '_')) return;
  for (unsigned i = 0; i < resourceProviderCount; ++i) if (!std::strcmp(resourceProviders[i].name, name)) {
    resourceProviders[i] = {name, read, owner}; return;
  }
  if (resourceProviderCount < 64) resourceProviders[resourceProviderCount++] = {name, read, owner};
}

extern char** environ;

namespace zrt::raster {
int32_t add_font_file(const char* name, uint32_t name_len, const uint8_t* data, uint32_t len);   // runtime/ttf.cpp
int32_t dyn_create(int32_t w, int32_t h);   // runtime/raster.cpp (zrt_raster.h): runtime images
uint32_t* dyn_pixels(int32_t id);
void dyn_resize(int32_t id, int32_t w, int32_t h);
void dyn_set_alpha(int32_t id, bool on);
void dyn_update(int32_t id, const uint32_t* px, int32_t stride);
void dyn_destroy(int32_t id);
void dyn_set_blocks(int32_t id, uint32_t gl, const void* data, uint32_t bytes, bool premultiplied);
}
namespace zn::host {
namespace {

using zn::Rt;

std::vector<std::string> gArgs;
thread_local std::string gOut;           // the string a call returns
thread_local std::string gError;         // the last failure: "CODE: op path"
thread_local bool gFailed = false;   // these results are per thread: a worker (zinc:worker, D181) calls the system modules from its own
thread_local std::vector<std::string> gNames;   // directory listing / environment keys / storage keys / asset names
thread_local std::vector<std::array<std::string, 6>> gNets;   // os.networkInterfaces(): name, address, netmask, family, mac, internal
thread_local std::vector<int> gKinds;           // listing entries: 1 file, 2 directory, 4 symlink
thread_local std::vector<unsigned char> gBytes; // the file or asset loaded last
thread_local std::vector<zn::zpk::Input> gPack;  // the entries of the pack zinc:assets writePack is making
struct StatInfo { double size = 0, mtime = 0, atime = 0, ctime = 0; int mode = 0, file = 0, dir = 0, link = 0; }; thread_local StatInfo gStat;

thread_local std::string gCryptoError;
thread_local std::string gServeDenied;   // why the last serve was refused by the permissions
thread_local std::string gPermDenied;    // why the last process, socket, mqtt or osc call was refused by the permissions (read once by their error())
bool refused(const char* feature, const std::string& detail) { gPermDenied = zn::host::perm::check(feature, detail); return !gPermDenied.empty(); }
std::string takeRefusal() { std::string s; s.swap(gPermDenied); return s; }
thread_local std::string gPayload;   // the payload of the event evNext returned last
// The working directory the program started in (ZN-687: sys.launchDir of a built program), kept before its first chdir.
const std::string& startDir() { static const std::string d = [] { char b[4096]; return std::string(getcwd(b, sizeof b) ? b : ""); }(); return d; }
// "fr_FR.UTF-8@euro" -> "fr-FR"
std::string bcp47(std::string v) {
  const size_t cut = v.find_first_of(".@");
  if (cut != std::string::npos) v.resize(cut);
  std::replace(v.begin(), v.end(), '_', '-');
  return v;
}
// The system's preferred language (ZN-687): the environment first, then on macOS the first of the user's languages (CoreFoundation, opened when
// asked: programs do not link it, ZN-592.01), else en-US.
std::string systemLocale();
std::string desktopDevice(const std::string& q, const std::string& a);
// zinc run --simulate <device> (docs/guide/09-web-apis.md "Simulated devices"): a device's answers from the state its control panel
// (app/devicesim) writes, one `key=value` a line in ZINC_SIM_STATE (the panel copies there what devices/<id>.json says); the keys pressed in
// the panel are lines appended to <state>.keys; what the program asks of the device (wake lock, lights, vibration, a notification...) is
// written to <state>.app for the panel to show. A value marked relayed takes this machine's own answer (a Mac's battery, its network).
struct SimDevice {
  std::string path;
  std::map<std::string, std::string> v, asked;
  long keysAt = 0;
  explicit SimDevice(const char* p) : path(p) {}
  void load() {
    v.clear();
    std::ifstream in(path);
    std::string line;
    while (std::getline(in, line)) { const auto eq = line.find('='); if (eq != std::string::npos) v[line.substr(0, eq)] = line.substr(eq + 1); }
  }
  std::string get(const std::string& k, const std::string& d = "") const { auto i = v.find(k); return i == v.end() ? d : i->second; }
  bool has(const std::string& k) const { return get(k) == "1"; }
  void tell(const std::string& k, const std::string& val) {
    asked[k] = val;
    std::ofstream o(path + ".app.new");
    for (const auto& [key, x] : asked) o << key << '=' << x << '\n';
    o.close();
    std::rename((path + ".app.new").c_str(), (path + ".app").c_str());
  }
  std::string keys() {   // the keys pressed since the last call, comma-separated
    std::ifstream in(path + ".keys");
    if (!in) return "";
    in.seekg(keysAt);
    std::string out, line;
    while (std::getline(in, line)) if (!line.empty()) out += (out.empty() ? "" : ",") + line;
    in.clear();
    keysAt = static_cast<long>(in.tellg() < 0 ? keysAt : static_cast<long>(in.tellg()));
    return out;
  }
};
SimDevice* simDevice() { static SimDevice* s = getenv("ZINC_SIM_STATE") ? new SimDevice(getenv("ZINC_SIM_STATE")) : nullptr; return s; }
// The panel goes with the program: the CLI started it before the program replaced the CLI's process (exec), so the program stops it.
const int simPanelGuard = [] {
  static pid_t panel = getenv("ZINC_SIM_PANEL") ? static_cast<pid_t>(std::atoi(getenv("ZINC_SIM_PANEL"))) : 0;
  if (panel > 0) std::atexit([] {
    kill(panel, SIGTERM);
    if (const char* st = getenv("ZINC_SIM_STATE")) for (const char* x : {"", ".keys", ".app", ".new", ".win", ".win.new"}) std::remove((std::string(st) + x).c_str());
  });
  return 0;
}();
// A simulated device's answer, or false when the query is not one it answers (the display driver and the desktop then do).
bool simAnswer(const std::string& q, const std::string& a, std::string& out) {
  SimDevice* s = simDevice();
  if (!s) return false;
  s->load();
  if (s->v.empty()) return false;   // the panel has not written its first state yet
  auto cap = [&](const char* k) { return s->has(std::string("can.") + k); };
  if (q == "battery") {
    if (!cap("battery")) { out = ""; return true; }
    if (s->has("battery.relay")) { out = desktopDevice(q, a); return true; }
    const std::string src = s->get("battery.source", "none");
    out = "{\"level\":" + s->get("battery.level", "1") + ",\"charging\":" + (src == "none" ? "false" : "true") + ",\"source\":\"" + src +
          "\",\"chargingTime\":-1,\"dischargingTime\":-1,\"temperature\":" + s->get("battery.temperature", "25") + "}";
    return true;
  }
  if (q == "network") {
    if (s->has("network.relay")) { out = desktopDevice(q, a); return true; }
    const bool on = s->has("network.online");
    out = std::string("{\"online\":") + (on ? "true" : "false") + ",\"type\":\"" + (on ? s->get("network.type", "wifi") : "none") + "\",\"ssid\":\"" +
          (on ? s->get("network.ssid") : "") + "\",\"ip\":\"" + (on ? "10.0.0.2" : "") + "\",\"quality\":\"" + s->get("network.quality", "excellent") + "\"}";
    return true;
  }
  if (q == "motion") { out = cap("motion") ? "{\"x\":" + s->get("motion.x", "0") + ",\"y\":" + s->get("motion.y", "9.81") + ",\"z\":" + s->get("motion.z", "0") + "}" : ""; return true; }
  if (q == "compass") { out = cap("compass") ? "{\"heading\":" + s->get("compass.heading", "0") + ",\"magnetic\":" + s->get("compass.heading", "0") + ",\"accuracy\":" + s->get("compass.accuracy", "80") + "}" : ""; return true; }
  if (q == "gyro") { out = cap("gyro") ? "{\"x\":" + s->get("gyro.x", "0") + ",\"y\":" + s->get("gyro.y", "0") + ",\"z\":" + s->get("gyro.z", "0") + "}" : ""; return true; }
  if (q == "orientation") { s->tell("orientation", a); out = "1"; return true; }
  if (q == "turn") {   // the program's picture turned: the device's turn when it follows (screen.orientation.unlock), else none
    const bool follows = s->asked.count("orientation") && s->asked["orientation"] == "any";
    out = follows ? std::to_string((std::atoi(s->get("rotation", "0").c_str()) / 90) & 3) : "0";
    return true;
  }   // the program turns with the device ('any') or not: the window follows
  if (q == "light") { out = cap("light") ? "{\"lux\":" + s->get("light.lux", "300") + "}" : ""; return true; }
  // a console's own inputs (ZN-759, zinc:hardware): the microphone's level, the 3D slider (the program asks for left and right renders with
  // arg 1; a desktop shows one eye), the rear touch pad's fingers ([[x, y, id], ...] in the screen's pixels)
  if (q == "microphone") { out = cap("microphone") ? "{\"level\":" + s->get("microphone.level", "0") + "}" : ""; return true; }
  if (q == "stereo") { if (!a.empty()) s->tell("stereo", a); out = cap("stereo") ? s->get("stereo.depth", "0") : ""; return true; }
  if (q == "reartouch") { out = cap("reartouch") ? s->get("reartouch", "[]") : ""; return true; }
  if (q == "visibility") { out = s->get("visible", "1") == "1" ? "visible" : "hidden"; return true; }
  if (q == "keys") { out = s->keys(); return true; }
  if (q == "language") { out = s->get("language"); if (out.empty()) return false; return true; }
  if (q == "device") {
    out = "{\"model\":\"" + s->get("device.model") + "\",\"os\":\"" + s->get("device.os") + "\",\"name\":\"" + s->get("device.name") + "\",\"natural\":\"" +
          s->get("device.natural", "landscape") + "\",\"sensorAngle\":" + s->get("device.sensorAngle", "0") + "}";
    return true;
  }
  if (q == "vibrate") { if (cap("vibrate")) s->tell("vibrate", a + "@" + std::to_string(std::time(nullptr))); out = cap("vibrate") ? "1" : "0"; return true; }
  if (q == "notify") {
    if (!a.empty() && cap("notifications")) { std::string one = a; for (char& c : one) if (c == '\n') c = ' '; s->tell("notify", one); }
    out = cap("notifications") ? "1" : "0";
    return true;
  }
  // what the program asks and the device shows: the screen kept on, the system keyboard, the lights, the backlight, full speed (zinc:webos)
  for (const char* k : {"wakelock", "keyboard", "indicator", "backlight", "performance"})
    if (q == k) { s->tell(k, a); out = cap(k) ? "1" : "0"; return true; }
  if (q == "cpu") {   // a simulated device's clock: full speed when the program asked for it (zinc:webos setPerformance)
    if (!cap("performance")) { out = ""; return true; }
    const bool fast = s->asked.count("performance") && s->asked["performance"] == "1";
    out = std::string("{\"freq\":") + (fast ? "1188000" : "192000") + ",\"max\":1188000,\"cores\":" + (fast ? "2" : "1") + ",\"governor\":\"" + (fast ? "performance" : "ondemand") + "\"}";
    return true;
  }
  if (q == "camera" || q == "cameras") { out = ""; return true; }   // ponytail: the host's camera relayed once Zinc has a capture backend
  return false;
}

#ifdef __ANDROID__   // SDL3's (SDL_video.h, SDL_system.h), without its headers in the host library
extern "C" bool SDL_DisableScreenSaver(void);
extern "C" bool SDL_EnableScreenSaver(void);
extern "C" bool SDL_SendAndroidMessage(unsigned command, int param);
#endif
// A desktop's device features for the web APIs (HalDisplay::device answers first on a device): the network, the battery of a Mac (IOKit,
// opened when asked), the language, the machine; '' for what a desktop has not (sensors, wake lock: zinc:system/power has a sleep blocker).
// An Android app: the screen kept on and its brightness.
// Platform.Version: Android's API level, the iOS or macOS version, the Linux kernel's; ZINC_PLATFORM_VERSION forces it, and a phone forced
// on a desktop (ZINC_PLATFORM) answers a current version of that OS
std::string osVersion() {
  if (const char* v = getenv("ZINC_PLATFORM_VERSION"); v && *v) return v;
  const std::string run = zn::runPlatform();
  if (run != zn::builtPlatform()) return run == "android" ? "35" : run == "ios" ? "18.0" : "";
#if defined(__ANDROID__)
  char b[PROP_VALUE_MAX] = "";
  __system_property_get("ro.build.version.sdk", b);
  return b;
#elif defined(__APPLE__)
#if TARGET_OS_SIMULATOR
  if (const char* v = getenv("SIMULATOR_RUNTIME_VERSION"); v && *v) return v;   // the simulator's iOS: sysctl answers the Mac's version there
#endif
  char b[64] = "";
  size_t n = sizeof b;
  return sysctlbyname("kern.osproductversion", b, &n, nullptr, 0) == 0 ? std::string(b) : std::string();
#elif defined(_WIN32)
  // RtlGetVersion's Major.Minor.Build: the honest numbers regardless of the manifest's compat tabs
  using RtlGetVersion_t = long (WINAPI*)(RTL_OSVERSIONINFOW*);
  const RTL_OSVERSIONINFOW* base = nullptr;
  RTL_OSVERSIONINFOW v{}; v.dwOSVersionInfoSize = sizeof v;
  if (const HMODULE ntdll = GetModuleHandleA("ntdll.dll"))
    if (reinterpret_cast<RtlGetVersion_t>(GetProcAddress(ntdll, "RtlGetVersion"))(&v) == 0)
      return std::to_string(v.dwMajorVersion) + "." + std::to_string(v.dwMinorVersion) + "." + std::to_string(v.dwBuildNumber);
  return "";
#else
  struct utsname u; uname(&u); return u.release;
#endif
}
// zinc:device-info (ZN-761): what the machine is, as expo-device names it, one JSON record for device('device'). Each field comes from the
// platform's own source (iOS: the identifier of sysctl hw.machine and UIDevice's idiom; Android: Build's properties, the smallest width and
// the UI mode; macOS: hw.model; Linux: the device tree or the DMI tables); what a platform cannot know stays "" (0 for the memory).
// A phone forced on a desktop (ZINC_PLATFORM) is a simulated one: isDevice false, its model from ZINC_DEVICE_MODEL (an Apple identifier such
// as iPad6,7, or an Android model name) and its kind from ZINC_DEVICE_TYPE (phone, tablet, tv) or the identifier.
extern "C" const char* (*zn_mobile_command)(const char* q, const char* a);   // hal_dispatch.cpp, set by the phone's glue
namespace {
std::string jsonText(const std::string& s) {
  std::string o = "\"";
  for (unsigned char c : s) {
    if (c == '"' || c == '\\') { o += '\\'; o += static_cast<char>(c); }
    else if (c >= 0x20) o += static_cast<char>(c);
  }
  return o + "\"";
}
[[maybe_unused]] std::string fileText(const char* path) {   // the first line of a /sys or /etc file (the device tree's strings end with a NUL)
  std::ifstream f(path);
  std::string s;
  std::getline(f, s);
  return s.substr(0, s.find('\0'));
}
std::string appleModelName(const std::string& id) {
  static const struct { const char* ids; const char* name; } kModels[] = {
#include "apple_models.inc"
  };
  if (id.empty()) return "";
  for (const auto& m : kModels) {
    const std::string ids = std::string(" ") + m.ids + " ";
    if (ids.find(" " + id + " ") != std::string::npos) return m.name;
  }
  return "";
}
std::string appleKind(const std::string& id) {   // by the identifier's family, where no idiom is at hand
  return id.rfind("iPad", 0) == 0 ? "tablet" : id.rfind("iPhone", 0) == 0 || id.rfind("iPod", 0) == 0 ? "phone" : id.rfind("AppleTV", 0) == 0 ? "tv" : "unknown";
}
#ifdef __APPLE__
[[maybe_unused]] std::string sysctlText(const char* name) {   // unused in the iOS simulator
  char b[256] = "";
  size_t n = sizeof b;
  return sysctlbyname(name, b, &n, nullptr, 0) == 0 ? std::string(b) : std::string();
}
#endif
#ifdef __ANDROID__
std::string prop(const char* k) { char b[PROP_VALUE_MAX] = ""; __system_property_get(k, b); return b; }
#endif
}  // namespace

std::string deviceRecord() {
  std::string type = "unknown", brand, manufacturer, modelName, modelId, designName, osName, osVer = osVersion(), osBuildId, cpus;
  double memory = 0;
  bool isDevice = true;
  struct utsname u; uname(&u);
  const std::string run = zn::runPlatform();
  if (run != zn::builtPlatform()) {   // a phone simulated on the desktop
    isDevice = false;
    const char* m = getenv("ZINC_DEVICE_MODEL");
    const char* t = getenv("ZINC_DEVICE_TYPE");
    const std::string model = m ? m : "";
    if (run == "ios") {
      brand = manufacturer = "Apple";
      modelId = model;
      modelName = appleModelName(model);
      type = model.empty() ? "phone" : appleKind(model);
    } else if (run == "android") {
      osVer = "15";   // Android 15, the release of API level 35 (osVersion() of a simulated Android)
      modelName = model;
      type = "phone";
    }
    if (t && (!strcmp(t, "phone") || !strcmp(t, "tablet") || !strcmp(t, "tv"))) type = t;
    osName = run == "ios" ? (type == "tablet" ? "iPadOS" : "iOS") : run == "android" ? "Android" : run;
  } else {
#if defined(__APPLE__) && TARGET_OS_IPHONE
    brand = manufacturer = "Apple";
#if TARGET_OS_SIMULATOR   // the simulated model's; sysctl answers the Mac's there
    isDevice = false;
    if (const char* v = getenv("SIMULATOR_MODEL_IDENTIFIER")) modelId = v;
    if (const char* v = getenv("SIMULATOR_RUNTIME_BUILD_VERSION")) osBuildId = v;
#else
    modelId = sysctlText("hw.machine");
    osBuildId = sysctlText("kern.osversion");
    std::uint64_t mem = 0; size_t len = sizeof mem;
    if (sysctlbyname("hw.memsize", &mem, &len, nullptr, 0) == 0) memory = static_cast<double>(mem);
#endif
    modelName = appleModelName(modelId);
    const char* idiom = zn_mobile_command ? zn_mobile_command("idiom", "") : nullptr;   // UIDevice.userInterfaceIdiom (ios_glue.mm)
    type = idiom && *idiom && strcmp(idiom, "0") ? idiom : appleKind(modelId);
    osName = type == "tablet" ? "iPadOS" : "iOS";
    cpus = "arm64";
#elif defined(__APPLE__)
    brand = manufacturer = "Apple";
    modelId = sysctlText("hw.model");   // MacBookPro16,1; an Apple silicon Mac says Mac14,2
    static const char* const kFamilies[][2] = {{"MacBookPro", "MacBook Pro"}, {"MacBookAir", "MacBook Air"}, {"MacBook", "MacBook"}, {"iMacPro", "iMac Pro"},
                                               {"iMac", "iMac"}, {"Macmini", "Mac mini"}, {"MacPro", "Mac Pro"}};
    for (const auto& f : kFamilies) if (modelId.rfind(f[0], 0) == 0) { modelName = f[1]; break; }   // ponytail: the family; Apple silicon's names when a program needs them
    type = "desktop";
    osName = "macOS";
    osBuildId = sysctlText("kern.osversion");
    std::uint64_t mem = 0; size_t len = sizeof mem;
    if (sysctlbyname("hw.memsize", &mem, &len, nullptr, 0) == 0) memory = static_cast<double>(mem);
    int arm = 0; len = sizeof arm;
    cpus = sysctlbyname("hw.optional.arm64", &arm, &len, nullptr, 0) == 0 && arm ? "arm64" : u.machine;   // the machine's, also under Rosetta
#elif defined(__ANDROID__)
    brand = prop("ro.product.brand");
    manufacturer = prop("ro.product.manufacturer");
    modelName = prop("ro.product.model");
    designName = prop("ro.product.device");
    osName = "Android";
    osVer = prop("ro.build.version.release");
    osBuildId = prop("ro.build.id");
    cpus = prop("ro.product.cpu.abilist");
    const std::string hw = prop("ro.hardware");
    isDevice = prop("ro.kernel.qemu") != "1" && prop("ro.boot.qemu") != "1" && hw != "goldfish" && hw != "ranchu";
    // the activity's answer: tv (UI_MODE_TYPE_TELEVISION), tablet (smallest width of 600 dp and more), phone (ZincActivity.idiom)
    const char* idiom = zn_mobile_command ? zn_mobile_command("idiom", "") : nullptr;
    if (idiom && (!strcmp(idiom, "phone") || !strcmp(idiom, "tablet") || !strcmp(idiom, "tv"))) type = idiom;
    memory = static_cast<double>(sysconf(_SC_PHYS_PAGES)) * static_cast<double>(sysconf(_SC_PAGESIZE));
#else
    modelName = fileText("/sys/firmware/devicetree/base/model");   // a board: Raspberry Pi 3 Model B Plus Rev 1.3
    if (!modelName.empty()) modelId = fileText("/sys/firmware/devicetree/base/compatible");   // its first entry: raspberrypi,3-model-b-plus
    else {
      modelName = fileText("/sys/class/dmi/id/product_name");   // a PC
      manufacturer = fileText("/sys/class/dmi/id/sys_vendor");
      const std::string chassis = fileText("/sys/class/dmi/id/chassis_type");   // SMBIOS: 30 tablet, 32 detachable
      if (!modelName.empty() || !chassis.empty()) type = chassis == "30" || chassis == "32" ? "tablet" : "desktop";
    }
    std::ifstream rel("/etc/os-release");
    for (std::string l; std::getline(rel, l);) {
      auto value = [&](const char* k) { const std::string v = l.substr(std::strlen(k)); return v.size() >= 2 && v.front() == '"' ? v.substr(1, v.size() - 2) : v; };
      if (l.rfind("NAME=", 0) == 0) osName = value("NAME=");
      else if (l.rfind("VERSION_ID=", 0) == 0) osVer = value("VERSION_ID=");
    }
    if (osName.empty()) osName = u.sysname;
    osBuildId = u.release;   // the kernel's
    cpus = u.machine;
#ifdef _WIN32
    MEMORYSTATUSEX ms{}; ms.dwLength = sizeof ms;
    if (GlobalMemoryStatusEx(&ms)) memory = static_cast<double>(ms.ullTotalPhys);
#else
    memory = static_cast<double>(sysconf(_SC_PHYS_PAGES)) * static_cast<double>(sysconf(_SC_PAGESIZE));
#endif
#endif
  }
  std::string arch = "[";
  for (size_t at = 0; at < cpus.size();) {
    size_t end = cpus.find(',', at);
    if (end == std::string::npos) end = cpus.size();
    if (end > at) arch += (arch.size() > 1 ? "," : "") + jsonText(cpus.substr(at, end - at));
    at = end + 1;
  }
  char mem[32];
  std::snprintf(mem, sizeof mem, "%.0f", memory);
  // model and os: navigator.deviceInfo's two fields of before (lib/std/web.ts)
  const std::string model = !modelName.empty() ? modelName : !modelId.empty() ? modelId : std::string(u.machine);
  return "{\"type\":" + jsonText(type) + ",\"brand\":" + jsonText(brand) + ",\"manufacturer\":" + jsonText(manufacturer) + ",\"modelName\":" + jsonText(modelName) +
         ",\"modelId\":" + jsonText(modelId) + ",\"designName\":" + jsonText(designName) + ",\"osName\":" + jsonText(osName) + ",\"osVersion\":" + jsonText(osVer) +
         ",\"osBuildId\":" + jsonText(osBuildId) + ",\"totalMemory\":" + mem + ",\"cpuArchitectures\":" + arch + "],\"isDevice\":" + (isDevice ? "true" : "false") +
         ",\"model\":" + jsonText(model) + ",\"os\":" + jsonText(osName + (osVer.empty() ? "" : " " + osVer)) + "}";
}
// What a program asks of a phone's system UI: haptics (zinc:ui/haptics), the status bar (StatusBar), the system's back (BackHandler.exitApp),
// the text input connection (zinc:ui's fields, ZN-626), steady clocks (zinc:webos setPerformance: Android's sustained performance mode, "0"
// where the device has none, ZN-750), the screen reader's tree (zinc:ui's changes, ZN-630), the screen's orientation (screen.orientation.lock, a script's rotate on a phone). The Android activity (src/app/android, through JNI) or the iOS glue (src/app/ios_glue.mm) does it; a
// desktop does nothing and answers "0". ZINC_DEVICE_LOG=file appends each call as `query arg` (the tests read it).
extern "C" void zn_hal_set_text_traits(const char* t);
bool mobileCommand(const std::string& q, const std::string& a, std::string& out) {
  if (q != "haptic" && q != "statusbar" && q != "exitapp" && q != "textinput" && q != "keyboard-traits" && q != "performance" && q != "a11y" && q != "orientation") return false;
  if (const char* log = getenv("ZINC_DEVICE_LOG"); log && *log) if (FILE* f = fopen(log, "a")) { fprintf(f, "%s %s\n", q.c_str(), a.c_str()); fclose(f); }
  if (q == "keyboard-traits") zn_hal_set_text_traits(a.c_str());   // the window HAL starts the text input with them (hal_dispatch.cpp)
  const char* r = zn_mobile_command ? zn_mobile_command(q.c_str(), a.c_str()) : nullptr;
  out = r ? r : "0";
  return true;
}
// The accent colour the user picked in System Settings (lib/std/platform, ZN-748): AppleAccentColor of the global domain, -1 graphite, 0 red ... 6 pink,
// absent = blue, as Apple's system colours (light) RRGGBB; "" where there is none (iOS: the app's own tint; Android's dynamic colour: the activity's).
// CoreFoundation is opened, not linked, as src/tc/bundle.cpp does (ZN-592.01).
std::string systemAccent() {
#if defined(__APPLE__) && !TARGET_OS_IPHONE && !defined(ZN_APP_LIBRARY)   // an app library opens nothing (D120): no system accent there
  if (zn::runPlatform() != std::string("macos")) return "";   // a phone run on the Mac (ZINC_PLATFORM)
  void* cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL);
  if (!cf) return "";
  using Str = const void*;
  auto make = reinterpret_cast<Str (*)(const void*, const char*, uint32_t)>(dlsym(cf, "CFStringCreateWithCString"));
  auto copy = reinterpret_cast<const void* (*)(Str, Str)>(dlsym(cf, "CFPreferencesCopyAppValue"));
  auto number = reinterpret_cast<unsigned char (*)(const void*, long, void*)>(dlsym(cf, "CFNumberGetValue"));
  auto typeOf = reinterpret_cast<unsigned long (*)(const void*)>(dlsym(cf, "CFGetTypeID"));
  auto numberType = reinterpret_cast<unsigned long (*)()>(dlsym(cf, "CFNumberGetTypeID"));
  auto release = reinterpret_cast<void (*)(const void*)>(dlsym(cf, "CFRelease"));
  auto anyApp = reinterpret_cast<const Str*>(dlsym(cf, "kCFPreferencesAnyApplication"));
  if (!make || !copy || !number || !typeOf || !numberType || !release || !anyApp) return "";
  Str key = make(nullptr, "AppleAccentColor", 0x08000100);   // kCFStringEncodingUTF8
  const void* v = key ? copy(key, *anyApp) : nullptr;
  int k = 4;   // blue
  if (v && typeOf(v) == numberType()) number(v, 9, &k);   // kCFNumberIntType
  if (v) release(v);
  if (key) release(key);
  static const char* const kColors[] = {"8e8e93", "ff3b30", "ff9500", "ffcc00", "34c759", "007aff", "af52de", "ff2d55"};   // graphite, red .. pink
  return k >= -1 && k <= 6 ? kColors[k + 1] : "007aff";
#else
  return "";
#endif
}
std::string desktopDevice(const std::string& q, const std::string& a) {
  if (q == "language") return systemLocale();
  if (q == "accent") return systemAccent();
  if (q == "osversion") return osVersion();
  if (std::string out; mobileCommand(q, a, out)) return out;
  if (q == "visibility") return "visible";   // ponytail: a desktop window is taken as visible; its minimised state when a program needs it
#ifdef _WIN32
  if (q == "device") { return "{\"model\":\"" + std::string(getenv("COMPUTERNAME") ? getenv("COMPUTERNAME") : "") + "\",\"os\":\"Windows\"}"; }   // later: the motherboard's SMBORG2 (embedded service, ZN-752)
  if (q == "network") {
    bool up = false;
    ULONG size = 4096;
    std::vector<unsigned char> buf(size);
    if (GetAdaptersAddresses(AF_INET, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, nullptr, reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data()), &size) == ERROR_BUFFER_OVERFLOW) {
      buf.resize(size); size = static_cast<ULONG>(buf.size());
    }
    if (GetAdaptersAddresses(AF_INET, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, nullptr, reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data()), &size) == NO_ERROR)
      for (IP_ADAPTER_ADDRESSES* a = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data()); a; a = a->Next)
        if (a->OperStatus == IfOperStatusUp && a->IfType != IF_TYPE_SOFTWARE_LOOPBACK) up = true;
    return std::string("{\"online\":") + (up ? "true" : "false") + ",\"type\":\"" + (up ? "unknown" : "none") + "\"}";
  }
#else
  if (q == "device") return deviceRecord();
  if (q == "network") {
    bool up = false;
    struct ifaddrs* all = nullptr;
    if (getifaddrs(&all) == 0) {
      for (struct ifaddrs* a = all; a; a = a->ifa_next)
        if (a->ifa_addr && a->ifa_addr->sa_family == AF_INET && (a->ifa_flags & IFF_UP) && (a->ifa_flags & IFF_RUNNING) && !(a->ifa_flags & IFF_LOOPBACK)) up = true;
      freeifaddrs(all);
    }
    return std::string("{\"online\":") + (up ? "true" : "false") + ",\"type\":\"" + (up ? "unknown" : "none") + "\"}";
  }
#endif  // _WIN32: device and network above
#ifdef __ANDROID__   // SDL3 is linked in the app (src/app/shell_sdl.cpp): the screen kept on is its screen saver off (FLAG_KEEP_SCREEN_ON)
  if (q == "wakelock") return (a == "1" ? SDL_DisableScreenSaver() : SDL_EnableScreenSaver()) ? "1" : "0";
  // the screen dark, or back at the system's brightness (zinc:webos setBacklight): the window's own brightness, set on the UI thread
  if (q == "backlight") return SDL_SendAndroidMessage(ZN_APP_ANDROID_BRIGHTNESS, a == "1" ? -1 : 0) ? "1" : "0";
  if (q == "battery") {   // Android's sticky ACTION_BATTERY_CHANGED, read by the activity (ZincActivity.battery); SDL's own reading says "unknown" on the Nexus 7
    const char* r = zn_mobile_command ? zn_mobile_command("battery", "") : nullptr;
    return r && std::strcmp(r, "0") != 0 ? r : "";   // "0": no activity yet
  }
#endif
#if defined(__APPLE__) && !defined(ZN_APP_LIBRARY)   // an app library loads nothing at run time (ZN-620): no wake lock nor battery from IOKit
  if (q == "wakelock") {   // the display kept awake (IOPMAssertion), as navigator.wakeLock.request('screen') on a Mac
    static void* io = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_LAZY | RTLD_LOCAL);
    static void* cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL);
    static uint32_t held = 0;   // the assertion's id, 0 none
    using MkStr = const void* (*)(const void*, const char*, unsigned);
    using Create = int (*)(const void*, uint32_t, const void*, uint32_t*);
    using Release = int (*)(uint32_t);
    auto mk = io && cf ? (MkStr)dlsym(cf, "CFStringCreateWithCString") : nullptr;
    auto create = io ? (Create)dlsym(io, "IOPMAssertionCreateWithName") : nullptr;
    auto release = io ? (Release)dlsym(io, "IOPMAssertionRelease") : nullptr;
    if (!mk || !create || !release) return "0";
    if (a == "1" && !held) {
      const void* type = mk(nullptr, "PreventUserIdleDisplaySleep", 0x08000100u), *why = mk(nullptr, "Zinc: navigator.wakeLock", 0x08000100u);
      if (create(type, 255 /* kIOPMAssertionLevelOn */, why, &held) != 0) held = 0;
    } else if (a != "1" && held) { release(held); held = 0; }
    return a == "1" ? (held ? "1" : "0") : "1";
  }
  if (q == "battery") {
    static void* io = dlopen("/System/Library/Frameworks/IOKit.framework/IOKit", RTLD_LAZY | RTLD_LOCAL);
    static void* cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL);
    if (!io || !cf) return "";
    using Info = const void* (*)();
    using List = const void* (*)(const void*);
    using Desc = const void* (*)(const void*, const void*);
    using Count = long (*)(const void*);
    using At = const void* (*)(const void*, long);
    using Get = const void* (*)(const void*, const void*);
    using MkStr = const void* (*)(const void*, const char*, unsigned);
    using NumVal = unsigned char (*)(const void*, long, void*);
    using BoolVal = unsigned char (*)(const void*);
    using StrVal = unsigned char (*)(const void*, char*, long, unsigned);
    using Rel = void (*)(const void*);
    auto info = (Info)dlsym(io, "IOPSCopyPowerSourcesInfo"); auto list = (List)dlsym(io, "IOPSCopyPowerSourcesList"); auto desc = (Desc)dlsym(io, "IOPSGetPowerSourceDescription");
    auto count = (Count)dlsym(cf, "CFArrayGetCount"); auto at = (At)dlsym(cf, "CFArrayGetValueAtIndex"); auto get = (Get)dlsym(cf, "CFDictionaryGetValue");
    auto mk = (MkStr)dlsym(cf, "CFStringCreateWithCString"); auto num = (NumVal)dlsym(cf, "CFNumberGetValue"); auto bv = (BoolVal)dlsym(cf, "CFBooleanGetValue");
    auto sv = (StrVal)dlsym(cf, "CFStringGetCString"); auto rel = (Rel)dlsym(cf, "CFRelease");
    if (!info || !list || !desc || !count || !at || !get || !mk || !num || !bv || !sv || !rel) return "";
    const void* blob = info();
    const void* arr = blob ? list(blob) : nullptr;
    std::string out;
    if (arr && count(arr) > 0) {
      const void* d = desc(blob, at(arr, 0));
      auto key = [&](const char* k) { const void* s = mk(nullptr, k, 0x08000100u); const void* v = d ? get(d, s) : nullptr; rel(s); return v; };
      auto inum = [&](const char* k) { int v = -1; if (const void* n = key(k)) num(n, 9 /* kCFNumberIntType */, &v); return v; };
      const int cur = inum("Current Capacity"), max = inum("Max Capacity"), empty = inum("Time to Empty"), full = inum("Time to Full Charge");
      const void* ch = key("Is Charging");
      char state[64] = "";
      if (const void* st = key("Power Source State")) sv(st, state, sizeof state, 0x08000100u);
      const bool ac = std::strcmp(state, "AC Power") == 0;
      if (cur >= 0 && max > 0) {
        char b[256];
        std::snprintf(b, sizeof b, "{\"level\":%.3f,\"charging\":%s,\"source\":\"%s\",\"chargingTime\":%d,\"dischargingTime\":%d}",
                      cur / (double)max, ac || (ch && bv(ch)) ? "true" : "false", ac ? "ac" : "none", full > 0 ? full * 60 : (ac && cur >= max ? 0 : -1), empty > 0 && !ac ? empty * 60 : -1);
        out = b;
      }
    }
    if (arr) rel(arr);
    if (blob) rel(blob);
    return out;
  }
#endif
  return "";
}
std::string systemLocale() {
  for (const char* k : {"LC_ALL", "LC_MESSAGES", "LANG"}) {
    const char* v = getenv(k);
    if (v && *v && strcmp(v, "C") != 0 && strcmp(v, "POSIX") != 0 && strncmp(v, "C.", 2) != 0) return bcp47(v);
  }
#if defined(__APPLE__) && !defined(ZN_APP_LIBRARY)
  if (void* cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_LAZY | RTLD_LOCAL)) {
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
    if (langs && count && at && str && rel) {
      const void* a = langs();
      char b[64] = {0};
      const bool ok = a && count(a) > 0 && str(at(a, 0), b, sizeof b, 0x08000100u /* kCFStringEncodingUTF8 */);
      if (a) rel(a);
      if (ok && b[0]) return bcp47(b);
    }
  }
#endif
  return "en-US";
}
void ret(HostArg* r, const std::string& s) { gOut = s; r->p = gOut.data(); r->n = static_cast<std::uint32_t>(gOut.size()); }
std::string str(const HostArg& a) { return std::string(static_cast<const char*>(a.p), a.n); }

const char* codeOf(int e) {
  switch (e) {
    case ENOENT: return "ENOENT"; case EACCES: return "EACCES"; case EEXIST: return "EEXIST"; case ENOTDIR: return "ENOTDIR"; case ENOTEMPTY: return "ENOTEMPTY";
    case EISDIR: return "EISDIR"; case EPERM: return "EPERM"; case EINVAL: return "EINVAL"; case EBUSY: return "EBUSY"; case EXDEV: return "EXDEV"; case EMFILE: return "EMFILE";
    default: return "EIO";
  }
}
void fail(const char* op, const std::string& path, int e = errno) { gFailed = true; gError = std::string(codeOf(e)) + ": " + op + " " + path; }

// The fs scope (ZN-239, zinc.json "scopes": {"fs": "user-picked"}): once on, only files the user picked in a dialog (and what is under a picked directory) can be read, written or listed.
bool gScopeOn = false;
std::vector<std::string> gGrants;
std::string absPath(const std::string& p) { char b[4096]; if (realpath(p.c_str(), b)) return b; char cwd[4096]; return (p.rfind("/", 0) == 0 || !getcwd(cwd, sizeof cwd)) ? p : std::string(cwd) + "/" + p; }
bool scopeAllows(const std::string& path) {
  if (!gScopeOn) return true;
  std::string a = absPath(path);
  for (const std::string& g : gGrants) if (a == g || (a.size() > g.size() && a.compare(0, g.size(), g) == 0 && a[g.size()] == '/')) return true;
  return false;
}
// zinc.json "permissions" (ZN-322): fs:read / fs:write with their roots; a refusal is an EACCES error naming the permission.
std::string assetsDir();
bool denyByPermission(const char* feature, const std::string& path) {
  if (gScopeOn) return false;   // "scopes": {"fs": "user-picked"} is stricter than the manifest: it decides (denyByScope)
  const std::string a = assetsDir();
  // reading the app's own assets needs no permission (a ".." leaves them: checked as any path); writing there does (ZN-646: a program allowed to
  // write its assets directory could otherwise place a link to any file and read it through the exemption)
  if (!strcmp(feature, "fs:read") && !a.empty() && path.size() > a.size() && path.compare(0, a.size(), a) == 0 && path[a.size()] == '/' && (path + "/").find("/../", a.size()) == std::string::npos) return false;
  if (!gGrants.empty()) { const std::string ap = absPath(path); for (const std::string& g : gGrants) if (ap == g || (ap.size() > g.size() && ap.compare(0, g.size(), g) == 0 && ap[g.size()] == '/')) return false; }   // picked by the user in a dialog: their consent
  const std::string deny = zn::host::perm::check(feature, path);
  if (deny.empty()) return false;
  gFailed = true; gError = deny;
  return true;
}
bool denyByScope(const char* op, const std::string& path) {
  if (scopeAllows(path)) return false;
  gFailed = true; gError = std::string("EACCES: ") + op + " " + path + " (outside the fs scope: only files picked in a dialog)";
  return true;
}

// The I/O of readAll and writeAll, without the checks or the shared error: 0, or the errno (the async rows run them on libuv's thread pool).
// One fread/fwrite of the whole buffer: std::fstream went through 4 KiB writes and a byte iterator on read, 40 ms for 3 MB on macOS.
template <class Buf> int readFile(const std::string& path, Buf& out) {
  struct stat st;
  if (stat(path.c_str(), &st) == 0 && S_ISDIR(st.st_mode)) return EISDIR;
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return errno;
  out.clear();
  if (S_ISREG(st.st_mode) && st.st_size > 0) out.reserve(static_cast<size_t>(st.st_size));
  char buf[65536];
  for (size_t got; (got = std::fread(buf, 1, sizeof buf, f)) > 0;) out.insert(out.end(), buf, buf + got);
  const int e = std::ferror(f) ? (errno ? errno : EIO) : 0;
  std::fclose(f);
  return e;
}
int writeFile(const std::string& path, const char* p, size_t n, bool append) {
  std::FILE* f = std::fopen(path.c_str(), append ? "ab" : "wb");
  if (!f) return errno;
  const bool ok = std::fwrite(p, 1, n, f) == n;
  int e = ok ? 0 : (errno ? errno : EIO);
  if (std::fclose(f) != 0 && !e) e = errno ? errno : EIO;
  return e;
}

bool readAll(const std::string& path, std::vector<unsigned char>& out, const char* op) {
  if (denyByPermission("fs:read", path) || denyByScope(op, path)) return false;
  if (int e = readFile(path, out)) { fail(op, path, e); return false; }
  return true;
}

bool writeAll(const std::string& path, const char* p, size_t n, bool append, const char* op) {
  if (denyByPermission("fs:write", path) || denyByScope(op, path)) return false;
  if (int e = writeFile(path, p, n, append)) { fail(op, path, e); return false; }
  return true;
}

// fs.writeTextAsync / readTextAsync: the checks here, the I/O on libuv's thread pool, and the loop thread queues the event that settles the
// promise (kind 60 written, 61 read: the text as the payload, 62 failed: the error as the data). A pending job keeps the program alive.
struct FsJob { uv_work_t work; int id; bool write; std::string path, data; int err = 0; };
int gFsJobId = 0;
void fsJobWork(uv_work_t* w) {
  auto* j = static_cast<FsJob*>(w->data);
  if (j->write) { j->err = writeFile(j->path, j->data.data(), j->data.size(), false); std::string().swap(j->data); }
  else j->err = readFile(j->path, j->data);
}
void fsJobAfter(uv_work_t* w, int) {
  auto* j = static_cast<FsJob*>(w->data);
  zn::loop::addActive(-1);
  if (j->err) zn::loop::pushEvent(j->id, 62, std::string(codeOf(j->err)) + ": " + (j->write ? "open " : "cannot open ") + j->path);
  else zn::loop::pushEvent(j->id, j->write ? 60 : 61, std::string(), std::move(j->data));
  delete j;
}
int fsJob(const std::string& path, const char* p, size_t n, bool write) {
  const char* op = write ? "open" : "cannot open";
  if (denyByPermission(write ? "fs:write" : "fs:read", path) || denyByScope(op, path)) return 0;
  auto* j = new FsJob{};
  j->id = ++gFsJobId; j->write = write; j->path = path;
  if (write) j->data.assign(p, n);   // the program's string may go before the thread writes it
  j->work.data = j;
  zn::loop::addActive(1);
  if (uv_queue_work(static_cast<uv_loop_t*>(zn::loop::uvLoop()), &j->work, fsJobWork, fsJobAfter) != 0) {
    zn::loop::addActive(-1);
    delete j;
    fail(op, path, EIO);
    return 0;
  }
  return j->id;
}

bool removeTree(const std::string& path) {
  struct stat st;
  if (lstat(path.c_str(), &st) != 0) return false;
  if (S_ISDIR(st.st_mode)) {
    if (DIR* d = opendir(path.c_str())) {
      while (dirent* e = readdir(d)) { std::string n = e->d_name; if (n != "." && n != "..") removeTree(path + "/" + n); }
      closedir(d);
    }
    return rmdir(path.c_str()) == 0;
  }
  return unlink(path.c_str()) == 0;
}

bool mkdirs(const std::string& path) {
  if (path.empty()) return true;
  struct stat st;
  if (stat(path.c_str(), &st) == 0) return S_ISDIR(st.st_mode);
  size_t slash = path.find_last_of('/');
  if (slash != std::string::npos && slash > 0 && !mkdirs(path.substr(0, slash))) return false;
  return mkdir(path.c_str(), 0777) == 0 || errno == EEXIST;
}

std::string tmpdirPath() {
#ifdef _WIN32
  std::string t = getenv("TMP") ? getenv("TMP") : getenv("TEMP") ? getenv("TEMP") : getenv("LOCALAPPDATA") ? getenv("LOCALAPPDATA") : "C:\\Windows\\Temp";
  while (t.size() > 1 && (t.back() == '/' || t.back() == '\\')) t.pop_back();
  return t;
#else
  std::string t = getenv("TMPDIR") ? getenv("TMPDIR") : "/tmp";
  while (t.size() > 1 && t.back() == '/') t.pop_back();
  return t;
#endif
}

// storage: a file of `key TAB value` lines (backslash, tab and newline escaped), read and rewritten whole: the stores are small
std::string zincHomeDir() {
  const char* h = getenv("ZINC_HOME");
#ifdef _WIN32
  const char* userHome = h ? h : getenv("USERPROFILE");
  return (userHome ? std::string(userHome) : std::string(".")) + (h ? "" : "/.zinc");
#else
  return h ? std::string(h) : std::string(getenv("HOME") ? getenv("HOME") : ".") + "/.zinc";
#endif
}
// The app's own folder, as an Android app's data and its AsyncStorage: <zinc home>/apps/<name>/ (ZINC_APP_NAME, the zinc.json name zinc run
// sets), which holds its zinc:storage (storage.kv) and its files (zinc:sys dataDir()). Erasing it resets the app, nothing else.
// ZINC_APP_DATA replaces it; '' for a program without a name of its own, which keeps the shared <zinc home>/storage.kv.
std::string appDataDir() {
  if (const char* d = getenv("ZINC_APP_DATA"); d && *d) return d;
  const char* n = getenv("ZINC_APP_NAME");
  if (!n || !*n || n[0] == '.' || strchr(n, '/') || strchr(n, '\\')) return "";
  return zincHomeDir() + "/apps/" + n;
}
std::string legacyStoragePath() { return zincHomeDir() + "/storage.kv"; }
std::string storagePath() {
  if (const char* p = getenv("ZINC_STORAGE")) return p;
  const std::string d = appDataDir();
  return d.empty() ? legacyStoragePath() : d + "/storage.kv";
}
std::string esc(const std::string& s) { std::string r; for (char c : s) { if (c == '\\') r += "\\\\"; else if (c == '\t') r += "\\t"; else if (c == '\n') r += "\\n"; else r += c; } return r; }
std::string unesc(const std::string& s) { std::string r; for (size_t i = 0; i < s.size(); ++i) { if (s[i] == '\\' && i + 1 < s.size()) { char c = s[++i]; r += c == 't' ? '\t' : c == 'n' ? '\n' : c; } else r += s[i]; } return r; }
std::map<std::string, std::string> storageRead(const std::string& path) {
  std::map<std::string, std::string> m;
  std::ifstream in(path);
  std::string line;
  while (std::getline(in, line)) { size_t t = line.find('\t'); if (t != std::string::npos) m[unesc(line.substr(0, t))] = unesc(line.substr(t + 1)); }
  return m;
}
void storageSave(const std::map<std::string, std::string>& m);
void storageWrite(const std::string& p, const std::map<std::string, std::string>& m);
std::map<std::string, std::string> storageLoad() {
  const std::string p = storagePath();
  std::map<std::string, std::string> m = storageRead(p);
  // once, when the app's own store does not exist yet: its keys ("<name>.…", as apps named them) move out of the shared store of older engines
  static bool migrated = false;
  if (!migrated && !getenv("ZINC_STORAGE") && !getenv("ZINC_APP_DATA") && p != legacyStoragePath()) {
    migrated = true;
    struct stat st;
    if (stat(p.c_str(), &st) != 0) {
      std::map<std::string, std::string> shared = storageRead(legacyStoragePath());
      const std::string prefix = std::string(getenv("ZINC_APP_NAME")) + ".";
      bool moved = false;
      for (auto it = shared.begin(); it != shared.end();) {
        if (it->first.compare(0, prefix.size(), prefix) == 0) { m[it->first] = it->second; it = shared.erase(it); moved = true; } else ++it;
      }
      if (moved) { storageWrite(p, m); storageWrite(legacyStoragePath(), shared); }
    }
  }
  return m;
}
void storageSave(const std::map<std::string, std::string>& m) { storageWrite(storagePath(), m); }
void storageWrite(const std::string& p, const std::map<std::string, std::string>& m) {
  size_t slash = p.find_last_of('/');
  if (slash != std::string::npos) mkdirs(p.substr(0, slash));
  std::ofstream out(p, std::ios::trunc);
  for (auto& [k, v] : m) out << esc(k) << '\t' << esc(v) << '\n';
}

// The directory zinc:assets reads. ZINC_ASSETS decides (zinc run sets it to the project's assets; an override while developing). A program built ahead
// of time has no zinc run to set it (ZN-314): runtime/include/zrt_assets_dir.h finds it beside the executable, in its .app's Resources (ZN-645) or
// one level above it; else the assets/ of the directory it was started in (a build run from its project), which a program that enforces its
// permissions does not take: that directory is the user's, not the app's.
std::string assetsDir() {
  if (const char* d = getenv("ZINC_ASSETS")) return d;
  static const std::string found = zrt_program_assets_dir(!zn::host::perm::enforced());
  return found;
}
void listAssets(const std::string& dir, const std::string& pre, std::vector<std::string>& out) {
  DIR* d = opendir(dir.c_str());
  if (!d) return;
  std::vector<std::string> names;
  while (dirent* e = readdir(d)) { std::string n = e->d_name; if (n[0] != '.') names.push_back(n); }
  closedir(d);
  std::sort(names.begin(), names.end());
  for (auto& n : names) {
    struct stat st;
    if (stat((dir + "/" + n).c_str(), &st) != 0) continue;
    if (S_ISDIR(st.st_mode)) listAssets(dir + "/" + n, pre + n + "/", out); else out.push_back(pre + n);
  }
}

// The offset of a time zone from UTC in minutes, positive west of it like Date.getTimezoneOffset, at a UTC time in milliseconds, and the zone's abbreviation. The zone is the
// IANA name `zone`, or the host's (TZ, else the system's); a deterministic run (ZINC_DETERMINISTIC) is UTC unless TZ is set.
double tzOffsetMinutes(double ms, const char* zone, std::string* abbr) {
  if (!zone && std::getenv("ZINC_DETERMINISTIC") && !std::getenv("TZ")) { if (abbr) *abbr = "UTC"; return 0; }
#ifdef _WIN32
  // The system's zone only (TZ and the given IANA name would need a Windows tz database mapping, later): the offset
  // at that instant is the difference between the local time and its UTC source (SystemTimeToTzSpecificLocalTime
  // honours DST of the zone's rules), negative east of the zone.
  if (abbr) *abbr = "UTC";
  _tzset();
  if (abbr) *abbr = tzname[0] && *tzname[0] ? tzname[0] : "UTC";
  // A tz like the Windows current one: the offset at the instant, not the whatever-bias
  const std::time_t t = static_cast<std::time_t>(std::floor(ms / 1000.0));
  SYSTEMTIME st{}, lt{};
  ULARGE_INTEGER u = {static_cast<DWORD>(t), 0};   // seconds since the epoch: each one is a 10-million usec count in FILETIME
  u.QuadPart = static_cast<unsigned long long>(t) * 10000000ull + 116444736000000000ull;
  FILETIME ft{u.LowPart, u.HighPart};
  if (!FileTimeToSystemTime(&ft, &st)) return 0;
  if (!SystemTimeToTzSpecificLocalTime(nullptr, &st, &lt)) return 0;
  FILETIME flt;
  if (!SystemTimeToFileTime(&lt, &flt)) return 0;
  ULARGE_INTEGER l = {flt.dwLowDateTime, flt.dwHighDateTime};
  const double diffSec = (static_cast<double>(l.QuadPart) - static_cast<double>(u.QuadPart)) / 10000000.0;
  return -std::lround(diffSec / 60.0);   // positive west (UTC−x gives +x): the local time is behind there
#else
  std::string saved;
  bool had = false;
  if (zone) { if (const char* old = std::getenv("TZ")) { saved = old; had = true; } setenv("TZ", zone, 1); tzset(); }
  std::time_t t = static_cast<std::time_t>(std::floor(ms / 1000.0));
  struct tm tmv;
  double off = 0;
  if (localtime_r(&t, &tmv)) { off = -static_cast<double>(tmv.tm_gmtoff) / 60.0; if (abbr) *abbr = tmv.tm_zone ? tmv.tm_zone : "UTC"; }
  else if (abbr) *abbr = "UTC";
  if (zone) { if (had) setenv("TZ", saved.c_str(), 1); else unsetenv("TZ"); tzset(); }
  return off == 0 ? 0 : off;
#endif
}

// An array of bytes (one slot each) as a string, unchanged.
std::string rawBytes(const HostArg& v) {
  std::string out;
  const auto* p = static_cast<const std::uint64_t*>(v.p);
  for (size_t i = 0; i < v.n; ++i) out += static_cast<char>(p[i] & 0xFF);
  return out;
}

std::string utf8Decode(const std::uint64_t* p, size_t n) {  // each invalid sequence becomes U+FFFD, like TextDecoder
  std::string out;
  auto bad = [&] { out += "\xEF\xBF\xBD"; };
  for (size_t i = 0; i < n;) {
    unsigned b = static_cast<unsigned>(p[i] & 0xFF);
    int len = b < 0x80 ? 1 : (b >= 0xC2 && b <= 0xDF) ? 2 : (b >= 0xE0 && b <= 0xEF) ? 3 : (b >= 0xF0 && b <= 0xF4) ? 4 : 0;
    if (len == 0) { bad(); ++i; continue; }
    if (len == 1) { out += static_cast<char>(b); ++i; continue; }
    unsigned lo = 0x80, hi = 0xBF;
    if (b == 0xE0) lo = 0xA0; else if (b == 0xED) hi = 0x9F; else if (b == 0xF0) lo = 0x90; else if (b == 0xF4) hi = 0x8F;
    size_t k = 1;
    bool ok = true;
    for (; k < static_cast<size_t>(len); ++k) {
      if (i + k >= n) { ok = false; break; }
      unsigned c = static_cast<unsigned>(p[i + k] & 0xFF);
      if (c < (k == 1 ? lo : 0x80u) || c > (k == 1 ? hi : 0xBFu)) { ok = false; break; }
    }
    if (!ok) { bad(); i += k; continue; }
    for (size_t j = 0; j < static_cast<size_t>(len); ++j) out += static_cast<char>(p[i + j] & 0xFF);
    i += static_cast<size_t>(len);
  }
  return out;
}

// child processes: `sh -c line` with stdout and stderr on one non-blocking pipe; a handle is an index (never reused) into a small table
// Child processes run on the libuv loop (zn/loop.h).
int procSpawn(const std::string& line) { return zn::loop::spawn(line); }
std::string procRead(int h) { return zn::loop::read(h); }
int procStatus(int h) { return zn::loop::status(h); }
void procKill(int h) { zn::loop::kill(h); }

void call(int id, const HostArg* a, HostArg* r) {
  auto s = [&](int k) { return str(a[k]); };
  auto n = [&](int k) { return static_cast<int>(a[k].i); };
  switch (static_cast<Rt>(id)) {
    // ---- zinc:sys
    case Rt::HostSysArgsCount: r->i = static_cast<std::int64_t>(gArgs.size()); break;
    case Rt::HostSysArg: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gArgs.size() ? gArgs[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostSysEnv: { const char* v = getenv(s(0).c_str()); ret(r, v ? v : ""); break; }
    case Rt::HostSysPlatform: ret(r, zn::runPlatform()); break;   // android and ios on the phones; ZINC_PLATFORM forces it (zn/platform.h)
    case Rt::HostSysPid: r->i = getpid(); break;
    case Rt::HostSysAllocations: r->d = static_cast<double>(zn::rt::gAllocs); break;
    case Rt::HostSysLiveBlocks: r->d = static_cast<double>(zn::rt::gAllocs - zn::rt::gFrees); break;
    case Rt::HostSysCwd: { char b[4096]; ret(r, getcwd(b, sizeof b) ? b : ""); break; }
    case Rt::HostSysLaunchDir: { const char* d = getenv("ZINC_LAUNCH_DIR"); ret(r, d && *d ? std::string(d) : startDir()); break; }   // zinc run sets it before entering the project
    case Rt::HostSysLocale: ret(r, systemLocale()); break;
    case Rt::HostSysChdir: startDir(); r->i = chdir(s(0).c_str()) == 0; break;
    case Rt::HostSysSetEnv: setenv(s(0).c_str(), s(1).c_str(), 1); break;
    case Rt::HostSysUnsetEnv: unsetenv(s(0).c_str()); break;
    case Rt::HostSysEnvKeysCount: {
      gNames.clear();
      for (char** e = environ; e && *e; ++e) { const char* eq = strchr(*e, '='); if (eq) gNames.emplace_back(*e, static_cast<size_t>(eq - *e)); }
      std::sort(gNames.begin(), gNames.end());
      r->i = static_cast<std::int64_t>(gNames.size());
      break;
    }
    case Rt::HostSysEnvKey: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostSysIsatty: r->i = isatty(n(0)) != 0; break;
    case Rt::HostSysWriteErr: { std::string t = s(0); std::fwrite(t.data(), 1, t.size(), stderr); break; }
    case Rt::HostSysRandomByte: { static std::random_device rd; r->i = static_cast<int>(rd() & 0xFF); break; }
    case Rt::HostSysUtf8Len: r->i = a[0].n; break;
    case Rt::HostSysUtf8Byte: r->i = static_cast<std::uint32_t>(n(1)) < a[0].n ? static_cast<unsigned char>(static_cast<const char*>(a[0].p)[n(1)]) : 0; break;
    case Rt::HostSysUtf8Decode: ret(r, utf8Decode(static_cast<const std::uint64_t*>(a[0].p), a[0].n)); break;
    // ---- zinc:fs
    case Rt::HostFsFailed: { r->i = gFailed; gFailed = false; break; }
    case Rt::HostFsError: ret(r, gError); break;
    case Rt::HostFsReadText: { std::vector<unsigned char> b; if (readAll(s(0), b, "cannot open")) ret(r, std::string(b.begin(), b.end())); else ret(r, ""); break; }
    case Rt::HostFsWriteText: writeAll(s(0), static_cast<const char*>(a[1].p), a[1].n, false, "open"); break;
    case Rt::HostFsAppendText: writeAll(s(0), static_cast<const char*>(a[1].p), a[1].n, true, "open"); break;
    case Rt::HostFsWriteAsync: r->i = fsJob(s(0), static_cast<const char*>(a[1].p), a[1].n, true); break;   // 0: refused (fsError says why)
    case Rt::HostFsReadAsync: r->i = fsJob(s(0), nullptr, 0, false); break;
    case Rt::HostFsExists: { struct stat st; r->i = !denyByPermission("fs:read", s(0)) && stat(s(0).c_str(), &st) == 0; break; }   // what exists is read too (ZN-327)
    case Rt::HostFsListCount: {
      gNames.clear(); gKinds.clear();
      std::string dir = s(0);
      if (denyByPermission("fs:read", dir)) { r->i = 0; break; }
      DIR* d = opendir(dir.c_str());
      if (!d) { fail("scandir", dir); r->i = 0; break; }
      std::vector<std::pair<std::string, int>> es;
      while (dirent* e = readdir(d)) {
        std::string nm = e->d_name;
        if (nm == "." || nm == "..") continue;
        struct stat st;
        int kind = 0;
        if (lstat((dir + "/" + nm).c_str(), &st) == 0) kind = S_ISLNK(st.st_mode) ? 4 : S_ISDIR(st.st_mode) ? 2 : 1;
        es.push_back({nm, kind});
      }
      closedir(d);
      std::sort(es.begin(), es.end());
      for (auto& [nm, k] : es) { gNames.push_back(nm); gKinds.push_back(k); }
      r->i = static_cast<std::int64_t>(gNames.size());
      break;
    }
    case Rt::HostFsListName: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostFsListKind: r->i = n(0) >= 0 && static_cast<size_t>(n(0)) < gKinds.size() ? gKinds[static_cast<size_t>(n(0))] : 0; break;
    case Rt::HostFsRemove: {
      if (denyByPermission("fs:write", s(0)) || denyByScope("remove", s(0))) break;
      std::string p = s(0);
      struct stat st;
      if (lstat(p.c_str(), &st) != 0) { r->i = 0; break; }
      r->i = a[1].i ? removeTree(p) : (S_ISDIR(st.st_mode) ? rmdir(p.c_str()) == 0 : unlink(p.c_str()) == 0);
      break;
    }
    case Rt::HostFsMkdir: if (denyByPermission("fs:write", s(0)) || denyByScope("mkdir", s(0))) { r->i = 0; break; } r->i = a[1].i ? mkdirs(s(0)) : mkdir(s(0).c_str(), 0777) == 0; break;
    case Rt::HostFsLoad: { if (readAll(s(0), gBytes, "cannot open")) r->i = static_cast<std::int64_t>(gBytes.size()); else r->i = 0; break; }
    case Rt::HostFsByte: r->i = n(0) >= 0 && static_cast<size_t>(n(0)) < gBytes.size() ? gBytes[static_cast<size_t>(n(0))] : 0; break;
    case Rt::HostFsWriteBytes:
    case Rt::HostFsAppendBytes: {
      std::string data;
      const std::uint64_t* p = static_cast<const std::uint64_t*>(a[1].p);
      for (std::uint32_t i = 0; i < a[1].n; ++i) data += static_cast<char>(p[i] & 0xFF);
      writeAll(s(0), data.data(), data.size(), static_cast<Rt>(id) == Rt::HostFsAppendBytes, "open");
      break;
    }
    case Rt::HostFsStat: {
      struct stat st;
      std::string p = s(0);
      if (denyByPermission("fs:read", p)) { r->i = 0; break; }
      int rc = a[1].i ? lstat(p.c_str(), &st) : stat(p.c_str(), &st);
      if (rc != 0) { fail("stat", p); r->i = 0; break; }
#if defined(__APPLE__)
      gStat = {static_cast<double>(st.st_size), st.st_mtimespec.tv_sec * 1e3 + st.st_mtimespec.tv_nsec / 1e6, st.st_atimespec.tv_sec * 1e3 + st.st_atimespec.tv_nsec / 1e6,
               st.st_ctimespec.tv_sec * 1e3 + st.st_ctimespec.tv_nsec / 1e6, static_cast<int>(st.st_mode & 07777), S_ISREG(st.st_mode), S_ISDIR(st.st_mode), S_ISLNK(st.st_mode)};
#elif defined(_WIN32)
      // MSVCRT's struct stat: times in seconds, no ns (a plain 1 ms); the mode's bits: 0777, dir, read-only
      gStat = {static_cast<double>(st.st_size), st.st_mtime * 1e3, st.st_atime * 1e3, st.st_ctime * 1e3,
               static_cast<int>(st.st_mode & 0777), S_ISREG(st.st_mode), S_ISDIR(st.st_mode), S_ISLNK(st.st_mode)};
#else
      gStat = {static_cast<double>(st.st_size), st.st_mtim.tv_sec * 1e3 + st.st_mtim.tv_nsec / 1e6, st.st_atim.tv_sec * 1e3 + st.st_atim.tv_nsec / 1e6,
               st.st_ctim.tv_sec * 1e3 + st.st_ctim.tv_nsec / 1e6, static_cast<int>(st.st_mode & 07777), S_ISREG(st.st_mode), S_ISDIR(st.st_mode), S_ISLNK(st.st_mode)};
#endif
      r->i = 1;
      break;
    }
    case Rt::HostFsStatD: r->d = n(0) == 0 ? gStat.size : n(0) == 1 ? gStat.mtime : n(0) == 2 ? gStat.atime : gStat.ctime; break;
    case Rt::HostFsStatI: r->i = n(0) == 0 ? gStat.mode : n(0) == 1 ? gStat.file : n(0) == 2 ? gStat.dir : gStat.link; break;
    case Rt::HostFsRename: if (denyByPermission("fs:write", s(0)) || denyByPermission("fs:write", s(1))) break; if (rename(s(0).c_str(), s(1).c_str()) != 0) fail("rename", s(0)); break;
    case Rt::HostFsSymlink: if (denyByPermission("fs:write", s(1))) break; if (symlink(s(0).c_str(), s(1).c_str()) != 0) fail("symlink", s(0) + " -> " + s(1)); break;
    case Rt::HostFsReadlink: { if (denyByPermission("fs:read", s(0))) { ret(r, ""); break; } char b[4096]; ssize_t k = readlink(s(0).c_str(), b, sizeof b - 1); if (k >= 0) { b[k] = 0; ret(r, b); } else { fail("readlink", s(0)); ret(r, ""); } break; }
    case Rt::HostFsChmod: if (denyByPermission("fs:write", s(0))) break; if (chmod(s(0).c_str(), static_cast<mode_t>(n(1))) != 0) fail("chmod", s(0)); break;
    case Rt::HostFsCopyFile: {   // the copy keeps the source's modification time and mode (a photo moved between disks keeps its date)
      std::vector<unsigned char> b;
      if (readAll(s(0), b, "copyfile") && writeAll(s(1), reinterpret_cast<const char*>(b.data()), b.size(), false, "copyfile")) {
#ifndef _WIN32
        struct stat st;
        if (stat(s(0).c_str(), &st) == 0) {
#if defined(__APPLE__)
          const struct timespec a = st.st_atimespec, m = st.st_mtimespec;
#else
          const struct timespec a = st.st_atim, m = st.st_mtim;
#endif
          const struct timeval tv[2] = {{a.tv_sec, static_cast<suseconds_t>(a.tv_nsec / 1000)}, {m.tv_sec, static_cast<suseconds_t>(m.tv_nsec / 1000)}};
          utimes(s(1).c_str(), tv);
          chmod(s(1).c_str(), st.st_mode & 07777);
        }
#endif
      }
      break;
    }
    case Rt::HostFsRealpath: { if (denyByPermission("fs:read", s(0))) { ret(r, ""); break; } char b[4096]; if (realpath(s(0).c_str(), b)) ret(r, b); else { fail("realpath", s(0)); ret(r, ""); } break; }
    case Rt::HostFsTmpdir: ret(r, tmpdirPath()); break;
    case Rt::HostFsMkdtemp: {
      if (denyByPermission("fs:write", s(0))) { ret(r, ""); break; }   // it creates a directory (ZN-327)
      std::string t = s(0) + "XXXXXX";
      std::vector<char> b(t.begin(), t.end());
      b.push_back(0);
      if (mkdtemp(b.data())) ret(r, b.data()); else { fail("mkdtemp", s(0)); ret(r, ""); }
      break;
    }
    // ---- zinc:storage
    case Rt::HostStorageGet: { auto m = storageLoad(); auto it = m.find(s(0)); ret(r, it == m.end() ? "" : it->second); break; }
    case Rt::HostStorageSet: { auto m = storageLoad(); m[s(0)] = s(1); storageSave(m); break; }
    case Rt::HostStorageRemove: { auto m = storageLoad(); m.erase(s(0)); storageSave(m); break; }
    case Rt::HostStorageKeysCount: { gNames.clear(); for (auto& kv : storageLoad()) gNames.push_back(kv.first); r->i = static_cast<std::int64_t>(gNames.size()); break; }
    case Rt::HostStorageKey: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    // ---- zinc:assets: the data entries of the mounted packs first (src/host/assets_host.h, ZN-436), then a directory on disk (assetsDir)
    case Rt::HostAssetsExists: { struct stat st; std::string d = assetsDir(); r->i = zn::host::assets::has(s(0)) || (!d.empty() && stat((d + "/" + s(0)).c_str(), &st) == 0 && S_ISREG(st.st_mode)); break; }
    case Rt::HostAssetsReadText: {
      std::string packed, err;
      if (zn::host::assets::read(s(0), packed, err)) { if (!err.empty()) { gFailed = true; gError = err; } ret(r, err.empty() ? packed : ""); break; }
      std::vector<unsigned char> b; std::string d = assetsDir(); if (!d.empty() && readAll(d + "/" + s(0), b, "open")) ret(r, std::string(b.begin(), b.end())); else { if (d.empty()) fail("open", s(0), ENOENT); ret(r, ""); } break;
    }
    case Rt::HostAssetsLoad: {
      std::string packed, err;
      if (zn::host::assets::read(s(0), packed, err)) { if (!err.empty()) { gFailed = true; gError = err; packed.clear(); } gBytes.assign(packed.begin(), packed.end()); r->i = static_cast<std::int64_t>(gBytes.size()); break; }
      std::string d = assetsDir(); if (!d.empty() && readAll(d + "/" + s(0), gBytes, "open")) r->i = static_cast<std::int64_t>(gBytes.size()); else { if (d.empty()) fail("open", s(0), ENOENT); r->i = 0; } break;
    }
    case Rt::HostAssetsCount: {
      gNames.clear(); std::string d = assetsDir(); if (!d.empty()) listAssets(d, "", gNames);
      zn::host::assets::names(gNames);
      std::sort(gNames.begin(), gNames.end()); gNames.erase(std::unique(gNames.begin(), gNames.end()), gNames.end());
      r->i = static_cast<std::int64_t>(gNames.size()); break;
    }
    case Rt::HostAssetsName: ret(r, n(0) >= 0 && static_cast<size_t>(n(0)) < gNames.size() ? gNames[static_cast<size_t>(n(0))] : ""); break;
    case Rt::HostAssetsMount: { std::string err; r->i = zn::host::assets::mount(s(0), err); if (!r->i) { gFailed = true; gError = err; } break; }
    case Rt::HostAssetsPackAdd: {
      zn::zpk::Input in;
      in.name = s(0);
      in.codec = zn::zpk::Codec::Zstd;
      const std::uint64_t* p = static_cast<const std::uint64_t*>(a[1].p);
      for (std::uint32_t i = 0; i < a[1].n; ++i) in.data += static_cast<char>(p[i] & 0xFF);
      gPack.push_back(std::move(in));
      break;
    }
    case Rt::HostAssetsPackWrite: {
      std::string out, err;
      zn::zpk::WriteOptions o;
      o.zstdLevel = 9;   // a pack written by a running program (an editor's Export): seconds matter more than the last percent
      const bool ok = zn::zpk::write(std::move(gPack), o, out, err);
      gPack.clear();
      if (!ok) { gFailed = true; gError = "assets: " + s(0) + ": " + err; break; }
      writeAll(s(0), out.data(), out.size(), false, "open");
      break;
    }
    case Rt::HostAssetsUnmount: r->i = zn::host::assets::unmount(s(0)); break;
    case Rt::HostAssetsGroupsCount: zn::host::assets::groups(gNames); r->i = static_cast<std::int64_t>(gNames.size()); break;
    case Rt::HostAssetsLoadGroup: { std::string err; r->i = zn::host::assets::load(s(0), n(1), err); if (!r->i) { gFailed = true; gError = err; } break; }
    case Rt::HostAssetsUnloadGroup: zn::host::assets::unload(s(0)); break;
    case Rt::HostAssetsGroupState: r->i = zn::host::assets::groupState(s(0)); break;
    case Rt::HostAssetsTurn: zn::host::assets::turn(); break;
    case Rt::HostAssetsReqDone: r->d = zn::host::assets::done(n(0)); break;
    case Rt::HostAssetsReqTotal: r->d = zn::host::assets::total(n(0)); break;
    case Rt::HostAssetsReqState: r->i = zn::host::assets::state(n(0)); break;
    case Rt::HostAssetsReqError: ret(r, zn::host::assets::error(n(0))); break;
    case Rt::HostAssetsReqForget: zn::host::assets::forget(n(0)); break;
    case Rt::HostAssetsAcquire: { std::string err; r->i = zn::host::assets::acquire(s(0), err); if (!r->i) { gFailed = true; gError = err; } break; }
    case Rt::HostAssetsRelease: zn::host::assets::release(n(0)); break;
    case Rt::HostAssetsHandleText: { const std::string* d = zn::host::assets::data(n(0)); ret(r, d ? *d : std::string()); break; }
    case Rt::HostAssetsHandleLoad: { const std::string* d = zn::host::assets::data(n(0)); if (d) gBytes.assign(d->begin(), d->end()); else gBytes.clear(); r->i = static_cast<std::int64_t>(gBytes.size()); break; }
    case Rt::HostResourceStats: ret(r, resourceSnapshot()); break;
    case Rt::HostSysDevice: {   // the display driver of a device first, then the desktop's own answer
      const std::string q = s(0), a = s(1);
      std::string sim;
      if (simAnswer(q, a, sim)) { ret(r, sim); break; }   // zinc run --simulate: the simulated device first
      const char* d = hal_display && hal_display->device ? hal_display->device(q.c_str(), a.c_str()) : nullptr;
      if (d) ret(r, std::string(d));
      else if (q == "storage") ret(r, storagePath());   // where zinc:storage keeps its keys
      else if (q == "data.dir") {   // zinc:sys dataDir(): the app's own folder, made on first ask
        std::string dir = appDataDir();
        if (dir.empty()) dir = zincHomeDir();
        mkdirs(dir);
        ret(r, dir);
      } else ret(r, desktopDevice(q, a));
      break;
    }
    case Rt::HostAssetsStat: r->d = zn::host::assets::stat(n(0)); break;
    // ---- zinc:os
    case Rt::HostOsHostname: { char b[256]; ret(r, gethostname(b, sizeof b) == 0 ? b : ""); break; }
    case Rt::HostOsHomedir: { const char* h = getenv("HOME"); if (!h) { passwd* pw = getpwuid(getuid()); h = pw ? pw->pw_dir : ""; } ret(r, h); break; }
    case Rt::HostOsArch: {
#if defined(__aarch64__) || defined(__arm64__)
      ret(r, "arm64");
#elif defined(__x86_64__)
      ret(r, "x64");
#elif defined(__arm__)
      ret(r, "arm");
#else
      ret(r, "ia32");
#endif
      break;
    }
    case Rt::HostOsType: { utsname u; ret(r, uname(&u) == 0 ? u.sysname : ""); break; }
    case Rt::HostOsRelease: { utsname u; ret(r, uname(&u) == 0 ? u.release : ""); break; }
    case Rt::HostOsUptime: {
#ifdef __APPLE__
      timeval bt; size_t len = sizeof bt; int mib[2] = {CTL_KERN, KERN_BOOTTIME};
      timeval now; gettimeofday(&now, nullptr);
      r->d = sysctl(mib, 2, &bt, &len, nullptr, 0) == 0 ? static_cast<double>(now.tv_sec - bt.tv_sec) : 0;
#elif defined(_WIN32)
      r->d = static_cast<double>(GetTickCount64()) / 1000.0;
#else
      double up = 0; if (FILE* f = fopen("/proc/uptime", "r")) { if (fscanf(f, "%lf", &up) != 1) up = 0; fclose(f); } r->d = up;
#endif
      break;
    }
    case Rt::HostOsTotalmem: {
#ifdef __APPLE__
      std::uint64_t mem = 0; size_t len = sizeof mem; sysctlbyname("hw.memsize", &mem, &len, nullptr, 0); r->d = static_cast<double>(mem);
#elif defined(_WIN32)
      MEMORYSTATUSEX m{}; m.dwLength = sizeof m; GlobalMemoryStatusEx(&m); r->d = static_cast<double>(m.ullTotalPhys);
#else
      r->d = static_cast<double>(sysconf(_SC_PHYS_PAGES)) * static_cast<double>(sysconf(_SC_PAGESIZE));
#endif
      break;
    }
    case Rt::HostOsFreemem: {
#ifdef __APPLE__
      vm_statistics64_data_t vm; mach_msg_type_number_t cnt = HOST_VM_INFO64_COUNT;
      r->d = host_statistics64(mach_host_self(), HOST_VM_INFO64, reinterpret_cast<host_info64_t>(&vm), &cnt) == KERN_SUCCESS ? static_cast<double>(vm.free_count) * static_cast<double>(vm_page_size) : 0;
#elif defined(_WIN32)
      MEMORYSTATUSEX m{}; m.dwLength = sizeof m; GlobalMemoryStatusEx(&m); r->d = static_cast<double>(m.ullAvailPhys);
#else
      r->d = static_cast<double>(sysconf(_SC_AVPHYS_PAGES)) * static_cast<double>(sysconf(_SC_PAGESIZE));
#endif
      break;
    }
    case Rt::HostOsCpus:
#ifdef _WIN32
      { SYSTEM_INFO si; GetSystemInfo(&si); r->i = si.dwNumberOfProcessors; }
#else
      r->i = sysconf(_SC_NPROCESSORS_ONLN);
#endif
      break;
    case Rt::HostProcSpawn: if (refused("process", s(0))) { r->i = -1; break; } r->i = procSpawn(s(0)); break;
    case Rt::HostProcRead: ret(r, procRead(n(0))); break;
    case Rt::HostProcStatus: r->i = procStatus(n(0)); break;
    case Rt::HostProcKill: procKill(n(0)); break;
    case Rt::HostLoopWait: zn::loop::wait(a[0].d); break;
    case Rt::HostLoopReal: {  // real time unless the run is deterministic (ZINC_DETERMINISTIC, recording, replay); ZINC_REALTIME forces it
      auto set = [](const char* n) { const char* v = getenv(n); return v && *v && *v != '0'; };
      const char* clock = getenv("ZINC_CLOCK");   // --clock virtual | real (ZN-293): virtual means timers and sleeps advance a virtual clock and nothing waits
      if (clock && !strcmp(clock, "virtual")) r->i = 0;
      else if (clock && !strcmp(clock, "real")) r->i = 1;
      else r->i = set("ZINC_REALTIME") || !(set("ZINC_DETERMINISTIC") || getenv("ZINC_RECORD") || getenv("ZINC_REPLAY")) ? 1 : 0;
#ifdef ZN_APP_LIBRARY
      r->i |= 2;   // an app shell steps the program (zn_app_iterate): the prelude returns from __runLoop and waits never sleep (ZN-620)
#endif
      break;
    }
    case Rt::HostLoopNow: r->d = zn::loop::nowMs(); break;
    case Rt::HostProcSpawnEx: {
      auto split = [](const std::string& joined) { std::vector<std::string> v; if (joined.empty()) return v; size_t at = 0; for (;;) { size_t k = joined.find('\x1f', at); v.push_back(joined.substr(at, k == std::string::npos ? std::string::npos : k - at)); if (k == std::string::npos) break; at = k + 1; } return v; };
      if (refused("process", s(0))) { r->i = -1; break; }   // zinc.json permissions (ZN-322)
      std::vector<std::string> argv = split(s(1));
      argv.insert(argv.begin(), s(0));
      r->i = zn::loop::spawnProcess(argv, s(2), split(s(3)));
      break;
    }
    case Rt::HostProcError: { std::string why = takeRefusal(); ret(r, why.empty() ? zn::loop::lastError() : why); break; }
    case Rt::HostProcPid: r->i = zn::loop::pidOf(n(0)); break;
    case Rt::HostProcWrite: r->i = zn::loop::writeStdin(n(0), s(1)) ? 1 : 0; break;
    case Rt::HostProcCloseStdin: zn::loop::closeStdin(n(0)); break;
    case Rt::HostProcSignal: zn::loop::signalProcess(n(0), n(1)); break;
    case Rt::HostEvNext: {  // "handle \x1f kind \x1f data", or "" when no event is ready
      zn::loop::Event e;
      if (zn::loop::nextEvent(e)) { gPayload = std::move(e.payload); ret(r, std::to_string(e.handle) + "\x1f" + std::to_string(e.kind) + "\x1f" + e.data); } else ret(r, std::string());
      break;
    }
    case Rt::HostEvReady: r->i = zn::loop::eventReady() ? 1 : 0; break;
    case Rt::HostEvPayload: ret(r, gPayload); break;
    case Rt::HostEvActive: r->i = zn::loop::active() ? 1 : 0; break;
    case Rt::HostSigWatch: r->i = zn::loop::watchSignal(s(0)) ? 1 : 0; break;
    case Rt::HostSigSend: r->i = zn::loop::sendSignal(n(0), s(1)) ? 1 : 0; break;
    case Rt::HostStdinRead: zn::loop::readStdin(); break;
    case Rt::HostOscListen: r->i = refused("net", "*") ? -1 : zn::loop::oscListen(n(0)) ? 1 : 0; break;
    case Rt::HostOscClose: zn::loop::oscClose(); break;
    case Rt::HostMqttOpen: r->i = refused("net", s(0)) ? -2 : zn::mqtt::open(s(0), n(1), s(2)); break;   // -2: refused by the permissions (sockError says why)
    case Rt::HostMqttOpenTls: r->i = refused("net", s(0)) ? -2 : zn::mqtt::open(s(0), n(1), s(2), n(3) != 0); break;
    case Rt::HostCrypto: { std::string e; std::string o = zn::crypto::run(s(0), rawBytes(a[1]), rawBytes(a[2]), rawBytes(a[3]), rawBytes(a[4]), n(5), n(6), e); gCryptoError = e; static const char* kHex = "0123456789abcdef"; std::string h; h.reserve(o.size() * 2); for (unsigned char c : o) { h += kHex[c >> 4]; h += kHex[c & 15]; } ret(r, h); break; }   // hex: text on every engine (QuickJS strings are UTF-8)
    case Rt::HostCryptoError: ret(r, gCryptoError); break;
    case Rt::HostReCompile: r->i = zn::re::compile(s(0), s(1)); break;
    case Rt::HostReError: ret(r, zn::re::error()); break;
    case Rt::HostReExec: r->i = zn::re::exec(n(0), static_cast<const char*>(a[1].p), a[1].n, n(2)); break;
    case Rt::HostReExecAll: r->i = zn::re::execAll(n(0), static_cast<const char*>(a[1].p), a[1].n, n(2)); break;
    case Rt::HostReAll: r->i = zn::re::allCapture(n(0)); break;
    case Rt::HostReCapture: r->i = zn::re::capture(n(0)); break;
    case Rt::HostReInfo: r->i = n(1) == 0 ? zn::re::captureCount(n(0)) : 0; break;
    case Rt::HostReName: ret(r, zn::re::groupName(n(0), n(1))); break;
    case Rt::HostTzOffset: r->d = tzOffsetMinutes(a[0].d, nullptr, nullptr); break;
    case Rt::HostTzName: { std::string ab; tzOffsetMinutes(a[0].d, nullptr, &ab); ret(r, ab); break; }
    case Rt::HostTzOffsetIn: r->d = tzOffsetMinutes(a[1].d, s(0).c_str(), nullptr); break;
    case Rt::HostMqttPublish: zn::mqtt::publish(n(0), s(1), s(2), n(3) != 0, n(4)); break;
    case Rt::HostMqttSubscribe: zn::mqtt::subscribe(n(0), s(1)); break;
    case Rt::HostMqttClose: zn::mqtt::close(n(0)); break;
    case Rt::HostNetLog: {   // the network log for the inspector (ZN-370)
      const int arg = std::atoi(s(1).c_str());
      if (n(0) == 0) zn::netlog::start(arg);
      if (n(0) == 4) zn::netlog::consoleStart();   // the console (ZN-373.01): 4 start, 5 the new lines, 6 the last 32
      if (n(0) == 7 || n(0) == 8) { std::size_t len = 0; const char* p = zn::host::traceEvents(n(0) == 7, &len); ret(r, std::string(p, len)); break; }   // Tracing (ZN-373.05): 7 start, 8 end
      if (n(0) == 11) { std::size_t len = 0; const char* p = zn::host::threadTrace(3, nullptr, &len); ret(r, std::string(p, len)); break; }   // the workers (the inspector's Threads view)
      ret(r, n(0) == 1 ? zn::netlog::drain() : n(0) == 2 ? zn::netlog::responseBody(arg) : n(0) == 3 ? zn::netlog::postData(arg) : n(0) == 5 ? zn::netlog::consoleDrain() : n(0) == 6 ? zn::netlog::consoleRecent() : n(0) == 9 ? zn::netlog::har() : n(0) == 10 ? zn::netlog::replay() : std::string());   // 9: the log as HAR (the inspector's export)
      break;
    }
    case Rt::HostHttpFetch: r->i = zn::http::fetchOpen(s(0), s(1), s(2), s(3), n(4), n(5)); break;
    case Rt::HostHttpFetchBytes: {   // the body's bytes as they are (one u64 slot per byte)
      const std::uint64_t* p = static_cast<const std::uint64_t*>(a[3].p);
      std::string body(a[3].n, '\0');
      for (std::uint32_t i = 0; i < a[3].n; ++i) body[i] = static_cast<char>(p[i] & 0xFF);
      r->i = zn::http::fetchOpen(s(0), s(1), s(2), body, n(4), n(5));
      break;
    }
    case Rt::HostHttpStatus: r->i = zn::http::fetchStatus(n(0)); break;
    case Rt::HostHttpHead: ret(r, zn::http::fetchHead(n(0))); break;
    case Rt::HostHttpBody: ret(r, zn::http::fetchBody(n(0))); break;
    case Rt::HostHttpUrl: ret(r, zn::http::fetchUrl(n(0))); break;
    case Rt::HostHttpFree: zn::http::fetchFree(n(0)); break;
    case Rt::HostHttpServe: case Rt::HostHttpServeTls: {   // listening needs "net" (or "net:*"): zinc.json permissions (ZN-322)
      gServeDenied = zn::host::perm::check("net", "*");
      if (!gServeDenied.empty()) { r->i = 0; break; }
      r->i = static_cast<Rt>(id) == Rt::HostHttpServe ? zn::http::serve(n(0)) : zn::http::serve(n(0), s(1), s(2));   // the port bound, 0 on failure
      break;
    }
    case Rt::HostHttpError: if (!gServeDenied.empty()) { ret(r, gServeDenied); gServeDenied.clear(); } else ret(r, zn::http::lastError()); break;
    case Rt::HostHttpStop: zn::http::stop(n(0)); break;
    case Rt::HostHttpReply: zn::http::reply(n(0), n(1), s(2), s(3)); break;
    case Rt::HostHttpReplyFile: zn::http::replyFile(n(0), n(1), s(2), s(3), s(4)); break;
    case Rt::HostSockConnect: r->i = refused("net", s(0)) ? -1 : zn::sock::connectTcp(s(0), n(1)); break;   // zinc.json permissions (ZN-322)
    case Rt::HostSockConnectTls: r->i = refused("net", s(0)) ? -1 : zn::sock::connectTls(s(0), n(1)); break;
    case Rt::HostSockConnectUnix: r->i = refused("net", "unix:" + s(0)) ? -1 : zn::sock::connectUnix(s(0)); break;
    case Rt::HostSockListen: r->i = refused("net", "*") ? -1 : zn::sock::listenTcp(s(0), n(1)); break;
    case Rt::HostSockListenUnix: r->i = refused("net", "unix:" + s(0)) ? -1 : zn::sock::listenUnix(s(0)); break;
    case Rt::HostSockUdp: r->i = refused("net", "*") ? -1 : zn::sock::udp(s(0), n(1)); break;
    case Rt::HostSockWrite: r->i = zn::sock::write(n(0), rawBytes(a[1])) ? 1 : 0; break;
    case Rt::HostSockWriteText: r->i = zn::sock::write(n(0), s(1)) ? 1 : 0; break;
    case Rt::HostSockSendTo: r->i = zn::sock::sendTo(n(0), s(1), n(2), rawBytes(a[3])) ? 1 : 0; break;
    case Rt::HostSockEnd: zn::sock::end(n(0)); break;
    case Rt::HostSockClose: zn::sock::close(n(0)); break;
    case Rt::HostSockLocalPort: r->i = zn::sock::localPort(n(0)); break;
    case Rt::HostSockRemoteAddr: ret(r, zn::sock::remoteAddress(n(0))); break;
    case Rt::HostSockRemotePort: r->i = zn::sock::remotePort(n(0)); break;
    case Rt::HostSockLookup: r->i = zn::sock::lookup(s(0)); break;
    case Rt::HostSockError: { std::string why = takeRefusal(); ret(r, why.empty() ? zn::sock::error() : why); break; }
    case Rt::HostSysBytesToString: ret(r, rawBytes(a[0])); break;
    case Rt::HostOscSend: r->i = refused("net", s(0)) ? -1 : zn::loop::oscSend(s(0), n(1), s(2)) ? 1 : 0; break;
    case Rt::HostLoopEpoch: { struct timeval tv; gettimeofday(&tv, nullptr); r->d = static_cast<double>(tv.tv_sec) * 1000.0 + static_cast<double>(tv.tv_usec) / 1000.0; break; }
    case Rt::HostOsCpuModel: {
      std::string model;
#if defined(__APPLE__)
      char b[256]; size_t len = sizeof b;
      if (sysctlbyname("machdep.cpu.brand_string", b, &len, nullptr, 0) == 0) model = b;
#elif defined(_WIN32)
      char b[256] = "";
      if (HKEY k; RegOpenKeyExA(HKEY_LOCAL_MACHINE, "HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0", 0, KEY_READ, &k) == ERROR_SUCCESS) {
        DWORD sz = sizeof b;
        if (RegQueryValueExA(k, "ProcessorNameString", nullptr, nullptr, reinterpret_cast<LPBYTE>(b), &sz) != ERROR_SUCCESS) b[0] = 0;
        RegCloseKey(k);
      }
      model = b;
#else
      std::ifstream in("/proc/cpuinfo"); std::string line;
      while (model.empty() && std::getline(in, line)) if (line.rfind("model name", 0) == 0 && line.find(':') != std::string::npos) model = line.substr(line.find(':') + 2);
#endif
      ret(r, model.empty() ? "cpu" : model);
      break;
    }
    case Rt::HostOsNetList: {
      gNets.clear();
#ifdef _WIN32
      static ULONG size = 8192;
      std::vector<unsigned char> buf(size);
      IP_ADAPTER_ADDRESSES* adds = nullptr;
      if (GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, nullptr, reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data()), &size) == ERROR_BUFFER_OVERFLOW) {
        buf.resize(size); adds = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data());
        if (GetAdaptersAddresses(AF_UNSPEC, GAA_FLAG_SKIP_ANYCAST | GAA_FLAG_SKIP_MULTICAST | GAA_FLAG_SKIP_DNS_SERVER, nullptr, adds, &size) != NO_ERROR) adds = nullptr;
      } else adds = reinterpret_cast<IP_ADAPTER_ADDRESSES*>(buf.data());
      if (adds) {
        for (IP_ADAPTER_ADDRESSES* a = adds; a; a = a->Next) {
          const std::string name = std::string(a->AdapterName);   // the GUID; FriendlyName would be the "name" a user reads (WCHAR-Alt, later)
          char mac[24];
          if (a->PhysicalAddressLength == 6) std::snprintf(mac, sizeof mac, "%02x:%02x:%02x:%02x:%02x:%02x", a->PhysicalAddress[0], a->PhysicalAddress[1], a->PhysicalAddress[2], a->PhysicalAddress[3], a->PhysicalAddress[4], a->PhysicalAddress[5]);
          else std::strcpy(mac, "00:00:00:00:00:00");
          for (IP_ADAPTER_UNICAST_ADDRESS* u = a->FirstUnicastAddress; u; u = u->Next) {
            const int fam = static_cast<sockaddr*>(u->Address.lpSockaddr) ? u->Address.lpSockaddr->sa_family : 0;
            if (fam != AF_INET && fam != AF_INET6) continue;
            char addr[INET6_ADDRSTRLEN] = "";
            const void* src = fam == AF_INET ? static_cast<void*>(&reinterpret_cast<sockaddr_in*>(u->Address.lpSockaddr)->sin_addr)
                                             : static_cast<void*>(&reinterpret_cast<sockaddr_in6*>(u->Address.lpSockaddr)->sin6_addr);
            inet_ntop(fam, src, addr, sizeof addr);
            char mask[INET6_ADDRSTRLEN] = "";
            if (u->OnLinkPrefixLength > 0 && u->OnLinkPrefixLength < 129) {   // the prefix of the address as a mask, dotted for v4
              if (fam == AF_INET) {
                const std::uint32_t m = u->OnLinkPrefixLength >= 32 ? 0xffffffffu : htonl(~((1u << (32 - u->OnLinkPrefixLength)) - 1));
                std::snprintf(mask, sizeof mask, "%u.%u.%u.%u", m >> 24 & 255, m >> 16 & 255, m >> 8 & 255, m & 255);
              } else std::snprintf(mask, sizeof mask, "/%d", u->OnLinkPrefixLength);
            }
            gNets.push_back({name, addr, mask, fam == AF_INET ? "IPv4" : "IPv6", mac, a->IfType == IF_TYPE_SOFTWARE_LOOPBACK ? "1" : "0"});
          }
        }
      }
#else
      struct ifaddrs* all = nullptr;
      if (getifaddrs(&all) == 0) {
        std::map<std::string, std::string> macs;
        for (struct ifaddrs* a = all; a; a = a->ifa_next) {
          if (!a->ifa_addr) continue;
#if defined(__APPLE__)
          if (a->ifa_addr->sa_family == AF_LINK) { auto* d = reinterpret_cast<struct sockaddr_dl*>(a->ifa_addr); const unsigned char* m = reinterpret_cast<const unsigned char*>(LLADDR(d)); char b[24]; if (d->sdl_alen == 6) { std::snprintf(b, sizeof b, "%02x:%02x:%02x:%02x:%02x:%02x", m[0], m[1], m[2], m[3], m[4], m[5]); macs[a->ifa_name] = b; } }
#else
          if (a->ifa_addr->sa_family == AF_PACKET) { auto* d = reinterpret_cast<struct sockaddr_ll*>(a->ifa_addr); char b[24]; std::snprintf(b, sizeof b, "%02x:%02x:%02x:%02x:%02x:%02x", d->sll_addr[0], d->sll_addr[1], d->sll_addr[2], d->sll_addr[3], d->sll_addr[4], d->sll_addr[5]); macs[a->ifa_name] = b; }
#endif
        }
        for (struct ifaddrs* a = all; a; a = a->ifa_next) {
          if (!a->ifa_addr || (a->ifa_addr->sa_family != AF_INET && a->ifa_addr->sa_family != AF_INET6)) continue;
          char addr[INET6_ADDRSTRLEN] = "", mask[INET6_ADDRSTRLEN] = "";
          bool v4 = a->ifa_addr->sa_family == AF_INET;
          inet_ntop(a->ifa_addr->sa_family, v4 ? static_cast<void*>(&reinterpret_cast<struct sockaddr_in*>(a->ifa_addr)->sin_addr) : static_cast<void*>(&reinterpret_cast<struct sockaddr_in6*>(a->ifa_addr)->sin6_addr), addr, sizeof addr);
          if (a->ifa_netmask) inet_ntop(a->ifa_addr->sa_family, v4 ? static_cast<void*>(&reinterpret_cast<struct sockaddr_in*>(a->ifa_netmask)->sin_addr) : static_cast<void*>(&reinterpret_cast<struct sockaddr_in6*>(a->ifa_netmask)->sin6_addr), mask, sizeof mask);
          auto m = macs.find(a->ifa_name);
          gNets.push_back({a->ifa_name, addr, mask, v4 ? "IPv4" : "IPv6", m != macs.end() ? m->second : "00:00:00:00:00:00", (a->ifa_flags & IFF_LOOPBACK) ? "1" : "0"});
        }
        freeifaddrs(all);
      }
#endif
      r->i = static_cast<std::int64_t>(gNets.size());
      break;
    }
    case Rt::HostOsNetField: { size_t i = static_cast<size_t>(n(0)); const auto& e = i < gNets.size() ? gNets[i] : std::array<std::string, 6>{}; int f = n(1); ret(r, f >= 0 && f < 6 ? e[f] : ""); break; }
    case Rt::HostOsUid: r->i = static_cast<std::int64_t>(getuid()); break;
    case Rt::HostOsGid: r->i = static_cast<std::int64_t>(getgid()); break;
    case Rt::HostOsShell: { passwd* pw = getpwuid(getuid()); ret(r, pw && pw->pw_shell ? pw->pw_shell : ""); break; }
    case Rt::HostOsUser: { passwd* pw = getpwuid(getuid()); ret(r, pw ? pw->pw_name : ""); break; }
    case Rt::HostOsLoad: {
      double l[3] = {0, 0, 0};
#if defined(__ANDROID__) && __ANDROID_API__ < 29   // bionic has getloadavg since API 29: the kernel's file says the same
      if (FILE* f = fopen("/proc/loadavg", "r")) { if (fscanf(f, "%lf %lf %lf", &l[0], &l[1], &l[2]) != 3) l[0] = l[1] = l[2] = 0; fclose(f); }
#else
      getloadavg(l, 3);
#endif
      r->d = n(0) >= 0 && n(0) < 3 ? l[n(0)] : 0; break; }
    default: break;
  }
}

}  // namespace

void setProgramArgs(const std::vector<std::string>& args) { gArgs = args; zn::netlog::on(); }   // on(): a run with --har writes its HAR even without a request
void installSys() {
  hostSys = call;
  loopBridge.wakeNew = zn::loop::wakeNew;   // zinc:worker (src/rt/worker.cpp)
  loopBridge.wakeSend = zn::loop::wakeSend;
  loopBridge.push = [](int h, int kind) { zn::loop::pushEvent(h, kind, std::string()); };
  loopBridge.active = zn::loop::addActive;
}

// Called by the system plugin (zinc.json scopes and the dialogs): the fs scope switch and a path the user picked.
extern "C" void zn_host_fs_scope(int userPickedOnly) { gScopeOn = userPickedOnly != 0; }
// zinc:gfx loadFont (ZN-669): a font file of the assets that the program names at run time, read whole and added to the rasterizer's files
// (the baker embeds only the files it saw). An absolute path (ZN-650.14) is a file outside the assets, an editor's project folder: it is read
// as zinc:fs reads it and no wider, so the fs:read permission of zinc.json and the fs scope decide, and a refusal is said on stderr.
// -1: not in the assets, refused, or not a TrueType file. loadFont does not throw: the error of the read is not left for the next fs call.
extern "C" int zn_asset_font(const char* name, uint32_t n) {
  const std::string d = assetsDir(), rel(name, n);
  const bool outside = !rel.empty() && rel[0] == '/';   // ponytail: POSIX absolute paths; a drive letter when the Windows pass ports this file
  if (rel.empty() || (!outside && (d.empty() || rel.find("..") != std::string::npos))) return -1;
  std::vector<unsigned char> b;
  const bool ok = readAll(outside ? rel : d + "/" + rel, b, "open");
  if (!ok && gError.rfind("EACCES", 0) == 0) std::fprintf(stderr, "zinc: loadFont: %s\n", gError.c_str());
  gFailed = false;
  return ok ? zrt::raster::add_font_file(name, n, b.data(), static_cast<uint32_t>(b.size())) : -1;
}
// zinc:gfx image (ZN-438): an image entry of the mounted packs (ZIM1, include/zn/zim.h: an imported image, a page of a sprite atlas, a texture)
// that the program names and the baker did not embed becomes a runtime image with straight alpha, as the rasterizer samples them; one per name.
// A texture in a GPU block format (ZN-439) keeps its blocks beside the decoded texels: a GL renderer uploads them where its driver takes the
// format. -1: no pack has such an image.
static std::map<std::string, int> gPackImages;   // ponytail: kept for the program's life; freed with their group once image handles exist (zinc:assets v2)
// Level 0 of a block format to RGBA texels; false for the formats only a GPU decodes here (ASTC, PVRTC1).
static bool decodeBlocks(const zn::zim::Format& f, const unsigned char* src, uint32_t w, uint32_t h, uint32_t* px) {
  unsigned char blk[64];
  for (uint32_t by = 0; by < (h + 3) / 4; ++by)
    for (uint32_t bx = 0; bx < (w + 3) / 4; ++bx, src += f.bytes) {
      switch (f.id) {
        case 8: bcdec_bc1(src, blk, 16); for (int i = 3; i < 64; i += 4) blk[i] = 255; break;   // uploaded as RGB DXT1: the BC1A transparent colour is black
        case 9: bcdec_bc3(src, blk, 16); break;
        case 10: bcdec_bc7(src, blk, 16); break;
        case 11: etcdec_etc_rgb(src, blk, 16); break;
        case 12: etcdec_eac_rgba(src, blk, 16); break;
        default: return false;
      }
      for (uint32_t y = 0; y < 4 && by * 4 + y < h; ++y)
        for (uint32_t x = 0; x < 4 && bx * 4 + x < w; ++x) {
          const unsigned char* t = blk + (y * 4 + x) * 4;
          px[(by * 4 + y) * w + bx * 4 + x] = static_cast<uint32_t>(t[3]) << 24 | t[0] << 16 | t[1] << 8 | t[2];
        }
    }
  return true;
}
// The pixels of the image entry `key` into image `id` (-1: a new one; resized to the entry); the image, or -1.
static int32_t packImage(const std::string& key, int32_t id) {
  std::string zim, err;
  const bool splash = key == ".splash";   // the engine splash's image (ZN-446) for the loader's splash screen (ZN-447): after its 20-byte ZSP1 header
  if (!assets::read(key, zim, err, splash ? 3 : 1) || !err.empty()) return -1;
  if (splash) zim.erase(0, std::min<std::size_t>(zim.size(), 20));
  if (zim.size() < zn::zim::kHeader || zim.compare(0, 4, "ZIM1") != 0) return -1;
  const auto* p = reinterpret_cast<const unsigned char*>(zim.data());
  auto u32 = [&](int at) { return static_cast<uint32_t>(p[at] | p[at + 1] << 8 | p[at + 2] << 16) | static_cast<uint32_t>(p[at + 3]) << 24; };
  const zn::zim::Format* f = zn::zim::format(p[4]);
  const unsigned flags = p[6] | p[7] << 8;
  const bool premultiplied = flags & zn::zim::Premultiplied;
  const uint32_t w = u32(8), h = u32(12);
  if (!f || w == 0 || h == 0 || w > 16384 || h > 16384 || zim.size() != zn::zim::kHeader + zn::zim::dataBytes(*f, w, h, flags & zn::zim::Mipmaps)) return -1;
  if (id < 0) id = zrt::raster::dyn_create(static_cast<int32_t>(w), static_cast<int32_t>(h));
  else zrt::raster::dyn_resize(id, static_cast<int32_t>(w), static_cast<int32_t>(h));
  uint32_t* px = zrt::raster::dyn_pixels(id);
  if (!px) return -1;
  const unsigned char* data = p + zn::zim::kHeader;
  const bool blocks = f->bw > 1;
  if (blocks && !decodeBlocks(*f, data, w, h, px)) {   // left transparent: only a GPU that takes the format draws it
    static bool warned = false;
    if (!warned) std::fprintf(stderr, "zinc: %s is %s, which this machine decodes only on a GPU that takes it (the software raster draws it transparent)\n", key.c_str(), f->name);
    warned = true;
  }
  bool alpha = false;
  for (size_t i = 0, k = static_cast<size_t>(w) * h; i < k; i++) {
    if (!blocks) px[i] = zn::zim::argb(*f, data, i, premultiplied);   // include/zn/zim.h: the console cores decode the same way
    else if (premultiplied) {
      const uint32_t v = px[i];
      unsigned r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
      const unsigned a = v >> 24;
      if (a && a < 255) { r = std::min(255u, (r * 255 + a / 2) / a); g = std::min(255u, (g * 255 + a / 2) / a); b = std::min(255u, (b * 255 + a / 2) / a); }
      px[i] = a << 24 | r << 16 | g << 8 | b;
    }
    alpha |= (px[i] >> 24) != 255;
  }
  zrt::raster::dyn_set_alpha(id, alpha);
  zrt::raster::dyn_update(id, nullptr, 0);
  if (blocks) zrt::raster::dyn_set_blocks(id, f->gl, data, static_cast<uint32_t>(zn::zim::levelBytes(*f, w, h)), premultiplied);   // level 0: the 2D renderers draw no mipmaps
  return id;
}
extern "C" int zn_asset_image(const char* name, uint32_t n) {
  const std::string key(name, n);
  if (auto it = gPackImages.find(key); it != gPackImages.end()) return it->second;
  const int32_t id = packImage(key, -1);
  if (id >= 0) gPackImages[key] = id;
  return id;
}
// Whether an asset can be had without waiting: always on a desktop (the packs are in memory or on a fast disk); a console with an SD pack waits.
extern "C" int zn_asset_ready(const char*, uint32_t) { return 1; }
// A picture zn_asset_image made that zinc:3d no longer draws (a World's freed chunk): destroyed and forgotten, as the console cores do.
extern "C" void zn_asset_image_free(int id) {
  for (auto it = gPackImages.begin(); it != gPackImages.end(); ++it)
    if (it->second == id) { zrt::raster::dyn_destroy(id); gPackImages.erase(it); return; }
}
// zinc:assets readBytes for a native module (zinc:3d's models): the whole entry in one call, a malloc'd copy the caller frees; null when
// it is in no pack and not in assetsDir.
extern "C" unsigned char* zn_asset_bytes(const char* name, uint32_t n, uint32_t* size) {
  const std::string key(name, n);
  std::string d, err;
  if (!assets::read(key, d, err)) {
    const std::string dir = assetsDir();
    std::ifstream in(dir + "/" + key, std::ios::binary);
    if (dir.empty() || !in) return nullptr;
    d.assign(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>());
  } else if (!err.empty()) return nullptr;
  auto* p = static_cast<unsigned char*>(std::malloc(d.size() ? d.size() : 1));
  if (!p) return nullptr;
  std::memcpy(p, d.data(), d.size());
  *size = static_cast<uint32_t>(d.size());
  return p;
}
void assets::imageReloaded(const std::string& name) {
  if (auto it = gPackImages.find(name); it != gPackImages.end()) packImage(name, it->second);
}
extern "C" void zn_host_fs_grant(const char* path) { gGrants.push_back(absPath(path)); }
// App updates (ZN-324.03) are the engine's (src/main.cpp defines the real one, which wins); a compiled program has none: the system plugin says "unsupported".
extern "C" __attribute__((weak)) int zn_host_update(const char*, const char*, char*, int) { return 0; }

// The baked fonts and images of a program built with zinc build --no-embed or --bundle: the file the build wrote beside the executable or in
// the .app's Resources, found as its assets/ are (runtime/include/zrt_assets_dir.h). Its own file: no permission is asked.
bool installResourcesFile(const char* name) {
  std::string bases[4];
  const int n = zrt_program_bases(false, bases);
  for (int i = 0; i < n; i++) {
    const std::string path = bases[i] + "/" + name;
    std::ifstream in(path, std::ios::binary);
    if (!in) continue;
    const std::vector<std::uint8_t> blob{std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()};
    if (installResources(blob.data(), blob.size())) return true;
    std::fprintf(stderr, "zinc: %s is damaged: build the program again\n", path.c_str());
    return false;
  }
  std::fprintf(stderr, "zinc: %s is missing: it holds the program's fonts and images and goes beside the executable (or in the Resources of its .app)\n", name);
  return false;
}

}  // namespace zn::host
