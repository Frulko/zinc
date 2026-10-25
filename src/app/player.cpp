// Zinc Go, the player (ZN-631, docs/reports/zinc-next-zinc-go.md): an app that runs a project's code straight from `zinc dev --lan` on the
// developer's machine, as Expo Go runs a project from `expo start`. The app's own program is its home screen (examples/zinc-go, bytecode in
// the package: zinc/home.unit); a zinc:// link (the home screen's QR scan or typed URL, a deep link, `adb shell am start -d`, `xcrun simctl
// openurl`) connects to zinc dev, which sends the project compiled in hot mode for this phone's profile; the interpreter runs it, and each
// save on the desktop sends the program again, swapped in place by Fast Refresh (src/dev/hot_swap.cpp: same machine, state kept) or started
// again when the swap cannot be done. The dev menu (a shake, a three-finger long press, the Menu key): reload, back home.
//
// The protocol, one TCP connection, lines and length-prefixed blobs:
//   player: zinc-go 1 <token> <profile> <device>            zinc dev: unit <n>\n<n bytes>   (hot::save)    or  no <why>
//   player: started | ok <ms> <modules> | restart <why> | missing <plugin> | ended <status> | log <n>\n<n bytes> | reload
//   zinc dev: error <n>\n<the diagnostics>   (a save that does not compile: the program keeps running)
// Linked into a player's package only (zinc.json "player": true); a user's own app has none of it (tests/t0/app_library.sh, `nm`).
//
// Agent mode (ZN-792, docs/reports/device-player-consoles-mobiles.md step 8): the player is also a device of `zinc device`, as a console
// player is. src/agent/player.cpp serves the agent's protocol on port 7733 (pairing with the code the home screen shows, TLS sessions),
// polled from the tick; `zinc device deploy` installs the members of `zinc pack --profile android|ios` and runs program.zbc here, its lines go
// back as the app's log, `stop` goes back home. mDNS announces it (src/net/dnssd.cpp; Android takes the Wi-Fi MulticastLock for it; iOS
// later through DNSServiceRegister). On by default on a phone; on a desktop only with ZINC_PLAYER_PORT (tests: 0 takes any port).
#include <SDL3/SDL.h>
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/in.h>
#include <netinet/tcp.h>
#include <poll.h>
#include <signal.h>
#include <sys/socket.h>
#include <sys/utsname.h>
#include <unistd.h>
#ifdef __APPLE__
#include <TargetConditionals.h>
#endif

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <string>
#include <thread>
#include <vector>

#include "agent/player.h"
#include "agent/wire.h"
#include "app/app_core.h"
#include "dev/hot.h"
#include "host/assets_host.h"
#if !(defined(__APPLE__) && TARGET_OS_IPHONE)
#include "net/dnssd.h"
#define PLAYER_MDNS 1
#else
#include <dns_sd.h>   // iOS: the system's Bonjour (raw multicast sockets need an entitlement Apple grants on request)
#endif
#include "zn/app.h"
#include "zn/host.h"
#include "zn/hostsys.h"
#include "zn/native.h"
#include <mbedtls/base64.h>
#ifdef __ANDROID__
#include <jni.h>
#include <sys/system_properties.h>
#endif
#ifdef ZN_VERSION
static const char* const kVersion = ZN_VERSION;
#else
static const char* const kVersion = "0.0.0-dev";
#endif

extern "C" void zn_hal_sdl_resignal(void);   // targets/macos/hal_sdl.cpp
// The package's plugins, registered: zinc export writes the strong definition beside the player; a player without plugins (tests) keeps this one
extern "C" __attribute__((weak)) void zn_player_modules(void) {}
// ... and their plugins' names, comma-separated (what `zinc device` checks a program's native plugins against)
extern "C" __attribute__((weak)) const char* zn_player_plugins(void) { return ""; }
extern "C" void hal_free(void* p);
namespace zrt::gfx { std::uint8_t* capture_png(std::size_t* n, std::int32_t maxw, std::int32_t maxh); }   // runtime/gfx.cpp: the frame on screen

