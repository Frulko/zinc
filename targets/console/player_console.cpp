// The console player's glue (ZN-792, docs/reports/device-player-consoles-mobiles.md): the agent's server of src/agent/player.cpp on the
// console's network, its files in the console's data directory, and the hooks the core and the HALs call. Single-threaded: the server is
// polled from the frames (zn_player_poll at the end of hal_poll_input), the waits (zn_player_wait_poll in host_console.cpp) and the waiting
// screen (core_main.cpp).
//
// Environment (built in with tools/build-console-core --env, or the host's for the headless build): ZINC_PLAYER_NAME, ZINC_PLAYER_PORT (7733;
// 0 any), ZINC_PLAYER_BIND (0.0.0.0), ZINC_PLAYER_CODE (a fixed pairing code: tests only), ZINC_PLAYER_PROFILE (the profile it says it has:
// tests of the host build), ZINC_PLAYER_HOME (its files; default the console's data directory).
#include "player_console.h"

#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "agent/player.h"
#include "hal.h"
#include "rt/rt.h"
#include "zn/host.h"

#ifdef ZN_CONSOLE_WITH_GFX
namespace zrt::gfx { std::uint8_t* capture_png(std::size_t* n, std::int32_t maxw, std::int32_t maxh); }   // runtime/gfx.cpp: the frame on screen
#endif

extern "C" const char* zn_console_data_dir(void);
// The network of the console (targets/<console>/net_<console>.cpp, ZN-791): 1 up (the address in addr), 0 still joining, -1 none (why).
// Weak here: a core without it (the headless host build) has the system's sockets already.
extern "C" __attribute__((weak)) int zn_console_net_up(char* addr, std::size_t addrSize, char*, std::size_t) {
  const char* a = std::getenv("ZINC_PLAYER_ADDR");
  std::snprintf(addr, addrSize, "%s", a && *a ? a : "127.0.0.1");
  return 1;
}

#ifndef ZN_CONSOLE_PLATFORM
#define ZN_CONSOLE_PLATFORM "console"
#endif
#ifndef ZN_CONSOLE_VERSION
#define ZN_CONSOLE_VERSION "0.0.0-dev"
#endif
#ifndef ZN_CONSOLE_KIND
#define ZN_CONSOLE_KIND ""
#endif
#ifndef ZN_CONSOLE_ARCH
#define ZN_CONSOLE_ARCH ""
#endif

namespace {
using zn::agent::Player;

Player gPlayer;
int gState = 0;            // 0 the network not up yet, 1 listening, -1 failed (gWhy)
std::string gWhy;
bool gStop = false;        // the running program must end
bool gPending = false;
ZnPlayerRun gNext;
std::uint64_t gLastPollUs = 0;

std::string home() {
  if (const char* h = std::getenv("ZINC_PLAYER_HOME"); h && *h) return h;
  std::string d = zn_console_data_dir() ? zn_console_data_dir() : "";
  while (!d.empty() && d.back() == '/') d.pop_back();
  return d.empty() ? "." : d;
}

void up() {
  if (gState != 0) return;
  char addr[64] = "", why[160] = "";
  const int r = zn_console_net_up(addr, sizeof addr, why, sizeof why);
  if (r == 0) { gWhy = "joining the network..."; return; }
  if (r < 0) { gState = -1; gWhy = why[0] ? why : "no network"; return; }
  Player& p = gPlayer;
  p.home = home();
  p.os = ZN_CONSOLE_PLATFORM;
  p.profile = std::strcmp(ZN_CONSOLE_PLATFORM, "console") ? ZN_CONSOLE_PLATFORM : "";
  p.arch = ZN_CONSOLE_ARCH;
  p.kind = ZN_CONSOLE_KIND;
  p.engine = ZN_CONSOLE_VERSION;
  p.address = addr;
  p.plugins = {"audio"};
#ifdef ZN_CONSOLE_WITH_3D
  p.plugins.push_back("3d");
#endif
  if (const char* v = std::getenv("ZINC_PLAYER_NAME"); v && *v) p.name = v;
  if (const char* v = std::getenv("ZINC_PLAYER_PORT"); v && *v) p.port = std::atoi(v);
  if (const char* v = std::getenv("ZINC_PLAYER_BIND"); v && *v) p.bind = v;
  if (const char* v = std::getenv("ZINC_PLAYER_CODE"); v && *v) p.fixedCode = v;
  if (const char* v = std::getenv("ZINC_PLAYER_PROFILE"); v && *v) p.profile = v;   // a test switch: the host build says it is a console
  p.run = [](const std::string& app, const std::string& dir, const std::vector<std::string>& args, const zn::agent::Env& env, long long pid) {
    gNext = ZnPlayerRun{app, dir, args, env, pid};
    gPending = true;
    gStop = true;   // the one running (if any) ends first
  };
  p.stop = [] { gStop = true; };
  p.shot = [](std::string& png) {
#ifdef ZN_CONSOLE_WITH_GFX
    if (!zn::host::gfxStarted) return false;
    std::size_t n = 0;
    std::uint8_t* b = zrt::gfx::capture_png(&n, 0, 0);
    if (!b) return false;
    png.assign(reinterpret_cast<const char*>(b), n);
    hal_free(b);
    return true;
#else
    (void)png;
    return false;
#endif
  };
  std::string err;
  if (!zn::agent::playerOpen(p, err)) { gState = -1; gWhy = err; return; }
  gState = 1;
  gWhy.clear();
  std::printf("zinc player: %s listening on %s:%d%s%s\n", p.name.c_str(), p.address.c_str(), p.port, p.code.empty() ? "" : ", pairing code: ",
              p.code.c_str());
  std::fflush(stdout);
}
}  // namespace

