// display-gl backend for HP webOS 3 (HP TouchPad): the device's features behind the web APIs of zinc:web (HalDisplay::device; the queries
// and their answers: docs/guide/09-web-apis.md "Device"; how each was found: docs/reports/hardware/touchpad-device-apis.md).
// Palm's own libraries answer what a jailed program may ask (SDL's joystick is the accelerometer, libpdl the compass, the keyboard, the
// screen timeout, the language); zinc-helper, the root job of zinc:webos, writes into /tmp/zinc what only root reads (powerd's battery and
// charger signals, the connection manager). A query this file does not know answers nullptr: the host's desktop answer is used.
#include <dlfcn.h>
#include <unistd.h>
#include <cstdint>
#include <cstdlib>
#include <cstdio>
#include <cstring>
#include <string>

extern "C" int zgl_webos_active();
extern "C" void zgl_webos_keyboard(int on);
extern "C" void zgl_webos_orientation(const char* policy);
extern "C" int zgl_webos_turn();
extern "C" const char* zgl_webos_keys();

namespace {
std::string answer;   // the last answer, valid until the next query

void* pdl() { static void* h = dlopen("libpdl.so", RTLD_NOW | RTLD_GLOBAL); return h; }
template <class F> F pdlFn(const char* name) { return pdl() ? reinterpret_cast<F>(dlsym(pdl(), name)) : nullptr; }

std::string readFile(const char* path) {
  std::string s;
  if (FILE* f = fopen(path, "r")) {
    char b[1024];
    size_t n;
    while ((n = fread(b, 1, sizeof b, f)) > 0) s.append(b, n);
    fclose(f);
  }
  while (!s.empty() && (s.back() == '\n' || s.back() == ' ')) s.pop_back();
  return s;
}
const char* give(std::string s) { answer = std::move(s); return answer.c_str(); }

// The accelerometer: Palm's SDL shows it as joystick 0, three axes, 32768 = 1 g, sampled at 30 Hz (PDK "Input Handling").
struct Joystick;
int (*SDL_InitSubSystem)(uint32_t);
int (*SDL_NumJoysticks)();
Joystick* (*SDL_JoystickOpen)(int);
void (*SDL_JoystickUpdate)();
int16_t (*SDL_JoystickGetAxis)(Joystick*, int);
Joystick* joystick() {
  static int state = 0;   // 0 not tried, 1 open, -1 none
  static Joystick* j = nullptr;
  if (state) return j;
  state = -1;
  void* so = dlopen("libSDL-1.2.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!so) return nullptr;
  SDL_InitSubSystem = reinterpret_cast<int (*)(uint32_t)>(dlsym(so, "SDL_InitSubSystem"));
  SDL_NumJoysticks = reinterpret_cast<int (*)()>(dlsym(so, "SDL_NumJoysticks"));
  SDL_JoystickOpen = reinterpret_cast<Joystick* (*)(int)>(dlsym(so, "SDL_JoystickOpen"));
  SDL_JoystickUpdate = reinterpret_cast<void (*)()>(dlsym(so, "SDL_JoystickUpdate"));
  SDL_JoystickGetAxis = reinterpret_cast<int16_t (*)(Joystick*, int)>(dlsym(so, "SDL_JoystickGetAxis"));
  if (!SDL_InitSubSystem || !SDL_NumJoysticks || !SDL_JoystickOpen || !SDL_JoystickUpdate || !SDL_JoystickGetAxis) return nullptr;
  if (SDL_InitSubSystem(0x200 /* SDL_INIT_JOYSTICK */) != 0 || SDL_NumJoysticks() < 1) return nullptr;
  j = SDL_JoystickOpen(0);
  if (j) state = 1;
  // read when asked (SDL_JoystickUpdate): its 30 axis events a second would fill the event queue the touches share
  if (auto events = reinterpret_cast<int (*)(int)>(dlsym(so, "SDL_JoystickEventState"))) events(0 /* SDL_IGNORE */);
  return j;
}

struct PdlCompass { int confidence; double magneticBearing; double trueBearing; };   // PDL.h of the webOS 3 PDK
constexpr int kSensorAngle = 270;   // measured: upright in landscape the joystick reads x = -9.8 (2026-10-15)

// "EN_UK" (PDL_GetLanguage) to "en-GB": the BCP 47 tag of navigator.language
std::string bcp47(const char* pdl) {
  std::string s(pdl), out;
  for (size_t i = 0; i < s.size(); ++i) {
    const char c = s[i];
    const bool region = s.find('_') != std::string::npos && i > s.find('_');
    out += c == '_' ? '-' : region ? (char)(c >= 'a' && c <= 'z' ? c - 32 : c) : (char)(c >= 'A' && c <= 'Z' ? c + 32 : c);
  }
  if (out.size() >= 5 && out.compare(out.size() - 2, 2, "UK") == 0) out.replace(out.size() - 2, 2, "GB");
  return out;
}
}  // namespace

extern "C" const char* zgl_backend_device(const char* query, const char* arg) {
  const std::string q = query, a = arg ? arg : "";
  if (q == "visibility") return zgl_webos_active() ? "visible" : "hidden";
  if (q == "battery") return give(readFile("/tmp/zinc/battery.json"));   // '' until zinc-helper has written it
  if (q == "network") { std::string n = readFile("/tmp/zinc/network.json"); return n.empty() ? nullptr : give(n); }
  if (q == "light") return give(readFile("/tmp/zinc/light.json"));
  if (q == "cpu") return give(readFile("/tmp/zinc/cpu.json"));   // zinc-helper: the clock, the cores online, the governor
  if (q == "notify") {   // a banner, through the headless web application org.zinc.notifier (installed with zinc-helper)
    if (a.empty()) return access("/tmp/zinc/helper.pid", F_OK) == 0 ? "1" : "0";
    auto call = pdlFn<int (*)(const char*, const char*)>("PDL_ServiceCall");
    if (!call) return "0";
    const std::string params = "{\"id\":\"org.zinc.notifier\",\"params\":" + a + "}";
    return call("palm://com.palm.applicationManager/launch", params.c_str()) == 0 ? "1" : "0";
  }
  if (q == "keys") return zgl_webos_keys();
  if (q == "vibrate") {   // the TouchPad's motor: PDL_Vibrate(period, duration) in ms; a pattern is played by zinc:web
    auto f = pdlFn<int (*)(int, int)>("PDL_Vibrate");
    const int ms = std::atoi(a.c_str());
    return f && f(0, ms) == 0 ? "1" : "0";
  }
  if (q == "turn") return give(std::to_string(zgl_webos_turn()));
  if (q == "wakelock") {   // the system's screen timeout off while a screen lock is held
    auto f = pdlFn<int (*)(int)>("PDL_ScreenTimeoutEnable");
    return f && f(a == "1" ? 0 : 1) == 0 ? "1" : "0";
  }
  if (q == "keyboard") { zgl_webos_keyboard(a == "1"); return "1"; }   // webos.cpp: the keyboard and the band it leaves the program
  if (q == "orientation") { zgl_webos_orientation(a == "any" ? "any" : a.empty() ? "natural" : a.c_str()); return "1"; }
  if (q == "motion") {   // m/s^2 including gravity, in the device's axes the web's way (flat face up: z = +9.8)
    Joystick* j = joystick();
    if (!j) return "";
    SDL_JoystickUpdate();
    char b[128];
    const double k = 9.80665 / 32768.0;
    // the joystick gives gravity, not the reaction the web reports (flat face up it reads z = -9.8), and its y is the screen's x: the
    // device's frame is the raw one turned half a turn around x (measured 2026-10-15 with the poses of webos.cpp and kSensorAngle)
    std::snprintf(b, sizeof b, "{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f}", SDL_JoystickGetAxis(j, 0) * k, -SDL_JoystickGetAxis(j, 1) * k, -SDL_JoystickGetAxis(j, 2) * k);
    return give(b);
  }
  if (q == "compass") {
    static bool on = false;
    auto enable = pdlFn<int (*)(int)>("PDL_EnableCompass");
    auto get = pdlFn<int (*)(PdlCompass*)>("PDL_GetCompass");
    if (!enable || !get) return "";
    if (!on) on = enable(1) == 0;
    PdlCompass c{};
    if (!on || get(&c) != 0) return "";
    char b[160];
    std::snprintf(b, sizeof b, "{\"heading\":%.1f,\"magnetic\":%.1f,\"accuracy\":%d}", c.trueBearing, c.magneticBearing, c.confidence);
    return give(b);
  }
  if (q == "language") {
    auto f = pdlFn<int (*)(char*, int)>("PDL_GetLanguage");
    char b[64] = {0};
    return f && f(b, sizeof b) == 0 && *b ? give(bcp47(b)) : nullptr;
  }
  if (q == "device") {
    auto name = pdlFn<int (*)(char*, int)>("PDL_GetDeviceName");
    char b[64] = {0};
    if (name) name(b, sizeof b);
    std::string n;
    for (const char* c = b; *c; ++c) if (*c != '"' && *c != '\\') n += *c;
    // the accelerometer's axes are the tablet's natural (portrait) frame; the program's screen is landscape: a quarter turn
    return give("{\"type\":\"tablet\",\"brand\":\"HP\",\"manufacturer\":\"HP\",\"modelName\":\"HP TouchPad\",\"osName\":\"webOS\",\"isDevice\":true,"   // zinc:device-info (ZN-761)
                "\"model\":\"HP TouchPad\",\"os\":\"HP webOS 3\",\"name\":\"" + n + "\",\"natural\":\"landscape\",\"sensorAngle\":" + std::to_string(kSensorAngle) + "}");
  }
  return nullptr;
}

// webos.cpp: the accelerometer for the pose of a program that turns with the device (m/s^2, the tablet's raw axes); 0 without one.
extern "C" int zgl_webos_axes(float* xyz) {
  Joystick* j = joystick();
  if (!j) return 0;
  SDL_JoystickUpdate();
  const float k = 9.80665f / 32768.0f;
  xyz[0] = SDL_JoystickGetAxis(j, 0) * k; xyz[1] = SDL_JoystickGetAxis(j, 1) * k; xyz[2] = SDL_JoystickGetAxis(j, 2) * k;
  return 1;
}
