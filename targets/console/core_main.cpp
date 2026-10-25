// The entry of a console core (ZN-455): loads program.zbc (an argument, the file beside the executable, or the bytes linked in by ZN_CONSOLE_EMBED),
// decodes and verifies it, installs the console system host and the graphics host (with the baked fonts and images of resources.bin beside it), and
// runs it in the interpreter, or, built with ZN_CONSOLE_AOT, runs the program compiled to C++ and linked in (ZN-480). The program's frames go through the console's HAL (zinc:gfx calls hal_poll_input, hal_present, hal_frame_end).
// Its output is framed on the HAL log by `zinc:start` and `zinc:exit <status>`, as the PS1 and ESP32 runners frame theirs: an emulator runner prints
// the lines between them and exits with the status. Status: the program's (0, 1 runtime error, 101 uncaught exception), 2 no or invalid program.
// The player (ZN_CONSOLE_PLAYER, ZN-792) runs no program of its own: it waits for a workstation on its waiting screen, runs the program
// `zinc device` sent, and waits again; `zinc:start` / `zinc:exit` frame the player's whole life (START on the waiting screen ends it).
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <vector>

#include "hal.h"
#include "rt/rt.h"
#include "vm/vm.h"
#include "zbc/zbc.h"
#include "zn/host.h"
#ifdef ZN_CONSOLE_PLAYER
#include "player_console.h"
extern "C" void zn_console_use_pack(const unsigned char* p, unsigned long n);   // host_console.cpp
extern "C" void zn_console_set_app_dir(const char* dir);
extern "C" void zn_console_assets_reset(void);                                  // gfx_stubs.cpp
#endif

extern "C" void zn_console_set_args(int argc, const char* const* argv);   // host_console.cpp
extern "C" void zn_console_install_host(void);
extern "C" const char* zn_console_data_dir(void);
extern "C" const unsigned char* zn_console_player_font;   // the player's generated player_font.c
extern "C" unsigned long zn_console_player_font_size;
extern "C" int zn_hal_is_live(void);   // gfx_stubs.cpp: 1 with a console's HAL (a real screen)

#ifndef ZN_CONSOLE_STACK_SLOTS
#define ZN_CONSOLE_STACK_SLOTS 0   // 0: the engine's (kMaxCallDepth x kMaxRegisters slots, 20 MiB)
#endif
#ifndef ZN_CONSOLE_MAX_DEPTH
#define ZN_CONSOLE_MAX_DEPTH 0     // 0: the engine's kMaxCallDepth
#endif

extern "C" __attribute__((weak)) void zn_console_echo(const char*, std::size_t) {}   // the console's HAL may define it

// A program linked into the core (embed.cmake writes the strong definitions); none by default
extern "C" {
__attribute__((weak)) const unsigned char* zn_console_program = nullptr;
__attribute__((weak)) unsigned long zn_console_program_size = 0;
__attribute__((weak)) const unsigned char* zn_console_resources = nullptr;
__attribute__((weak)) unsigned long zn_console_resources_size = 0;
}

