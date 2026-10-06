#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <cstring>
#include <fstream>
#include <iterator>
#include <vector>
#include <sstream>
#include <string>

#include "frontend/check.h"
#include "frontend/diagnostics.h"
#include "frontend/lexer.h"
#include "frontend/modules.h"
#include "frontend/parser.h"
#include "ir/ir.h"
#include "aot/aot.h"
#include "zn/host.h"
#include "prof/prof.h"
#include "res/res.h"
#include "zn/hostsys.h"
#ifdef ZN_HOST_LIBS
#define HOSTLIBS + std::string(" '") + ZN_HOST_LIBS + "'"   // the window library the host links
#else
#define HOSTLIBS
#endif
#include "tc/tc.h"
#include "dev/client.h"
#include "dev/core.h"
#include <unistd.h>
#include "vm/vm.h"
#include "zbc/zbc.h"
#include "vm/vm.h"
#include "vm/vm.h"
#include "zbc/zbc.h"

static bool readFile(const std::string& path, std::string& out) {
  if (!std::filesystem::is_regular_file(path)) return false;
  std::ifstream in(path, std::ios::binary);
  if (!in) return false;
  std::stringstream buf;
  buf << in.rdbuf();
  out = buf.str();
  return true;
}

// Loads the entry file and the files it imports, checks the program; diagnostics are printed. Returns false on errors.
static bool gStrict = false;  // --strict (a file-local switch of the command line, set once in main)

