// The entry of a console core (ZN-455): loads program.zbc (an argument, the file beside the executable, or the bytes linked in by ZN_CONSOLE_EMBED),
// decodes and verifies it, installs the console system host and the graphics host (with the baked fonts and images of resources.bin beside it), and
// runs it in the interpreter. The program's frames go through the console's HAL (zinc:gfx calls hal_poll_input, hal_present, hal_frame_end).
// Its output is framed on the HAL log by `zinc:start` and `zinc:exit <status>`, as the PS1 and ESP32 runners frame theirs: an emulator runner prints
// the lines between them and exits with the status. Status: the program's (0, 1 runtime error, 101 uncaught exception), 2 no or invalid program.
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

extern "C" void zn_console_set_args(int argc, const char* const* argv);   // host_console.cpp
extern "C" void zn_console_install_host(void);
extern "C" const char* zn_console_data_dir(void);
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
bool endsWith(const char* s, const char* tail) { const std::size_t a = std::strlen(s), b = std::strlen(tail); return a >= b && !std::strcmp(s + a - b, tail); }
std::string shown;   // the last lines of the program's output and errors, for the text screen
void keep(const std::string& s) {
  shown += s;
  if (shown.size() > 4096) shown.erase(0, shown.size() - 4096);
}
#ifdef ZN_CONSOLE_WITH_GFX
// A console has no terminal (ZN-753): a program that ends with nothing drawn, or with an error, leaves its last lines on the screen until START
// (or the console's own quit: HOME on the PSP, a frame budget in the emulator tests) instead of a black screen or an app that closes at once.
void textScreen(int status) {
  using zn::host::HostArg;
  auto call = [](zn::Rt id, const HostArg* a = nullptr) { HostArg r; zn::host::hostGfx(static_cast<int>(id), a, &r); return r; };
  const std::string footer = status ? "zinc: the program stopped (status " + std::to_string(status) + ") - START quits" : "zinc: the program ended - START quits";
  for (;;) {
    call(zn::Rt::HostGfxPoll);
    HostArg start; start.i = 10;   // Btn.Start
    if (call(zn::Rt::HostGfxShouldQuit).i || call(zn::Rt::HostGfxWasPressed, &start).i) return;
    call(zn::Rt::HostGfxBegin);
    HostArg bg; bg.i = 0x101828;
    call(zn::Rt::HostGfxClear, &bg);
    const std::int64_t w = call(zn::Rt::HostGfxWidth).i, h = call(zn::Rt::HostGfxHeight).i, cols = w / 8 - 1, rows = h / 10 - 2;
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
      HostArg a[5]; a[0].d = 4; a[1].d = y; a[2].p = t.data(); a[2].n = static_cast<std::uint32_t>(t.size()); a[3].i = color; a[4].i = 1;
      call(zn::Rt::HostGfxText, a);
    };
    const std::size_t first = lines.size() > static_cast<std::size_t>(rows) ? lines.size() - rows : 0;
    for (std::size_t i = first; i < lines.size(); i++) text(4 + 10.0 * static_cast<double>(i - first), lines[i], 0xe0e6ff);
    text(static_cast<double>(h - 12), footer.substr(0, static_cast<std::size_t>(cols)), status ? 0xff6b6b : 0x8899cc);
    call(zn::Rt::HostGfxEnd);
  }
}
#endif
int finish(int status) {
#ifdef ZN_CONSOLE_WITH_GFX
  if (zn::host::hostGfx && zn_hal_is_live() && (status != 0 || !zn::host::gfxStarted)) textScreen(status);
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
  // the program: an argument ending in .zbc, else program.zbc beside the executable (EBOOT.PBP, eboot.bin, the ELF), else in the data directory
  int first = 1;
  std::string path;
  if (argc > 1 && endsWith(argv[1], ".zbc")) { path = argv[1]; first = 2; }
  else if (argc > 0 && argv[0] && !dirOf(argv[0]).empty()) path = dirOf(argv[0]) + "program.zbc";
  else { const char* d = zn_console_data_dir(); path = std::string(d ? d : "") + "program.zbc"; }
  std::vector<std::uint8_t> bytes, res;
  if (zn_console_program && zn_console_program_size) {
    path = "the linked program";
    bytes.assign(zn_console_program, zn_console_program + zn_console_program_size);
    if (zn_console_resources) res.assign(zn_console_resources, zn_console_resources + zn_console_resources_size);
  } else {
    if (!readFile(path, bytes)) { logErr("zinc: cannot read " + path + "\n"); return finish(2); }
    readFile(dirOf(path) + "resources.bin", res);   // the fonts and images a drawing program needs (zinc pack writes them beside it)
  }
  zn::zbc::Module m;
  std::string err;
  if (!zn::zbc::decode(bytes, m, err)) { logErr("zinc: " + path + ": " + err + "\n"); return finish(2); }
  err = zn::zbc::verify(m);
  if (!err.empty()) { logErr("zinc: " + path + ": invalid ZBC: " + err + "\n"); return finish(2); }
  zn_console_set_args(argc - first, argv + first);
#ifdef ZN_CONSOLE_WITH_GFX
  if (!res.empty() && !zn::host::installResources(res.data(), res.size())) { logErr("zinc: " + dirOf(path) + "resources.bin: not a resource blob\n"); return finish(2); }
  zn::host::installGfx();   // the graphics host and, through installSys, the console system host
#else
  zn_console_install_host();
#endif
  std::string out;
  // the register stack and call depth of the console (its <console>.cmake): the desktop's 20 MiB stack is most of a PSP; output goes out live
  zn::rt::gConsoleTap = tap;
  const zn::rt::Result r = zn::rt::runModuleHooked(m, out, false, nullptr, nullptr, nullptr, nullptr, ZN_CONSOLE_STACK_SLOTS, ZN_CONSOLE_MAX_DEPTH, true);
  std::fwrite(out.data(), 1, out.size(), stdout);   // what the program printed last, then its error (zn::rt::report, through the HAL)
  keep(out);
  zn_console_echo(out.data(), out.size());
  if (r.ok) return finish(0);
  const bool panic = r.error.rfind("panic: ", 0) == 0;   // an uncaught exception
  logErr((panic ? "" : "runtime error: ") + r.error + "\n");
  return finish(panic ? 101 : 1);
}