namespace {
void log(const std::string& s) { std::fflush(stdout); hal_log(s.data(), s.size()); }
void keep(const std::string& s);
void logErr(const std::string& s) { keep(s); std::fflush(stdout); hal_log_err(s.data(), s.size()); }
bool readFile(const std::string& path, std::vector<std::uint8_t>& out) {
  std::FILE* f = std::fopen(path.c_str(), "rb");
  if (!f) return false;
  std::uint8_t buf[16384];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) out.insert(out.end(), buf, buf + n);
  std::fclose(f);
  return true;
}
std::string dirOf(const std::string& p) {
  const std::size_t s = p.find_last_of("/\\");
  return s == std::string::npos ? std::string() : p.substr(0, s + 1);
}
#ifndef ZN_CONSOLE_PLAYER
bool endsWith(const char* s, const char* tail) { const std::size_t a = std::strlen(s), b = std::strlen(tail); return a >= b && !std::strcmp(s + a - b, tail); }
#endif
std::string shown;   // the last lines of the program's output and errors, for the text screen
#ifdef ZN_CONSOLE_PLAYER
ZnPlayerRun pendingRun;   // what the workstation sent, taken by the waiting screen
#endif
void keep(const std::string& s) {
#ifdef ZN_CONSOLE_PLAYER
  znPlayerOutput(s.data(), s.size());   // the program's log on the workstation
#endif
  shown += s;
  if (shown.size() > 4096) shown.erase(0, shown.size() - 4096);
}
#ifdef ZN_CONSOLE_WITH_GFX
// A console has no terminal (ZN-753): a program that ends with nothing drawn, or with an error, leaves its last lines on the screen until START
// (or the console's own quit: HOME on the PSP, a frame budget in the emulator tests) instead of a black screen or an app that closes at once.
// The player's waiting screen is the same screen with its lines on top, and returns (true) when the workstation sent a program; SELECT gives a
// new pairing code.
bool textScreen(int status, bool player = false) {
  using zn::host::HostArg;
  auto call = [](zn::Rt id, const HostArg* a = nullptr) { HostArg r; zn::host::hostGfx(static_cast<int>(id), a, &r); return r; };
  const std::string footer = player ? "START quits the player" : status ? "zinc: the program stopped (status " + std::to_string(status) + ") - START quits" : "zinc: the program ended - START quits";
  for (;;) {
    call(zn::Rt::HostGfxPoll);
    HostArg start; start.i = 10;   // Btn.Start
    if (call(zn::Rt::HostGfxShouldQuit).i || call(zn::Rt::HostGfxWasPressed, &start).i) return false;
#ifdef ZN_CONSOLE_PLAYER
    std::vector<std::string> head;
    if (player) {
      HostArg select; select.i = 11;   // Btn.Select
      if (call(zn::Rt::HostGfxWasPressed, &select).i) znPlayerNewCode();
      znPlayerPoll();
      ZnPlayerRun next;
      if (znPlayerTake(next)) { pendingRun = next; return true; }
      head = znPlayerScreen();
      head.emplace_back();
    }
#else
    const std::vector<std::string> head;
#endif
    call(zn::Rt::HostGfxBegin);
    HostArg bg; bg.i = 0x101828;
    call(zn::Rt::HostGfxClear, &bg);
    const std::int64_t w = call(zn::Rt::HostGfxWidth).i, h = call(zn::Rt::HostGfxHeight).i;
    // a screen 480 wide or less (the 3DS, the PSP): the grid font twice as large when it is baked (the 3DS player's own font is 8 and 16 px),
    // the 8 px one was too small to read on a 3DS
    HostArg g8[2], g16[2]; g8[0].p = g16[0].p = "grid"; g8[0].n = g16[0].n = 4; g8[1].i = 8; g16[1].i = 16;
    const std::int64_t k = w <= 480 && call(zn::Rt::HostGfxFont, g16).i != call(zn::Rt::HostGfxFont, g8).i ? 2 : 1, cols = w / (8 * k) - 1;
    std::vector<std::pair<std::string, std::uint32_t>> top;   // the player's lines wrapped to the screen (the 3DS's 49 columns cut the pairing hint)
    for (std::size_t i = 0; i < head.size(); i++) {
      const std::uint32_t color = i == 2 ? 0xffd166 : 0x8fd3ff;
      if (head[i].empty()) top.emplace_back(std::string(), color);
      for (std::size_t at = 0; at < head[i].size();) {   // at a space, so an address or a code stays whole
        std::size_t n = std::min(static_cast<std::size_t>(cols), head[i].size() - at);
        if (at + n < head[i].size()) { const std::size_t sp = head[i].rfind(' ', at + n); if (sp != std::string::npos && sp > at) n = sp - at; }
        top.emplace_back(head[i].substr(at, n), color);
        at += n;
        while (at < head[i].size() && head[i][at] == ' ') at++;
      }
    }
    // rows of 10 px, 18 for the large font (12 of them on a 3DS), the footer's row left free
    const std::int64_t lineH = k == 1 ? 10 : 18, fit = (h - 12 * k - 4) / lineH;
    if (static_cast<std::int64_t>(top.size()) > fit) top.resize(static_cast<std::size_t>(fit > 0 ? fit : 0));
    const std::int64_t rows = fit - static_cast<std::int64_t>(top.size());
    std::vector<std::string> lines;   // the output wrapped to the screen, its last rows shown
    for (std::size_t b = 0; b < shown.size();) {
      std::size_t e = shown.find('\n', b);
      if (e == std::string::npos) e = shown.size();
      const std::string line = shown.substr(b, e - b);
      if (line.empty()) lines.emplace_back();
      for (std::size_t at = 0; at < line.size(); at += static_cast<std::size_t>(cols)) lines.push_back(line.substr(at, static_cast<std::size_t>(cols)));
      b = e + 1;
    }
    auto text = [&](double y, const std::string& t, std::uint32_t color) {
      HostArg a[5]; a[0].d = 4; a[1].d = y; a[2].p = t.data(); a[2].n = static_cast<std::uint32_t>(t.size()); a[3].i = color; a[4].i = k;
      call(zn::Rt::HostGfxText, a);
    };
    const double line = static_cast<double>(lineH);
    for (std::size_t i = 0; i < top.size(); i++) text(4 + line * static_cast<double>(i), top[i].first, top[i].second);
    const double below = 4 + line * static_cast<double>(top.size());
    const std::size_t first = rows <= 0 ? lines.size() : lines.size() > static_cast<std::size_t>(rows) ? lines.size() - rows : 0;
    for (std::size_t i = first; i < lines.size(); i++) text(below + line * static_cast<double>(i - first), lines[i], 0xe0e6ff);
    text(static_cast<double>(h - 12 * k), footer.substr(0, static_cast<std::size_t>(cols)), status ? 0xff6b6b : 0x8899cc);
    call(zn::Rt::HostGfxEnd);
  }
}
#endif
int finish(int status) {
#ifdef ZN_CONSOLE_WITH_GFX
#ifndef ZN_CONSOLE_PLAYER   // the player's waiting screen was that screen
  if (zn::host::hostGfx && zn_hal_is_live() && (status != 0 || !zn::host::gfxStarted)) textScreen(status);
#endif
#endif
  log("zinc:exit " + std::to_string(status) + "\n");   // after the text screen: a runner stops the emulator on it
#ifdef ZN_CONSOLE_WITH_GFX
  if (zn_hal_is_live()) hal_shutdown();   // the GPU and the screens stopped before the launcher takes them back (a 3DS crashed without it)
#endif
  return status;
}
// The program's lines also go to the HAL's second output when it has one (PPSSPP prints only what reaches its kemulator: device): Machine::flushOut
// writes them on stdout and hands each to this tap.
void tap(const char* p, std::size_t n, bool) { std::string line(p, n); line += '\n'; keep(line); zn_console_echo(line.data(), line.size()); }
}  // namespace