namespace {

namespace hot = zn::dev::hot;
using Clock = std::chrono::steady_clock;

#ifdef __ANDROID__
const char* kProfile = "android";
#elif defined(__APPLE__) && TARGET_OS_IPHONE
const char* kProfile = "ios";
#elif defined(__APPLE__)
const char* kProfile = "macos";
#elif defined(_WIN32)
const char* kProfile = "windows";
#else
const char* kProfile = "linux";
#endif

std::unique_ptr<hot::Unit> gHome;   // the home screen
std::unique_ptr<hot::Unit> gCur;    // the program that runs: its zbc is the machine's code
bool gRemote = false;               // gCur came from zinc dev
std::string gMessage;               // for the home screen: why it is shown (a missing plugin, a lost connection)

// agent mode (ZN-792): the server, the run it asked for, the run that runs
zn::agent::Player gAgent;
bool gAgentOn = false;
struct AgentRun { std::string app, dir; std::vector<std::string> args; zn::agent::Env env; long long pid = 0; };
AgentRun gAgentNext;
std::string gOpening, gOpeningTitle;   // an app of this phone about to start (zinc://open): the home screen shows its name and a loader first
int gOpeningFrames = 0;
bool gAgentPending = false, gAgentRunning = false, gAgentStop = false;
std::string gAgentPacks;            // the packs/ of the program that runs, mounted in front
std::string gAgentShown;            // what the home screen shows of the agent: it starts again when this changes
#ifdef PLAYER_MDNS
zn::dnssd::Responder gMdns;
#else
DNSServiceRef gBonjour = nullptr;
#endif

// ---- the connection to zinc dev

struct Link {
  std::string url, host, token;
  int port = 0;
  int fd = -1;
  bool connected = false;
  Clock::time_point since;
  std::string in, out;
  bool fresh = false;      // the next unit starts the program anew (a reload asked from the menu)
};
Link gLink;
std::string gReply;                  // sent after the next tick: the first frame of new code ran
Clock::time_point gGot;              // when the unit being started or swapped arrived

void sendLine(const std::string& s) { gLink.out += s; }

void flushOut() {
  while (gLink.connected && !gLink.out.empty()) {
    const ssize_t n = ::send(gLink.fd, gLink.out.data(), gLink.out.size(), 0);
    if (n <= 0) return;
    gLink.out.erase(0, static_cast<std::size_t>(n));
  }
}

void consoleTap(const char* p, std::size_t n, bool) {
  if (gRemote && gLink.connected) sendLine("log " + std::to_string(n) + "\n" + std::string(p, n));
  if (gAgentRunning) zn::agent::playerOutput(gAgent, std::string(p, n) + "\n");
}

// zinc://host:port/token
bool parseUrl(const std::string& url, Link& l) {
  if (url.rfind("zinc://", 0) != 0) return false;
  std::string rest = url.substr(7);
  const std::size_t slash = rest.find('/');
  const std::string hp = rest.substr(0, slash);
  l.token = slash == std::string::npos ? "" : rest.substr(slash + 1);
  while (!l.token.empty() && (l.token.back() == '/' || l.token.back() == '\n')) l.token.pop_back();
  const std::size_t colon = hp.rfind(':');
  l.host = colon == std::string::npos ? hp : hp.substr(0, colon);
  l.port = colon == std::string::npos ? 8090 : std::atoi(hp.c_str() + colon + 1);
  l.url = url;
  return !l.host.empty() && l.port > 0 && l.port < 65536;
}

void closeLink() {
  if (gLink.fd >= 0) ::close(gLink.fd);
  gLink.fd = -1;
  gLink.connected = false;
  gLink.in.clear();
  gLink.out.clear();
}

// The last link opened, kept for the home screen's "open again" (the app's own files: the working directory on a phone)
std::string lastUrl() {
  size_t n = 0;
  char* b = static_cast<char*>(SDL_LoadFile("zinc-go.last", &n));
  std::string s = b ? std::string(b, n) : "";
  SDL_free(b);
  return s;
}

void startHome();
void goHome(const std::string& why);

bool openLink(const std::string& url) {
  Link l;
  if (!parseUrl(url, l)) { gMessage = "Not a Zinc link: " + url + " (zinc dev --lan prints one: zinc://host:port/code)"; return false; }
  closeLink();
  addrinfo hints{}, *res = nullptr;
  hints.ai_family = AF_INET;
  hints.ai_socktype = SOCK_STREAM;
  if (getaddrinfo(l.host.c_str(), std::to_string(l.port).c_str(), &hints, &res) != 0 || !res) { gMessage = "Cannot find " + l.host; return false; }
  l.fd = ::socket(res->ai_family, SOCK_STREAM, 0);
  if (l.fd < 0) { freeaddrinfo(res); gMessage = "No network"; return false; }
  fcntl(l.fd, F_SETFL, fcntl(l.fd, F_GETFL) | O_NONBLOCK);
  const int one = 1;
  setsockopt(l.fd, IPPROTO_TCP, TCP_NODELAY, &one, sizeof one);
#ifdef SO_NOSIGPIPE
  setsockopt(l.fd, SOL_SOCKET, SO_NOSIGPIPE, &one, sizeof one);
#endif
  const int rc = ::connect(l.fd, res->ai_addr, res->ai_addrlen);
  freeaddrinfo(res);
  if (rc != 0 && errno != EINPROGRESS) { ::close(l.fd); gMessage = "Cannot reach " + l.host + ":" + std::to_string(l.port) + " (is zinc dev --lan running?)"; return false; }
  l.since = Clock::now();
  gLink = std::move(l);
  SDL_SaveFile("zinc-go.last", url.data(), url.size());
  std::fprintf(stderr, "zinc go: connecting to %s:%d\n", gLink.host.c_str(), gLink.port);
  return true;
}

// ---- programs

bool installUnit(const hot::Unit& u) {
  if (!u.resources.empty()) zn::host::installResources(u.resources.data(), u.resources.size());
  return true;
}

// The plugin of the first native module this player lacks, empty when it has them all
std::string missingPlugin(const hot::Unit& u) {
  for (const zn::zbc::Native& nt : u.zbc.natives) {
    if (zn_native_has_module(nt.module.c_str())) continue;
    for (const std::string& p : u.plugins) if (p.rfind(nt.module + " ", 0) == 0) return p.substr(nt.module.size() + 1);
    return nt.module;
  }
  return "";
}

int run(std::unique_ptr<hot::Unit> u, bool remote, const std::vector<std::string>& args) {
  gCur = std::move(u);
  gRemote = remote;
  installUnit(*gCur);
  zn::host::setProgramArgs(args);
  zn_hal_sdl_resignal();   // the window is the last program's: the new one hears its theme and safe area
  return zn::rt::appStart({}, &gCur->zbc, nullptr, 0);
}

// ---- agent mode (ZN-792): zinc device pair / deploy / run / stop / logs / shot on this phone

#ifdef __ANDROID__
std::string sysProp(const char* name) { char v[PROP_VALUE_MAX] = ""; __system_property_get(name, v); return v; }
// The Wi-Fi's MulticastLock while the player listens: without it Android drops the multicast questions mDNS answers (ZincActivity.zincMulticast)
void multicastLock(bool on) {
  JNIEnv* env = static_cast<JNIEnv*>(SDL_GetAndroidJNIEnv());
  if (!env || env->PushLocalFrame(8) != 0) return;
  if (jobject act = static_cast<jobject>(SDL_GetAndroidActivity())) {
    if (jmethodID m = env->GetMethodID(env->GetObjectClass(act), "zincMulticast", "(Z)V")) env->CallVoidMethod(act, m, static_cast<jboolean>(on));
    if (env->ExceptionCheck()) env->ExceptionClear();
  }
  env->PopLocalFrame(nullptr);
}
#endif

// The address the workstation reaches this phone at: the one the default route leaves from (a UDP connect sends nothing)
std::string localAddress() {
  const int fd = ::socket(AF_INET, SOCK_DGRAM, 0);
  sockaddr_in to{}, me{};
  to.sin_family = AF_INET;
  to.sin_port = htons(53);
  to.sin_addr.s_addr = inet_addr("192.0.2.1");   // TEST-NET-1: any routable address names the default route
  socklen_t n = sizeof me;
  std::string out = "127.0.0.1";
  if (fd >= 0 && ::connect(fd, reinterpret_cast<sockaddr*>(&to), sizeof to) == 0 && ::getsockname(fd, reinterpret_cast<sockaddr*>(&me), &n) == 0 && me.sin_addr.s_addr)
    out = inet_ntoa(me.sin_addr);
  if (fd >= 0) ::close(fd);
  return out;
}

void agentOpen() {
  const char* port = std::getenv("ZINC_PLAYER_PORT");
#if !defined(__ANDROID__) && !(defined(__APPLE__) && TARGET_OS_IPHONE)
  if (!port || !*port) return;   // a desktop player (tests) serves only when asked
#endif
  if (const char* off = std::getenv("ZINC_GO_AGENT"); off && std::strcmp(off, "0") == 0) return;
  ::signal(SIGPIPE, SIG_IGN);   // a workstation that leaves mid-answer is an error of that send, not the end of the app
  zn::agent::Player& p = gAgent;
  if (const char* h = std::getenv("ZINC_PLAYER_HOME"); h && *h) p.home = h;
  else if (char* pref = SDL_GetPrefPath("zinc", "player")) { p.home = pref; SDL_free(pref); }   // the app's own files
  while (p.home.size() > 1 && p.home.back() == '/') p.home.pop_back();
  if (p.home.empty()) p.home = ".";
  p.os = p.profile = kProfile;
  struct utsname u{};
  ::uname(&u);
  p.arch = u.machine;
#if defined(__aarch64__)
  p.arch = "arm64";
#elif defined(__arm__)
  p.arch = "armv7";
#elif defined(__x86_64__)
  p.arch = "x86_64";
#endif
#ifdef __ANDROID__
  p.kind = sysProp("ro.product.manufacturer") + " " + sysProp("ro.product.model");
  p.osVersion = "Android " + sysProp("ro.build.version.release");
#else
  p.kind = SDL_GetPlatform();
  p.osVersion = u.release;
#endif
  p.engine = kVersion;
  p.address = localAddress();
  for (std::string list = zn_player_plugins(); !list.empty();) {
    const std::size_t c = list.find(',');
    if (c) p.plugins.push_back(list.substr(0, c));
    list = c == std::string::npos ? "" : list.substr(c + 1);
  }
  if (const char* v = std::getenv("ZINC_PLAYER_NAME"); v && *v) p.name = v;
  if (port && *port) p.port = std::atoi(port);
  if (const char* v = std::getenv("ZINC_PLAYER_BIND"); v && *v) p.bind = v;
  if (const char* v = std::getenv("ZINC_PLAYER_CODE"); v && *v) p.fixedCode = v;
  p.run = [](const std::string& app, const std::string& dir, const std::vector<std::string>& args, const zn::agent::Env& env, long long pid) {
    gAgentNext = AgentRun{app, dir, args, env, pid};
    gAgentPending = true;
  };
  p.stop = [] { gAgentStop = true; };
  p.shot = [](std::string& png) {
    if (!zn::rt::appMachine()) return false;
    std::size_t n = 0;
    std::uint8_t* b = zrt::gfx::capture_png(&n, 0, 0);
    if (!b) return false;
    png.assign(reinterpret_cast<const char*>(b), n);
    hal_free(b);
    return true;
  };
  std::string err;
  if (!zn::agent::playerOpen(p, err)) { std::fprintf(stderr, "zinc go: no device mode: %s\n", err.c_str()); return; }
  gAgentOn = true;
  std::fprintf(stderr, "zinc player: %s listening on %s:%d%s%s\n", p.name.c_str(), p.address.c_str(), p.port, p.code.empty() ? "" : ", pairing code: ", p.code.c_str());
#ifdef PLAYER_MDNS
#ifdef __ANDROID__
  multicastLock(true);
#endif
  const std::string id = p.id, os = p.os, kind = p.kind;
  if (!gMdns.open(zn::agent::kService, p.name, p.port, p.bind, [id, os, kind] {
        return zn::dnssd::Txt{{"id", id}, {"v", "1"}, {"os", os}, {"kind", kind}, {"pair", zn::agent::playerPairing(gAgent) ? "1" : "0"}};
      }))
    std::fprintf(stderr, "zinc go: no multicast here: pair with the address (zinc device pair %s %s)\n", p.address.c_str(), p.code.c_str());
#else
  TXTRecordRef txt;   // ponytail: the pairing flag of the moment it starts; zinc device pair takes the address the list gives either way
  TXTRecordCreate(&txt, 0, nullptr);
  const auto put = [&](const char* k, const std::string& v) { TXTRecordSetValue(&txt, k, static_cast<uint8_t>(v.size()), v.data()); };
  put("id", p.id); put("v", "1"); put("os", p.os); put("kind", p.kind); put("pair", zn::agent::playerPairing(p) ? "1" : "0");
  if (DNSServiceRegister(&gBonjour, 0, 0, p.name.c_str(), "_zinc._tcp", nullptr, nullptr, htons(static_cast<uint16_t>(p.port)), TXTRecordGetLength(&txt),
                         TXTRecordGetBytesPtr(&txt), nullptr, nullptr) != kDNSServiceErr_NoError)
    std::fprintf(stderr, "zinc go: Bonjour refused the announce: pair with the address (zinc device pair %s %s)\n", p.address.c_str(), p.code.c_str());
  TXTRecordDeallocate(&txt);
#endif
}

// What the home screen shows of the device mode: its args (the home starts again when they change: a pairing, a new code)
std::vector<std::string> agentArgs() {
  if (!gAgentOn) return {};
  const zn::agent::Player& p = gAgent;
  const std::string where = p.address + (p.port == zn::agent::kPort ? "" : ":" + std::to_string(p.port));
  std::vector<std::string> a = {"--device", p.name, "--address", where};
  if (zn::agent::playerPairing(gAgent)) { a.push_back("--code"); a.push_back(p.code); }
  if (!p.paired.empty()) { a.push_back("--paired"); a.push_back(p.paired); }
  return a;
}
std::string agentKey() { std::string k; for (const std::string& s : agentArgs()) k += s + "\n"; return k; }

// The run of the agent ended: its status in its log and to the sessions that follow it
void agentEnded(int status) {
  gAgentRunning = false;
  gAgentStop = false;
  zn::rt::gExitEndsRun = false;
  zn::agent::playerExited(gAgent, status);
}

// The members zinc device installed in `dir` (program.zbc, resources.bin, packs/*.zpk), started as the program of this player
void agentStart(const AgentRun& r) {
  if (gAgentRunning) agentEnded(zn::rt::appFinish());   // the one that runs (the player said it is replaced)
  if (gRemote || gLink.fd >= 0) { closeLink(); gRemote = false; }                    // a zinc dev --lan session gives way
  zn::agent::playerStarted(gAgent, r.app, r.pid);
  gAgentRunning = true;
  const auto fail = [](const std::string& why) { zn::agent::playerOutput(gAgent, "zinc go: " + why + "\n"); agentEnded(1); startHome(); };
  size_t n = 0;
  void* b = SDL_LoadFile((r.dir + "/program.zbc").c_str(), &n);
  if (!b) { fail("cannot read " + r.dir + "/program.zbc"); return; }
  std::vector<std::uint8_t> bytes(static_cast<std::uint8_t*>(b), static_cast<std::uint8_t*>(b) + n);
  SDL_free(b);
  zn::zbc::Module m;
  std::string err;
  if (!zn::zbc::decode(bytes, m, err) || !(err = zn::zbc::verify(m)).empty()) { fail("program.zbc: " + err); return; }
  for (const zn::zbc::Native& nt : m.natives)
    if (!zn_native_has_module(nt.module.c_str())) { fail("this program needs the native module " + nt.module + ", which this Zinc Go does not have"); return; }
  if (void* res = SDL_LoadFile((r.dir + "/resources.bin").c_str(), &n)) { zn::host::installResources(static_cast<const std::uint8_t*>(res), n); SDL_free(res); }
  if (!gAgentPacks.empty()) zn::host::assets::unmount(gAgentPacks);
  gAgentPacks.clear();
  if (zn::host::assets::mount(r.dir + "/packs", err) > 0) gAgentPacks = r.dir + "/packs";
  for (const auto& [k, v] : r.env) ::setenv(k.c_str(), v.c_str(), 1);
  zn::host::setProgramArgs(r.args);
  zn::rt::gExitEndsRun = true;   // zinc:sys exit ends the program, not the player
  zn_hal_sdl_resignal();
  const int rc = zn::rt::appStart(std::move(m), nullptr, nullptr, 0);
  if (rc != 0) { agentEnded(zn::rt::appFinish()); startHome(); }   // done at its top level (a program without frames), or failed
}

// From the tick: the server served, a run asked for started, a stop done
void agentPoll() {
  if (!gAgentOn) return;
  zn::agent::playerPoll(gAgent);
#ifdef PLAYER_MDNS
  gMdns.serve();
#endif
  if (gAgentPending) { gAgentPending = false; agentStart(gAgentNext); return; }
  if (gAgentStop && gAgentRunning) { startHome(); return; }   // startHome ends it
  gAgentStop = false;
  if (!gAgentRunning && !gRemote && agentKey() != gAgentShown) startHome();   // the home screen shows the new code, or who paired
}

// ---- a shortcut on the phone's home screen (zinc://shortcut/<app>): a Web Clip whose link is zinc://open/<app> ----
// iOS lets no app put an icon on the home screen, but a configuration profile can: the player writes one (the app's title and zinc.json
// app.icon), serves it once on the loopback and hands its address to Safari, which offers to install it (Settings > Profile Downloaded).
// The clip opens zinc://open/<app>: Zinc Go comes up on that app, its splash first. No paid account, no web site.
std::string xmlText(const std::string& v) {
  std::string o;
  for (const char ch : v) o += ch == '&' ? "&amp;" : ch == '<' ? "&lt;" : ch == '>' ? "&gt;" : std::string(1, ch);
  return o;
}
std::string uuid() {
  char b[37];
  std::snprintf(b, sizeof b, "%08X-%04X-4%03X-A%03X-%04X%08X", static_cast<unsigned>(SDL_rand_bits()), SDL_rand_bits() & 0xFFFF, SDL_rand_bits() & 0xFFF,
                SDL_rand_bits() & 0xFFF, SDL_rand_bits() & 0xFFFF, static_cast<unsigned>(SDL_rand_bits()));
  return b;
}
std::string webClip(const std::string& name, const std::string& title, const std::string& iconPng) {
  std::string icon;
  if (!iconPng.empty()) {
    std::size_t n = 0;
    mbedtls_base64_encode(nullptr, 0, &n, reinterpret_cast<const unsigned char*>(iconPng.data()), iconPng.size());
    icon.resize(n);
    if (mbedtls_base64_encode(reinterpret_cast<unsigned char*>(icon.data()), n, &n, reinterpret_cast<const unsigned char*>(iconPng.data()), iconPng.size()) == 0) icon.resize(n);
    else icon.clear();
  }
  const std::string id = "dev.zinc.go.clip." + name;
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n"
         "<plist version=\"1.0\"><dict>\n<key>PayloadContent</key><array><dict>\n"
         "<key>PayloadType</key><string>com.apple.webClip.managed</string><key>PayloadVersion</key><integer>1</integer>\n"
         "<key>PayloadIdentifier</key><string>" + id + ".clip</string><key>PayloadUUID</key><string>" + uuid() + "</string>\n"
         "<key>Label</key><string>" + xmlText(title) + "</string><key>URL</key><string>zinc://open/" + xmlText(name) + "</string>\n"
         "<key>FullScreen</key><true/><key>IsRemovable</key><true/><key>Precomposed</key><true/>\n" +
         (icon.empty() ? "" : "<key>Icon</key><data>" + icon + "</data>\n") +
         "</dict></array>\n<key>PayloadType</key><string>Configuration</string><key>PayloadVersion</key><integer>1</integer>\n"
         "<key>PayloadIdentifier</key><string>" + id + "</string><key>PayloadUUID</key><string>" + uuid() + "</string>\n"
         "<key>PayloadDisplayName</key><string>" + xmlText(title) + " (Zinc Go)</string>\n"
         "<key>PayloadDescription</key><string>Puts " + xmlText(title) + " on the home screen: it opens in Zinc Go.</string>\n"
         "<key>PayloadRemovalDisallowed</key><false/></dict></plist>\n";
}
// Serves `body` to the first request on 127.0.0.1 (a thread: Safari asks while Zinc Go is in the background), for one minute at most; the
// address to open, empty when no port could be had. ponytail: one request, one file; the clip of another app is another call.
std::string serveOnce(const std::string& file, std::string body) {
  const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) return "";
  sockaddr_in a{};
  a.sin_family = AF_INET;
  a.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  socklen_t len = sizeof a;
  if (::bind(fd, reinterpret_cast<sockaddr*>(&a), sizeof a) != 0 || ::listen(fd, 2) != 0 || ::getsockname(fd, reinterpret_cast<sockaddr*>(&a), &len) != 0) { ::close(fd); return ""; }
  std::thread([fd, body = std::move(body)] {
    pollfd p{fd, POLLIN, 0};
    for (int served = 0; served < 2 && ::poll(&p, 1, 60000) > 0;) {   // Safari may ask twice (a probe, then the download)
      const int c = ::accept(fd, nullptr, nullptr);
      if (c < 0) break;
      char req[2048];
      (void)::recv(c, req, sizeof req, 0);
      const std::string head = "HTTP/1.1 200 OK\r\nContent-Type: application/x-apple-aspen-config\r\nContent-Length: " + std::to_string(body.size()) + "\r\nConnection: close\r\n\r\n";
      (void)::send(c, head.data(), head.size(), 0);
      (void)::send(c, body.data(), body.size(), 0);
      ::close(c);
      ++served;
    }
    ::close(fd);
  }).detach();
  return "http://127.0.0.1:" + std::to_string(ntohs(a.sin_port)) + "/" + file;
}
#if defined(__APPLE__) && TARGET_OS_IPHONE
extern "C" void zn_ios_keep_running(int seconds);   // ios_glue.mm: Safari asks while Zinc Go is in the background
#endif
void addShortcut(const std::string& name) {
  std::string title, project, icon;
  if (gAgentOn) for (const auto& [n, t] : zn::agent::playerApps(gAgent)) if (n == name) title = t;
  if (title.empty()) { goHome("No app named " + name + " on this phone"); return; }
  const std::string dir = gAgent.home + "/apps/" + name;
  if (size_t n = 0; void* b = SDL_LoadFile((dir + "/zinc.json").c_str(), &n)) { project.assign(static_cast<const char*>(b), n); SDL_free(b); }
  for (const auto& [k, v] : zn::agent::Doc(project.empty() ? "{}" : project).pairs("app"))   // app.icon, a PNG the pack carried
    if (k == "icon" && v.find("..") == std::string::npos && v.size() > 4 && v.compare(v.size() - 4, 4, ".png") == 0)
      if (size_t n = 0; void* b = SDL_LoadFile((dir + "/" + v).c_str(), &n)) { icon.assign(static_cast<const char*>(b), n); SDL_free(b); }
  const std::string url = serveOnce(name + ".mobileconfig", webClip(name, title, icon));
#if defined(__APPLE__) && TARGET_OS_IPHONE
  if (!url.empty()) zn_ios_keep_running(60);
#endif
  if (url.empty() || !SDL_OpenURL(url.c_str())) { goHome("Could not hand the shortcut of " + title + " to Safari"); return; }
  gMessage = "Safari has the shortcut of " + title + ": allow the download, then Settings > Profile Downloaded > Install. Its icon opens it in Zinc Go.";
  startHome();
}