static bool loadChecked(const char* path, zn::frontend::Program& prog, zn::frontend::Checked& checked) {
  prog = zn::frontend::loadProgram(path, readFile, gStrict, std::string(ZN_SOURCE_DIR) + "/../lib/std");
  auto diags = prog.diags;
  if (diags.empty()) {
    checked = zn::frontend::check(prog.ast);
    diags = checked.diags;
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return diags.empty();
}

// Compiles a source file down to a ZBC module, printing diagnostics; returns 0 on success.
static std::vector<std::string> gSources;  // the texts of the files of the last program compiled: they decide which fonts and images are baked

// The baked fonts and images of the last program compiled, as one blob (src/res); assets are the `assets` directory beside the entry file or above it.
static bool bakeResources(const char* entry, std::vector<std::uint8_t>& blob, std::string& err) {
  namespace fs = std::filesystem;
  zn::res::Options o;
  o.fontDir = std::string(ZN_SOURCE_DIR) + "/../lib/fonts";
  fs::path dir = fs::absolute(entry).parent_path();
  for (fs::path d : {dir / "assets", dir.parent_path() / "assets"}) if (fs::is_directory(d)) { o.assetsDir = d.string(); break; }
  return zn::res::bake(gSources, o, blob, err);
}

static int compileToZbc(const char* path, zn::zbc::Module& out) {
  zn::frontend::Program prog;
  zn::frontend::Checked checked;
  if (!loadChecked(path, prog, checked)) return 1;
  gSources.clear();
  for (const auto& f : prog.files) gSources.push_back(f.text);
  std::vector<zn::frontend::Diag> diags;
  {
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    diags = low.diags;
    if (diags.empty()) {
      if (!std::getenv("ZN_NO_OPT")) zn::ir::optimize(low.module);
      zn::ir::insertRc(low.module);
      std::string badIr = zn::ir::verify(low.module);
      if (!badIr.empty()) { std::fprintf(stderr, "internal error: invalid IR after reference counting: %s\n", badIr.c_str()); return 3; }
      auto em = zn::zbc::emit(low.module);
      for (const auto& e : em.errors) std::fprintf(stderr, "%s: %s\n", path, e.c_str());
      if (!em.errors.empty()) return 1;
      std::string bad = zn::zbc::verify(em.module);
      if (!bad.empty()) { std::fprintf(stderr, "internal error: invalid ZBC: %s\n", bad.c_str()); return 3; }
      out = std::move(em.module);
      return 0;
    }
  }
  for (const auto& d : diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
  return 1;
}

int main(int argc, char** argv) {
  if (char* self = realpath(argv[0], nullptr)) { setenv("ZINC_BIN", self, 0); std::free(self); }  // the apps that start `zinc` (Zinc Atelier) find this binary through it
#ifdef ZN_HOST_GFX
  zn::host::installGfx();
#endif
  for (int k = 1; k < argc; ++k)  // `--strict` anywhere on the command line selects the strict profile
    if (!std::strcmp(argv[k], "--strict")) { gStrict = true; for (int j = k; j + 1 < argc; ++j) argv[j] = argv[j + 1]; --argc; --k; }
  if (argc == 2 && !std::strcmp(argv[1], "--version")) {
    std::puts("zinc-next 0.0.1");
    return 0;
  }
  if (argc >= 3 && (!std::strcmp(argv[1], "profile") || !std::strcmp(argv[1], "mem"))) {  // zinc profile|mem <file.ts|file.zbc> [options]: the interpreter under a profiler
    bool isMem = !std::strcmp(argv[1], "mem"), json = false, checkLeaks = false;
    zn::prof::ProfileOptions po;
    po.speedscope = "zinc.speedscope.json";
    for (int k = 3; k < argc; ++k) {
      if (!std::strcmp(argv[k], "--json")) json = true;
      else if (!std::strcmp(argv[k], "--check-leaks")) checkLeaks = true;
      else if (!std::strcmp(argv[k], "--hz") && k + 1 < argc) po.hz = std::atoi(argv[++k]);
      else if (!std::strcmp(argv[k], "--speedscope") && k + 1 < argc) po.speedscope = argv[++k];
      else if (!std::strcmp(argv[k], "--folded") && k + 1 < argc) po.folded = argv[++k];
      else { std::fprintf(stderr, "unknown option %s\n", argv[k]); return 2; }
    }
    zn::zbc::Module zm;
    std::string path = argv[2];
    if (path.size() > 4 && path.substr(path.size() - 4) == ".zbc") {
      std::ifstream in(path, std::ios::binary);
      if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[2]); return 2; }
      std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
      std::string err;
      if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[2], err.c_str()); return 1; }
      err = zn::zbc::verify(zm);
      if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[2], err.c_str()); return 1; }
    } else if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::string out, report;
    zn::rt::Result res = isMem ? zn::prof::memory(zm, out, json, report) : zn::prof::profile(zm, out, po, report);
    std::fwrite(out.data(), 1, out.size(), stderr);  // the program's own output goes to stderr: stdout is the report
    std::fputs(report.c_str(), stdout);
    if (!res.ok) { std::fprintf(stderr, "%s\n", res.error.c_str()); return res.error.rfind("panic: ", 0) == 0 ? 101 : 1; }
    if (!isMem) std::fprintf(stderr, "wrote %s\n", po.speedscope.c_str());
    if (checkLeaks && res.leaked) { std::fprintf(stderr, "leaked %zu object(s)\n", res.leaked); return 4; }
    return 0;
  }
  if (argc >= 3 && !std::strcmp(argv[1], "run") && (argc == 3 || !std::strcmp(argv[3], "--"))) {  // zinc run <file> [-- args...]  // zinc run <file.ts|file.zbc>: compile if needed, verify, execute
    std::string path = argv[2];
    zn::zbc::Module zm;
    if (path.size() > 4 && path.substr(path.size() - 4) == ".zbc") {
      std::ifstream in(path, std::ios::binary);
      if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[2]); return 2; }
      std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
      std::string err;
      auto t0 = std::chrono::steady_clock::now();
      if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[2], err.c_str()); return 1; }
      auto t1 = std::chrono::steady_clock::now();
      err = zn::zbc::verify(zm);
      if (std::getenv("ZN_TIMING")) std::fprintf(stderr, "decode %.2f ms, verify %.2f ms\n", std::chrono::duration<double, std::milli>(t1 - t0).count(), std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t1).count());
      if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[2], err.c_str()); return 1; }
    } else if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::string out;
    bool trace = std::getenv("ZN_TRACE_FREE") != nullptr;