#ifdef ZN_CONSOLE_AOT
// The program compiled to C++ (tools/build-console-core --aot, ZN-480): src/aot's ZN_CONSOLE_CORE accessor; its file also defines Machine::exec
extern "C" void zn_console_aot(const unsigned char** module, unsigned long* size, const unsigned char** res, unsigned long* resSize,
                               int (*const** natives)(zn::rt::Machine&, zn::rt::Slot*), unsigned long* count);
namespace {
struct { int (*const* fns)(zn::rt::Machine&, zn::rt::Slot*) = nullptr; unsigned long count = 0; } gAot;
void bindAot(zn::rt::Machine& m, const void*) {   // as runProgram binds a desktop AOT program (src/rt/program.cpp)
  m.registry = false;
  for (unsigned long i = 0; i < gAot.count && i < m.funcs.size(); ++i) m.funcs[i].native = gAot.fns[i];
}
}  // namespace
#endif

namespace {
// One program: its bytecode at `path` (or the one linked in), resources.bin beside it; the status it ended with.
int runOne(std::string path, int argc, char** argv, int first) {
  std::vector<std::uint8_t> bytes, res;
#ifdef ZN_CONSOLE_AOT
  if (path.empty()) {   // the compiled program: its module (packed by zbc::packRuns) and baked resources come from its C++
    const unsigned char *mod = nullptr, *rb = nullptr;
    unsigned long size = 0, rn = 0;
    zn_console_aot(&mod, &size, &rb, &rn, &gAot.fns, &gAot.count);
    path = "the compiled program";
    if (!zn::zbc::unpackRuns(mod, size, bytes)) { logErr("zinc: the compiled program's module is damaged\n"); return 2; }
    if (rb) res.assign(rb, rb + rn);
    else if (zn_console_resources) res.assign(zn_console_resources, zn_console_resources + zn_console_resources_size);
  } else
#endif
  if (zn_console_program && zn_console_program_size && path.empty()) {
    path = "the linked program";
    bytes.assign(zn_console_program, zn_console_program + zn_console_program_size);
    if (zn_console_resources) res.assign(zn_console_resources, zn_console_resources + zn_console_resources_size);
  } else {
    if (!readFile(path, bytes)) { logErr("zinc: cannot read " + path + "\n"); return 2; }
    readFile(dirOf(path) + "resources.bin", res);   // the fonts and images a drawing program needs (zinc pack writes them beside it)
  }
  zn::zbc::Module m;
  std::string err;
  if (!zn::zbc::decode(bytes, m, err)) { logErr("zinc: " + path + ": " + err + "\n"); return 2; }
  err = zn::zbc::verify(m);
  if (!err.empty()) { logErr("zinc: " + path + ": invalid ZBC: " + err + "\n"); return 2; }
  zn_console_set_args(argc - first, argv + first);
#ifdef ZN_CONSOLE_WITH_GFX
  if (!res.empty() && !zn::host::installResources(res.data(), res.size())) { logErr("zinc: " + dirOf(path) + "resources.bin: not a resource blob\n"); return 2; }
  zn::host::installGfx();   // the graphics host and, through installSys, the console system host
#else
  zn_console_install_host();
#endif
  std::string out;
  // the register stack and call depth of the console (its <console>.cmake): the desktop's 20 MiB stack is most of a PSP; output goes out live
  zn::rt::gConsoleTap = tap;
#ifdef ZN_CONSOLE_AOT
  void (*setup)(zn::rt::Machine&, const void*) = bindAot;
#else
  void (*setup)(zn::rt::Machine&, const void*) = nullptr;
#endif
  const zn::rt::Result r = zn::rt::runModuleHooked(m, out, false, setup, nullptr, nullptr, nullptr, ZN_CONSOLE_STACK_SLOTS, ZN_CONSOLE_MAX_DEPTH, true);
  std::fwrite(out.data(), 1, out.size(), stdout);   // what the program printed last, then its error (zn::rt::report, through the HAL)
  keep(out);
  zn_console_echo(out.data(), out.size());
  if (r.ok) return 0;
  if (r.error.rfind("exit ", 0) == 0) return std::atoi(r.error.c_str() + 5);   // zinc:sys exit(n) in the player (zn::rt::gExitEndsRun)
  if (zn::rt::gStop && r.error == zn::rt::gStop) return 0;                      // stopped from the workstation
  const bool panic = r.error.rfind("panic: ", 0) == 0;   // an uncaught exception
  logErr((panic ? "" : "runtime error: ") + r.error + "\n");
  return panic ? 101 : 1;
}

#ifdef ZN_CONSOLE_PLAYER
// The player: the waiting screen, the program the workstation sent, the waiting screen again, until START there (or the console's own quit).
// Each program gets the surface, the frame count and the quit flag afresh, its own asset pack and its own directory (storage.kv per app).
int playerLoop(char** argv) {
  std::vector<unsigned char> packBytes;
  int status = 0;
  for (;;) {
    ZnPlayerRun run;
    if (!znPlayerTake(run)) {
#ifdef ZN_CONSOLE_WITH_GFX
      if (zn_hal_is_live()) {
        if (!zn::host::hostGfx) zn::host::installGfx();
        static bool font = false;   // the waiting screen's font (player_font.zrs, CMakeLists.txt): the player has no resources.bin of its own
        if (!font) font = zn::host::installResources(zn_console_player_font, zn_console_player_font_size);
        zn::host::resetLoop();
        if (!textScreen(status, true)) return status;
        run = pendingRun;
      } else
#endif
      {   // headless (the host build of the tests): no screen, the server polled until a program comes
        while (!znPlayerTake(run)) { znPlayerPoll(); hal_sleep_us(10000); }
      }
    }
    std::vector<std::uint8_t> pk;
    packBytes.clear();
    if (readFile(run.dir + "/packs/default.zpk", pk)) packBytes.assign(pk.begin(), pk.end());   // ponytail: read whole, as the linked pack is
    zn_console_use_pack(packBytes.empty() ? nullptr : packBytes.data(), packBytes.size());
#ifdef ZN_CONSOLE_WITH_GFX
    zn_console_assets_reset();
    zn::host::resetLoop();
#endif
    zn_console_set_app_dir((run.dir + "/").c_str());
    for (const auto& [k, v] : run.env) setenv(k.c_str(), v.c_str(), 1);
    std::vector<std::string> args = run.args;
    std::vector<char*> av = {argv[0]};
    for (std::string& a : args) av.push_back(a.data());
    av.push_back(nullptr);
    shown.clear();
    znPlayerStarted(run);
    status = runOne(run.dir + "/program.zbc", static_cast<int>(av.size()) - 1, av.data(), 1);
    for (const auto& kv : run.env) unsetenv(kv.first.c_str());
    znPlayerExited(status);
    zn_console_set_app_dir(nullptr);
  }
}
#endif
}  // namespace