void startHome() {
  if (gAgentRunning) agentEnded(zn::rt::appFinish());   // the program zinc device sent gives the screen back
  gAgentShown = agentKey();
  if (!gHome) {   // a player without one (the desktop test's): the message, and nothing runs
    std::fprintf(stderr, "zinc go: %s\n", gMessage.empty() ? "no home screen in the package" : gMessage.c_str());
    gMessage.clear();
    if (zn::rt::appMachine()) zn::rt::appFinish();
    gRemote = false;
    return;
  }
  auto home = std::make_unique<hot::Unit>(*gHome);
  std::vector<std::string> args;
  if (!gMessage.empty()) args = {"--message", gMessage};
  const std::string last = lastUrl();
  if (!last.empty()) { args.push_back("--last"); args.push_back(last); }
  if (gLink.fd >= 0) { args.push_back("--connecting"); args.push_back(gLink.url); }
  for (const std::string& a : agentArgs()) args.push_back(a);
  if (gAgentOn) for (const auto& [name, title] : zn::agent::playerApps(gAgent)) { args.push_back("--app"); args.push_back(name + "\t" + title); }   // the tiles
  if (!gOpening.empty()) { args.push_back("--opening"); args.push_back(gOpeningTitle); }
  if (!gMessage.empty()) std::fprintf(stderr, "zinc go: %s\n", gMessage.c_str());
  gMessage.clear();
  if (run(std::move(home), false, args) != 0) std::fprintf(stderr, "zinc go: the home screen did not start\n");
}

