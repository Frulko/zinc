// The entry of a console core (ZN-455): loads program.zbc (an argument, the file beside the executable, or the bytes linked in by ZN_CONSOLE_EMBED),
// decodes and verifies it, installs the console system host and the graphics host (with the baked fonts and images of resources.bin beside it), and
// runs it in the interpreter. The program's frames go through the console's HAL (zinc:gfx calls hal_poll_input, hal_present, hal_frame_end).
// Its output is framed on the HAL log by `zinc:start` and `zinc:exit <status>`, as the PS1 and ESP32 runners frame theirs: an emulator runner prints
// the lines between them and exits with the status. Status: the program's (0, 1 runtime error, 101 uncaught exception), 2 no or invalid program.
#include <cstdio>
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

// A program linked into the core (embed.cmake writes the strong definitions); none by default
extern "C" {
__attribute__((weak)) const unsigned char* zn_console_program = nullptr;
__attribute__((weak)) unsigned long zn_console_program_size = 0;
__attribute__((weak)) const unsigned char* zn_console_resources = nullptr;
__attribute__((weak)) unsigned long zn_console_resources_size = 0;
}

namespace {
void log(const std::string& s) { std::fflush(stdout); hal_log(s.data(), s.size()); }
void logErr(const std::string& s) { std::fflush(stdout); hal_log_err(s.data(), s.size()); }
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
int finish(int status) { log("zinc:exit " + std::to_string(status) + "\n"); return status; }
}  // namespace

int main(int argc, char** argv) {
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
  const zn::rt::Result r = zn::vm::run(m, out, false);
  return finish(zn::rt::report(r, out, false));
}