#ifdef ZN_HOST_GFX
    {  // the program's arguments (after `--`) and its assets directory (beside the entry file or above it) for zinc:sys and zinc:assets
      std::vector<std::string> args;
      for (int k = 4; k < argc; ++k) args.push_back(argv[k]);
      zn::host::setProgramArgs(args);
      namespace fs = std::filesystem;
      fs::path dir = fs::absolute(argv[2]).parent_path();
      for (fs::path d : {dir / "assets", dir.parent_path() / "assets"}) if (fs::is_directory(d)) { setenv("ZINC_ASSETS", d.c_str(), 0); break; }
    }
    if (zn::aot::usesHost(zm)) {  // a program that draws: bake its fonts and images (from its sources) and install them
      std::vector<std::uint8_t> blob;
      std::string err;
      if (!bakeResources(argv[2], blob, err) || !zn::host::installResources(blob.data(), blob.size())) { std::fprintf(stderr, "zinc: cannot prepare the fonts and images: %s\n", err.c_str()); return 1; }
    }
#endif
    auto res = zn::vm::run(zm, out, trace);
    return zn::rt::report(res, out, trace);
  }
  if (argc >= 2 && !std::strcmp(argv[1], "device-sim")) {  // zinc device-sim: the device core of src/dev on stdin and stdout (what a flashed ESP32 does on its UART)
    zn::dev::CoreConfig cfg;
    for (int k = 2; k + 1 < argc; k += 2) {
      if (!std::strcmp(argv[k], "--stack")) cfg.stackSlots = static_cast<std::size_t>(std::atoll(argv[k + 1]));
      else if (!std::strcmp(argv[k], "--depth")) cfg.maxDepth = static_cast<std::size_t>(std::atoll(argv[k + 1]));
    }
    zn::dev::Core core(cfg, [](const char* p, std::size_t n) { std::fwrite(p, 1, n, stdout); std::fflush(stdout); });
    core.announce();
    std::uint8_t buf[512];
    for (;;) {
      ssize_t n = ::read(0, buf, sizeof buf);
      if (n <= 0) return 0;
      core.feed(buf, static_cast<std::size_t>(n));
    }
  }
  if (argc >= 5 && !std::strcmp(argv[1], "run") && !std::strcmp(argv[3], "--target")) {  // zinc run <file> --target esp32 [--port P | --device CMD | --qemu] [--boot-ms N] [--log]
    std::string target = argv[4], port, deviceCmd;
    bool qemu = false, showLog = false;
    int bootMs = 15000, runMs = 60000;
    for (int k = 5; k < argc; ++k) {
      if (!std::strcmp(argv[k], "--port") && k + 1 < argc) port = argv[++k];
      else if (!std::strcmp(argv[k], "--device") && k + 1 < argc) deviceCmd = argv[++k];
      else if (!std::strcmp(argv[k], "--qemu")) qemu = true;
      else if (!std::strcmp(argv[k], "--boot-ms") && k + 1 < argc) bootMs = std::atoi(argv[++k]);
      else if (!std::strcmp(argv[k], "--run-ms") && k + 1 < argc) runMs = std::atoi(argv[++k]);
      else if (!std::strcmp(argv[k], "--log")) showLog = true;
      else { std::fprintf(stderr, "unknown option %s\n", argv[k]); return 2; }
    }
    if (target != "esp32") { std::fprintf(stderr, "zinc: --target %s runs through `zinc build --target`; `run` supports esp32\n", target.c_str()); return 2; }
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::vector<std::uint8_t> bytes = zn::zbc::encode(zm);
    zn::dev::Link link;
    std::string err;
    if (!deviceCmd.empty()) { if (!zn::dev::spawnCommand(deviceCmd, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; } }
    else if (qemu) {
      std::string cmd;
      if (!zn::tc::qemuCommand("esp32", ZN_SOURCE_DIR, cmd, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      if (!zn::dev::spawnCommand(cmd, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    } else {
      if (port.empty()) port = zn::dev::findSerialPort();
      if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in, give --port <path>, or try the emulator with --qemu\n"); return 1; }
      if (!zn::dev::openSerial(port, 115200, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    }
    zn::dev::Answer ans;
    std::string log;
    bool ok = zn::dev::upload(link, bytes, ans, err, bootMs, runMs, &log);
    zn::dev::closeLink(link);
    if (showLog) std::fputs(log.c_str(), stderr);
    if (!ok) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::fwrite(ans.output.data(), 1, ans.output.size(), stdout);
    if (std::getenv("ZN_DEVICE_STATS")) std::fprintf(stderr, "device: core %s, free heap %zu bytes, status %d, %zu object(s) left\n", ans.coreVersion.c_str(), ans.freeHeap, ans.status, ans.leaked);
    return ans.status;
  }
  if (argc >= 4 && !std::strcmp(argv[1], "flash") && !std::strcmp(argv[2], "--target")) {  // zinc flash --target esp32 [--port P]: the core firmware onto the board
    if (std::strcmp(argv[3], "esp32")) { std::fprintf(stderr, "zinc: flash supports esp32\n"); return 2; }
    std::string port, err, tool;
    for (int k = 4; k + 1 < argc; k += 2) if (!std::strcmp(argv[k], "--port")) port = argv[k + 1];
    if (port.empty()) port = zn::dev::findSerialPort();
    if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in or give --port <path>\n"); return 1; }
    std::string image = std::string(ZN_SOURCE_DIR) + "/firmware/esp32/prebuilt/esp32-core-flash.bin";
    if (!std::filesystem::exists(image)) { std::fprintf(stderr, "zinc: the core firmware image is missing: %s\n", image.c_str()); return 1; }
    if (!zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::string cmd = "'" + tool + "' --chip esp32 -p '" + port + "' -b 460800 write-flash 0x0 '" + image + "'";
    std::fprintf(stderr, "zinc: flashing the core to %s\n", port.c_str());
    return std::system(cmd.c_str()) == 0 ? 0 : 1;
  }
  if (argc == 5 && !std::strcmp(argv[1], "bake") && !std::strcmp(argv[3], "-o")) {  // zinc bake <file> -o <blob>: the baked fonts and images of a program (for inspection and tests)
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::vector<std::uint8_t> blob;
    std::string err;
    if (!bakeResources(argv[2], blob, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    std::ofstream out(argv[4], std::ios::binary);
    out.write(reinterpret_cast<const char*>(blob.data()), static_cast<std::streamsize>(blob.size()));
    return out ? 0 : 2;
  }
  if (argc >= 2 && !std::strcmp(argv[1], "toolchain")) {  // zinc toolchain install|path|targets|sha256 <file>
    std::string sub = argc >= 3 ? argv[2] : "";
    if (sub == "install" || sub == "path") {
      std::string zig, err;
      if (!zn::tc::ensureZig(zig, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      std::puts(zig.c_str());
      return 0;
    }
    if (sub == "esptool") {
      std::string tool, err;
      if (!zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
      std::puts(tool.c_str());
      return 0;
    }
    if (sub == "targets") {
      for (const auto& t : zn::tc::targets()) std::printf("%-14s %s\n", t.name, t.note);
      return 0;
    }
    if (sub == "sha256" && argc == 4) {
      std::string h = zn::tc::sha256File(argv[3]);
      if (h.empty()) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
      std::printf("%s  %s\n", h.c_str(), argv[3]);
      return 0;
    }
    std::fprintf(stderr, "usage: zinc toolchain install | path | esptool | targets | sha256 <file>\n");
    return 2;
  }
  if (argc == 7 && !std::strcmp(argv[1], "build") && !std::strcmp(argv[2], "--target") && !std::strcmp(argv[5], "-o")) {  // zinc build --target <t> <file> -o <out>: a program for another machine
    namespace fs = std::filesystem;
    const zn::tc::Target* target = zn::tc::findTarget(argv[3]);
    if (!target) { std::fprintf(stderr, "unknown target '%s' (zinc toolchain targets)\n", argv[3]); return 2; }
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[4], zm)) return rc;
    std::string zig, err;
    if (!zn::tc::ensureZig(zig, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    fs::path cpp = fs::path(argv[6]).string() + ".cpp";
    { std::ofstream o(cpp); o << zn::aot::emitCpp(zm); if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    bool ok = zn::tc::crossBuild(zig, ZN_SOURCE_DIR, cpp.string(), argv[3], argv[6], err);
    if (!std::getenv("ZN_KEEP_CPP")) fs::remove(cpp);
    if (!ok) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
    return 0;
  }
  if (argc == 5 && !std::strcmp(argv[1], "build") && !std::strcmp(argv[3], "-o")) {  // zinc build <file> -o <out>: compile to C++ and then to a native program
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    namespace fs = std::filesystem;
    fs::path libs = fs::absolute(argv[0]).parent_path(), cpp = fs::path(argv[4]).string() + ".cpp";
    std::vector<std::uint8_t> blob;
    if (zn::aot::usesHost(zm)) {
      std::string err;
      if (!bakeResources(argv[2], blob, err)) { std::fprintf(stderr, "zinc: cannot bake the fonts and images: %s\n", err.c_str()); return 1; }
    }
    { std::ofstream o(cpp); o << zn::aot::emitCpp(zm, blob.empty() ? nullptr : &blob); if (!o) { std::fprintf(stderr, "cannot write %s\n", cpp.c_str()); return 2; } }
    const char* cxx = std::getenv("CXX");
    std::string cmd = std::string(cxx ? cxx : "c++") + " -std=c++20 -O2 -w -I " ZN_SOURCE_DIR "/include -I " ZN_SOURCE_DIR "/src -I " ZN_SOURCE_DIR "/third_party/mimalloc/include '" + cpp.string() + "' '" + (libs / "libzn_rt.a").string() + "' '" + (libs / "libzn_mimalloc.a").string() + "' '" +
                      (libs / "libzn_zbc.a").string() + "' '" + (libs / "libzn_ir.a").string() + "' '" + (libs / "libzn_frontend.a").string() + "'" +
                      (fs::exists(libs / "libzn_host_gfx.a") ? " '" + (libs / "libzn_host_gfx.a").string() + "'" HOSTLIBS : std::string()) + " -o '" + argv[4] + "'";  // the graphics host, used by programs that call it
    int rc = std::system(cmd.c_str());
    if (!std::getenv("ZN_KEEP_CPP")) fs::remove(cpp);
    if (rc != 0) { std::fprintf(stderr, "the C++ compiler failed: %s\n", cmd.c_str()); return 1; }
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "--emit=cpp")) {  // zinc --emit=cpp <file>: the C++ of the AOT build
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::fputs(zn::aot::emitCpp(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 3 && !std::strcmp(argv[1], "--emit=zbc")) { // zinc --emit=zbc <file>: disassembly
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    std::fputs(zn::zbc::disassemble(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "--emit=zbc-bin")) {  // zinc --emit=zbc-bin <file> <out.zbc>
    zn::zbc::Module zm;
    if (int rc = compileToZbc(argv[2], zm)) return rc;
    auto bytes = zn::zbc::encode(zm);
    std::ofstream out(argv[3], std::ios::binary);
    out.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    return out ? 0 : 2;
  }
  if (argc == 4 && !std::strcmp(argv[1], "zbc")) {  // zinc zbc --check|--dump <file.zbc>: decode and verify a bytecode file
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    zn::zbc::Module zm;
    std::string err;
    if (!zn::zbc::decode(bytes, zm, err)) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    err = zn::zbc::verify(zm);
    if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[3], err.c_str()); return 1; }
    if (!std::strcmp(argv[2], "--dump")) std::fputs(zn::zbc::disassemble(zm).c_str(), stdout);
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "lex")) {  // zinc lex --check|--dump <file>
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::stringstream buf;
    buf << in.rdbuf();
    std::string src = buf.str();
    std::string_view name = argv[3];
    auto toks = zn::frontend::lex(src, name.size() >= 4 && name.substr(name.size() - 4) == ".tsx");
    if (!std::strcmp(argv[2], "--dump")) { std::fputs(zn::frontend::dump(src, toks).c_str(), stdout); return 0; }
    std::string err = zn::frontend::check(src, toks);
    if (!err.empty()) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "parse")) {  // zinc parse --check|--dump <file>
    std::ifstream in(argv[3], std::ios::binary);
    if (!in) { std::fprintf(stderr, "cannot read %s\n", argv[3]); return 2; }
    std::stringstream buf;
    buf << in.rdbuf();
    std::string src = buf.str();
    auto res = zn::frontend::parse(src);
    for (const auto& d : res.diags) std::fprintf(stderr, "%s\n", zn::frontend::format(d, src, argv[3]).c_str());
    if (!res.diags.empty()) return 1;
    if (!std::strcmp(argv[2], "--dump")) { std::fputs(zn::frontend::dump(res.ast).c_str(), stdout); return 0; }
    std::string err = zn::frontend::validate(res.ast);
    if (!err.empty()) { std::fprintf(stderr, "%s: %s\n", argv[3], err.c_str()); return 1; }
    return 0;
  }
  if (argc == 4 && !std::strcmp(argv[1], "check")) {  // zinc check --check|--types <file>: parse, then check
    zn::frontend::Program prog;
    zn::frontend::Checked checked;
    if (!loadChecked(argv[3], prog, checked)) return 1;
    if (!std::strcmp(argv[2], "--types")) std::fputs(zn::frontend::dumpTypes(checked, prog.ast, prog.files[0].text).c_str(), stdout);
    return 0;
  }
  if (argc == 3 && (!std::strcmp(argv[1], "--emit=ir") || !std::strcmp(argv[1], "--emit=ir-rc"))) {  // zinc --emit=ir <file>: parse, check, lower, verify, dump
    zn::frontend::Program prog;
    zn::frontend::Checked checked;
    if (!loadChecked(argv[2], prog, checked)) return 1;
    auto low = zn::ir::lower(prog.ast, checked, prog.files[0].text);
    if (low.diags.empty()) {
      if (!std::strcmp(argv[1], "--emit=ir-rc")) { if (!std::getenv("ZN_NO_OPT")) zn::ir::optimize(low.module); zn::ir::insertRc(low.module); }
      std::string bad = zn::ir::verify(low.module);
      if (!bad.empty()) { std::fprintf(stderr, "internal error: invalid IR: %s\n", bad.c_str()); if (std::getenv("ZN_DUMP_BAD")) { std::string d = zn::ir::dump(low.module); std::fwrite(d.data(), 1, d.size(), stdout); } return 3; }
      std::fputs(zn::ir::dump(low.module).c_str(), stdout);
      return 0;
    }
    for (const auto& d : low.diags) std::fprintf(stderr, "%s\n", zn::frontend::formatDiag(prog, d).c_str());
    return 1;
  }
  if (argc == 3 && !std::strcmp(argv[1], "explain")) {  // zinc explain Z0001|--markdown|--codes
    std::string out = !std::strcmp(argv[2], "--markdown") ? zn::frontend::markdown()
                    : !std::strcmp(argv[2], "--codes")    ? zn::frontend::codes()
                                                          : zn::frontend::explain(argv[2]);
    if (out.empty()) { std::fprintf(stderr, "unknown diagnostic code: %s\n", argv[2]); return 1; }
    std::fputs(out.c_str(), stdout);
    return 0;
  }
  std::fputs("usage: zinc --version | lex|parse --check|--dump <file> | explain <code>\n", stderr);
  return 2;
}