void goHome(const std::string& why) {
  gMessage = why;
  closeLink();
  startHome();
}

// A program from zinc dev: the first one starts; the next ones are swapped in place when Fast Refresh can, else started again
void takeUnit(const std::uint8_t* p, std::size_t n) {
  gGot = Clock::now();   // what the device spends: reading the unit (zstd, decode, verify), the swap, the first frame
  auto u = std::make_unique<hot::Unit>();
  std::string err;
  if (!hot::load(p, n, *u, err)) { goHome("zinc dev sent a program this player cannot read: " + err); return; }
  if (const std::string plugin = missingPlugin(*u); !plugin.empty()) {   // the home screen says so; the link stays, and a save without it runs
    sendLine("missing " + plugin + "\n");
    gMessage = "This program needs the plugin \"" + plugin + "\", which this Zinc Go does not have. Build your own player with it: zinc export --target " +
               std::string(kProfile) + " of a project with \"player\": true and the plugin.";
    startHome();
    return;
  }
  zn::rt::Machine* m = zn::rt::appMachine();
  if (gRemote && m && !gLink.fresh) {
    std::vector<std::string> reeval, changed;
    std::string why = hot::plan(*gCur, *u, reeval, changed);
    if (why.empty()) {
      why = hot::swap(*m, *gCur, *u, reeval, changed);
      if (why.empty()) {
        std::swap(gCur, u);   // the machine runs the new code now; the old unit goes
        if (!zn::rt::appCodeChanged(gCur->zbc)) why = "the new code has no event loop";
        else {
          const std::uint32_t loop = hot::keyIndex(gCur->functions, "<prelude>::__runLoop");   // an app's: drains the jobs the inits queued
          if (loop != UINT32_MAX) m->exec(&m->funcs[loop], m->stack);
          gReply = "ok";
          for (const std::string& r : reeval) gReply += " " + r;
          return;
        }
        u = std::make_unique<hot::Unit>();   // what failed was the swap of the code that now runs: load it again to start it
        if (!hot::load(p, n, *u, err)) { goHome(err); return; }
      }
    }
    sendLine("restart " + why + "\n");
    std::fprintf(stderr, "zinc go: restart: %s\n", why.c_str());
  }
  gLink.fresh = false;
  gReply = "started";
  if (run(std::move(u), true, {}) < 0) goHome("The program did not start (its first error is in the log)");
}