void znPlayerPoll() {
  up();
  if (gState == 1) zn::agent::playerPoll(gPlayer);
}
bool znPlayerTake(ZnPlayerRun& run) {
  if (!gPending) return false;
  run = gNext;
  gPending = false;
  return true;
}
void znPlayerStarted(const ZnPlayerRun& run) {
  gStop = gPending;   // a run asked for during the start: this one ends at once
  zn::rt::gStop = nullptr;
  zn::rt::gExitEndsRun = true;   // zinc:sys exit ends the program, not the player
  zn::agent::playerStarted(gPlayer, run.app, run.pid);
}
void znPlayerOutput(const char* p, std::size_t n) { if (gState == 1) zn::agent::playerOutput(gPlayer, std::string_view(p, n)); }
void znPlayerExited(int status) {
  zn::rt::gStop = nullptr;
  if (gState == 1) zn::agent::playerExited(gPlayer, status);
}
void znPlayerNewCode() { if (gState == 1) zn::agent::playerNewCode(gPlayer); }

std::vector<std::string> znPlayerScreen() {
  const Player& p = gPlayer;
  std::vector<std::string> l;
  if (gState != 1) { l.push_back("Zinc Player"); l.push_back(gWhy); return l; }
  l.push_back("Zinc Player  " + p.name + "  zinc " + p.engine);
  l.push_back("address  " + p.address + ":" + std::to_string(p.port));
  if (zn::agent::playerPairing(gPlayer)) {
    l.push_back("pairing code  " + p.code);
    l.push_back("on the computer: zinc device pair " + p.address + (p.port == zn::agent::kPort ? "" : ":" + std::to_string(p.port)) + " " + p.code);
  } else {
    l.push_back(p.closed ? "pairing closed after three wrong codes: SELECT for a new code" : "SELECT: a pairing code for a new computer");
    if (!p.paired.empty()) l.push_back("paired with " + p.paired);
  }
  l.push_back("waiting for zinc device deploy or zinc dev --device " + p.name);
  return l;
}

// The HALs, at the end of each poll of the frame: the server served, and 1 when the program must end. ponytail: the poll is skipped when the
// last one was less than 20 ms ago (a poll costs a system call per session).
extern "C" int zn_player_poll(void) {
  const std::uint64_t t = hal_time_us();
  if (t - gLastPollUs >= 20000) { gLastPollUs = t; znPlayerPoll(); }
  return gStop ? 1 : 0;
}
// host_console.cpp's waits: a program without frames ends at its next host call once stopped (zinc:sys has no other way in)
extern "C" int zn_player_wait_poll(void) {
  znPlayerPoll();
  if (gStop) zn::rt::gStop = "stopped from the workstation";
  return gStop ? 1 : 0;
}

#ifndef ZN_CONSOLE_OWN_ENTROPY
// The host build of the core: the system's generator (a console's HAL gives its own, targets/<console>/player_<console>.cpp)
#include <mbedtls/platform.h>
#include <psa/crypto.h>
int mbedtls_platform_get_entropy(psa_driver_get_entropy_flags_t, std::size_t* estimate_bits, unsigned char* out, std::size_t size) {
  std::FILE* f = std::fopen("/dev/urandom", "rb");
  const bool ok = f && std::fread(out, 1, size, f) == size;
  if (f) std::fclose(f);
  if (!ok) return PSA_ERROR_INSUFFICIENT_ENTROPY;
  *estimate_bits = size * 8;
  return 0;
}
#endif