int main(int argc, char** argv) {
#ifdef ZN_CONSOLE_SIZE
  setenv("ZINC_SIZE", ZN_CONSOLE_SIZE, 0);   // the surface is the console's screen (the graphics host reads ZINC_SIZE)
#endif
#ifdef ZN_CONSOLE_ENV
  for (const char* at = ZN_CONSOLE_ENV; *at;) {   // NAME=VALUE,... built in (tools/build-console-core --env): ZINC_PROFILE=1 prints the frame times
    const char* e = std::strchr(at, ',');
    const std::string kv(at, e ? static_cast<std::size_t>(e - at) : std::strlen(at));
    const std::size_t eq = kv.find('=');
    if (eq != std::string::npos) setenv(kv.substr(0, eq).c_str(), kv.substr(eq + 1).c_str(), 1);
    at = e ? e + 1 : at + std::strlen(at);
  }
#endif
  log("zinc:start\n");
#ifdef ZN_CONSOLE_PLAYER
  (void)argc;
  return finish(playerLoop(argv));
#else
  // the program: an argument ending in .zbc, else program.zbc beside the executable (EBOOT.PBP, eboot.bin, the ELF), else in the data directory
  int first = 1;
  std::string path;
  if (argc > 1 && endsWith(argv[1], ".zbc")) { path = argv[1]; first = 2; }
  else if (argc > 0 && argv[0] && !dirOf(argv[0]).empty()) path = dirOf(argv[0]) + "program.zbc";
  else { const char* d = zn_console_data_dir(); path = std::string(d ? d : "") + "program.zbc"; }
#ifdef ZN_CONSOLE_AOT
  path.clear();   // the compiled program, whatever lies beside the executable
#endif
  return finish(runOne(zn_console_program && zn_console_program_size ? std::string() : path, argc, argv, first));
#endif
}