// Reads what zinc dev sent: whole messages only
void pollLink() {
  if (gLink.fd < 0) return;
  if (!gLink.connected) {
    pollfd pf{gLink.fd, POLLOUT, 0};
    if (::poll(&pf, 1, 0) <= 0) {
      if (Clock::now() - gLink.since > std::chrono::seconds(8)) goHome("Cannot reach " + gLink.host + ":" + std::to_string(gLink.port) + " (is zinc dev --lan running, on this network?)");
      return;
    }
    int e = 0;
    socklen_t len = sizeof e;
    getsockopt(gLink.fd, SOL_SOCKET, SO_ERROR, &e, &len);
    if (e) { goHome("Cannot reach " + gLink.host + ":" + std::to_string(gLink.port) + ": " + std::strerror(e)); return; }
    gLink.connected = true;
    sendLine(std::string("zinc-go 1 ") + (gLink.token.empty() ? "-" : gLink.token) + " " + kProfile + " " + SDL_GetPlatform() + "\n");
  }
  char buf[65536];
  bool ended = false;   // what came before the end is read first (zinc dev's `no <why>`)
  for (;;) {
    const ssize_t n = ::recv(gLink.fd, buf, sizeof buf, 0);
    if (n > 0) { gLink.in.append(buf, static_cast<std::size_t>(n)); continue; }
    ended = n == 0 || (errno != EAGAIN && errno != EWOULDBLOCK && errno != EINTR);
    break;
  }
  for (;;) {
    const std::size_t nl = gLink.in.find('\n');
    if (nl == std::string::npos) {
      if (ended) goHome("zinc dev stopped (the connection to " + gLink.host + " ended)");
      return;
    }
    const std::string line = gLink.in.substr(0, nl);
    if (line.rfind("unit ", 0) == 0 || line.rfind("error ", 0) == 0) {
      const std::size_t size = std::strtoull(line.c_str() + line.find(' ') + 1, nullptr, 10);
      if (gLink.in.size() < nl + 1 + size) return;   // the rest is on its way
      const std::string body = gLink.in.substr(nl + 1, size);
      gLink.in.erase(0, nl + 1 + size);
      if (line[0] == 'u') takeUnit(reinterpret_cast<const std::uint8_t*>(body.data()), body.size());
      else std::fprintf(stderr, "zinc go: the save does not compile; the program keeps running:\n%s\n", body.c_str());
      if (gLink.fd < 0) return;   // gone home
      continue;
    }
    gLink.in.erase(0, nl + 1);
    if (line.rfind("no ", 0) == 0) { goHome("zinc dev refused: " + line.substr(3)); return; }
  }
}

// ---- links: deep links (Android's intent, iOS's openURL as a dropped file) and the home screen's own (it opens zinc:// with zinc:system)

std::string gPendingUrl;

#ifdef __ANDROID__
jobject gLastIntent = nullptr;
// Called every tick: every local reference it makes lives in its own frame, popped at the end (a leaked GetObjectClass a tick filled
// Android 7's table of 512 local references in about 8 s and aborted the app on a Nexus 7).
static void pollIntentIn(JNIEnv* env);
void pollIntent() {
  JNIEnv* env = static_cast<JNIEnv*>(SDL_GetAndroidJNIEnv());
  if (!env || env->PushLocalFrame(16) != 0) return;
  pollIntentIn(env);
  env->PopLocalFrame(nullptr);
}
static void pollIntentIn(JNIEnv* env) {
  jobject act = static_cast<jobject>(SDL_GetAndroidActivity());
  if (!act) return;
  jobject intent = env->CallObjectMethod(act, env->GetMethodID(env->GetObjectClass(act), "getIntent", "()Landroid/content/Intent;"));
  if (intent && (!gLastIntent || !env->IsSameObject(intent, gLastIntent))) {
    if (gLastIntent) env->DeleteGlobalRef(gLastIntent);
    gLastIntent = env->NewGlobalRef(intent);
    jstring s = static_cast<jstring>(env->CallObjectMethod(intent, env->GetMethodID(env->GetObjectClass(intent), "getDataString", "()Ljava/lang/String;")));
    if (s) {
      const char* c = env->GetStringUTFChars(s, nullptr);
      if (std::strncmp(c, "zinc://", 7) == 0) gPendingUrl = c;
      env->ReleaseStringUTFChars(s, c);
      env->DeleteLocalRef(s);
    }
  }
  if (intent) env->DeleteLocalRef(intent);
  env->DeleteLocalRef(act);
}
#endif

// ---- the dev menu

int gFingers = 0;
Clock::time_point gFingersSince;
bool gMenuAsked = false;
double gShake = 0;

void devMenu() {
  const SDL_MessageBoxButtonData buttons[] = {
      {SDL_MESSAGEBOX_BUTTON_RETURNKEY_DEFAULT, 1, "Reload"},
      {0, 2, "Go home"},
      {SDL_MESSAGEBOX_BUTTON_ESCAPEKEY_DEFAULT, 0, "Cancel"},
  };
  const std::string text = gRemote ? gLink.url : "The home screen";
  const SDL_MessageBoxData box{SDL_MESSAGEBOX_INFORMATION, nullptr, "Zinc Go", text.c_str(), gRemote ? 3 : 1, gRemote ? buttons : buttons + 2, nullptr};
  int which = 0;
  if (!SDL_ShowMessageBox(&box, &which)) return;
  if (which == 1 && gRemote) { gLink.fresh = true; sendLine("reload\n"); std::fprintf(stderr, "zinc go: reload\n"); }
  if (which == 2) goHome("");
}

bool onEvent(const void* ev) {
  const SDL_Event& e = *static_cast<const SDL_Event*>(ev);
  if (e.type == SDL_EVENT_DROP_FILE && e.drop.data && std::strncmp(e.drop.data, "zinc://", 7) == 0) { gPendingUrl = e.drop.data; return true; }   // iOS's openURL
  if (e.type == SDL_EVENT_KEY_DOWN && (e.key.key == SDLK_MENU || (e.key.key == SDLK_D && (e.key.mod & SDL_KMOD_GUI)))) { gMenuAsked = true; return true; }   // Android's Menu (adb shell input keyevent 82), Cmd+D in a simulator
  if (e.type == SDL_EVENT_FINGER_DOWN && ++gFingers == 3) gFingersSince = Clock::now();
  if (e.type == SDL_EVENT_FINGER_UP || e.type == SDL_EVENT_FINGER_CANCELED) gFingers = gFingers > 0 ? gFingers - 1 : 0;
  if (e.type == SDL_EVENT_SENSOR_UPDATE) {   // the accelerometer: a shake is three swings above 2.5 g in a second
    const float* d = e.sensor.data;
    const double g = std::sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) / SDL_STANDARD_GRAVITY;
    gShake = gShake * 0.9 + (g > 2.5 ? 1 : 0);
    if (gShake > 2.5) { gShake = 0; gMenuAsked = true; }
  }
  return false;
}

int tick() {
#ifdef __ANDROID__
  static int n = 0;
  if (++n % 15 == 1) pollIntent();
#endif
  if (!gPendingUrl.empty()) {
    const std::string url = std::move(gPendingUrl);
    gPendingUrl.clear();
    if (url == "zinc://pair") { if (gAgentOn) zn::agent::playerNewCode(gAgent); }   // the home screen's "New pairing code": agentPoll shows it
    else if (url.rfind("zinc://open/", 0) == 0) {   // a tile of the home screen or a shortcut: an app zinc device sent, started again here
      const std::string name = url.substr(12);
      gOpeningTitle.clear();
      if (gAgentOn) for (const auto& [n, title] : zn::agent::playerApps(gAgent)) if (n == name) gOpeningTitle = title;
      if (gOpeningTitle.empty()) goHome("No app named " + name + " on this phone");
      else { gOpening = name; gOpeningFrames = 3; startHome(); }   // its splash for a few frames, then it starts (below)
    } else if (url.rfind("zinc://shortcut/", 0) == 0) addShortcut(url.substr(16));
    else if (url.rfind("zinc://delete/", 0) == 0) {
      if (gAgentOn) zn::agent::playerRemove(gAgent, url.substr(14));
      startHome();
    } else if (openLink(url)) startHome();   // the home screen says it is connecting until the program comes
    else goHome(gMessage);
  }
  pollLink();
  agentPoll();
  if (gFingers >= 3 && Clock::now() - gFingersSince > std::chrono::milliseconds(800)) { gFingers = 0; gMenuAsked = true; }
  if (gMenuAsked) { gMenuAsked = false; devMenu(); }
  if (!gOpening.empty() && (!zn::rt::appMachine() || --gOpeningFrames <= 0)) {   // its splash was drawn (or there is no home screen): the app replaces it
    const std::string name = std::move(gOpening);
    gOpening.clear();
    if (!zn::agent::playerLaunch(gAgent, name)) goHome("No app named " + name + " on this phone");
  }
  if (!zn::rt::appMachine()) {
    if (!gHome && gLink.fd < 0 && !gAgentOn) return 1;   // no home screen (a desktop test's player) and nothing to wait for: done
    flushOut();
    SDL_Delay(10);
    return 0;
  }
  const int rc = zn::rt::appTick();
  if (!gReply.empty()) {
    const auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - gGot).count();
    sendLine(gReply.rfind("ok", 0) == 0 ? "ok " + std::to_string(ms) + gReply.substr(2) + "\n" : gReply + " " + std::to_string(ms) + "\n");
    gReply.clear();
  }
  if (rc != 0 && gAgentRunning) { startHome(); flushOut(); return 0; }   // the program zinc device sent ended: its status in its log (agentEnded)
  if (rc != 0) {
    if (!gRemote) return rc;   // the home screen ended: the app ends
    sendLine("ended " + std::to_string(rc) + "\n");
    flushOut();
    goHome("The program ended" + std::string(rc < 0 ? " with an error (in the log)" : ""));
  }
  flushOut();
  return 0;
}

}  // namespace

// The player's entry: zn_app_init, as an AOT program's main would be. argv[1] or ZINC_GO_URL may be a zinc:// link; ZINC_GO_HOME the home
// screen's unit (else zinc/home.unit of the package: the APK's assets, the iOS bundle).
extern "C" int zn_app_init(int argc, char** argv) {
  zn::host::installGfx();
  zn::host::installLayout();
  zn::rt::gConsoleTap = consoleTap;
  zn_player_modules();
  zn::rt::gAppHooks.tick = tick;
  zn::rt::gAppHooks.event = onEvent;
  SDL_InitSubSystem(SDL_INIT_SENSOR);
  int count = 0;
  if (SDL_SensorID* ids = SDL_GetSensors(&count)) {
    for (int i = 0; i < count; ++i) if (SDL_GetSensorTypeForID(ids[i]) == SDL_SENSOR_ACCEL) { SDL_OpenSensor(ids[i]); break; }
    SDL_free(ids);
  }
  std::string homePath = std::getenv("ZINC_GO_HOME") ? std::getenv("ZINC_GO_HOME") : "zinc/home.unit";
#if defined(__APPLE__) && TARGET_OS_IPHONE
  if (!std::getenv("ZINC_GO_HOME")) homePath = std::string(SDL_GetBasePath()) + homePath;   // the bundle (the working directory is the app's data)
#endif
  size_t n = 0;
  if (void* b = SDL_LoadFile(homePath.c_str(), &n)) {
    gHome = std::make_unique<hot::Unit>();
    std::string err;
    if (!hot::load(static_cast<const std::uint8_t*>(b), n, *gHome, err)) { gMessage = "the home screen is damaged: " + err; gHome.reset(); }
    SDL_free(b);
  } else gMessage = "no home screen at " + homePath;
  std::string url = argc > 1 && std::strncmp(argv[1], "zinc://", 7) == 0 ? argv[1] : std::getenv("ZINC_GO_URL") ? std::getenv("ZINC_GO_URL") : "";
#ifdef __ANDROID__
  pollIntent();   // the link the app was started with
  if (url.empty()) url = gPendingUrl;
  gPendingUrl.clear();
#endif
  if (url.rfind("zinc://open/", 0) == 0 || url.rfind("zinc://delete/", 0) == 0) { gPendingUrl = url; url.clear(); }   // an app of this phone (a home screen shortcut): the tick starts it
  if (!url.empty() && !openLink(url)) url.clear();
  agentOpen();
  startHome();
  return 0;   // the player runs until the system ends it
}
