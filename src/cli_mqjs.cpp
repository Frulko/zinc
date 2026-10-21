// zinc on the mquickjs firmware of the ESP32 (cli_mqjs.h, firmware/esp32-mquickjs/README.md). The program is prepared on the computer: zinc
// bundle links it as for --engine quickjs (the same transform, zinc:gfx's QuickJS module, esbuild), the pinned SWC lowers it to the ES5 that
// mquickjs parses, js/prelude.js adds the library methods mquickjs lacks, zinc-mqjs (the host mquickjs, built beside zinc) runs it for a few
// frames against the board's host calls (js/sim.js) inside the board's heap, then compiles it to 32-bit bytecode. Only that goes to the board,
// into the js partition the firmware runs at start-up.
#include "cli_mqjs.h"

#include <algorithm>
#include <cctype>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <set>
#include <sstream>
#include <thread>

#include <unistd.h>
#ifndef _WIN32
#include <sys/ioctl.h>
#include <sys/wait.h>
#endif

#include "dev/client.h"
#include "frontend/project.h"
#include "qjs/qjs.h"
#include "tc/tc.h"
#include "zn/log.h"

namespace zn::cli {

namespace fs = std::filesystem;

namespace {

constexpr int kHeap = 96 * 1024;               // main/main.c JS_HEAP
constexpr const char* kJsOffset = "0x110000";  // partitions.csv: the js partition, 512 KB
constexpr std::size_t kJsSize = 0x80000;

std::string quote(const std::string& s) { std::string r = "'"; for (char c : s) { if (c == '\'') r += "'\\''"; else r += c; } return r + "'"; }
bool readText(const fs::path& p, std::string& out) { std::ifstream in(p, std::ios::binary); if (!in) return false; std::stringstream ss; ss << in.rdbuf(); out = ss.str(); return true; }
bool writeText(const fs::path& p, const std::string& text) { std::ofstream o(p, std::ios::binary); return static_cast<bool>(o << text); }

// a shell command's exit code, its stdout and stderr in `out`
int capture(const std::string& cmd, std::string& out) {
  out.clear();
  FILE* p = popen((cmd + " 2>&1").c_str(), "r");
  if (!p) return -1;
  char buf[4096];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, p)) > 0;) out.append(buf, n);
  const int rc = pclose(p);
#ifdef _WIN32
  return rc;
#else
  return WIFEXITED(rc) ? WEXITSTATUS(rc) : 1;
#endif
}

std::string mqjsTool(std::string& err) {
  if (const char* e = std::getenv("ZINC_MQJS")) return e;
  const fs::path p = fs::path(zn::tc::executablePath()).parent_path() / "zinc-mqjs";
  std::error_code ec;
  if (fs::exists(p, ec)) return p.string();
  err = "zinc-mqjs, the host mquickjs that checks and compiles the program, is not beside zinc (" + p.string() + "); tools/build zinc-mqjs builds it";
  return "";
}

struct Program {
  std::string work, name, map, img;   // the scratch directory, the program's file name there (<name>.js), its source map, the image for the board
  // the positions of <name>.js in `text` (the traces of the check and of the board), back to the user's files
  std::string mapped(std::string text) const {
    const std::string file = name + ".js:", abs = work + "/" + file;
    for (std::size_t at = 0; (at = text.find(file, at)) != std::string::npos;) {
      if (at > 0 && text[at - 1] == '/') { at += file.size(); continue; }
      text.replace(at, file.size(), abs);
      at += abs.size();
    }
    return zn::qjs::mapStack(text, work + "/" + name + ".js", map);
  }
};

// 0, 1 when the program has errors, 2 for a tool problem
int prepare(const std::string& root, const std::string& entry, const std::string& cacheDir, int frames, Program& p) {
  const fs::path js = fs::path(root) / "firmware/esp32-mquickjs/js";
  const auto t0 = std::chrono::steady_clock::now();
  setenv("ZINC_PLATFORM", "esp32", 1);   // zinc:platform's TARGET and screen are the board's
  setenv("ZINC_SIZE", "240x320", 1);
  zn::qjs::BundleOptions bo;
  bo.engine = "mquickjs";
  bo.entry = fs::absolute(entry).lexically_normal().string();
  bo.stdRoot = fs::path(root + "/lib/std").lexically_normal().string();
  bo.capsFile = root + "/targets/capabilities.json";
  bo.cacheDir = cacheDir;
  bo.work = p.work = zn::tc::home() + "/cache/mquickjs/" + std::to_string(std::hash<std::string>{}(bo.entry));
  bo.out = p.work + "/bundle.js";
  bo.sourcemap = bo.quiet = true;
  std::string err, swc, mqjs, log;
  if (!zn::tc::ensureEsbuild(bo.esbuild, err) || !zn::tc::ensureSwc(swc, err) || (mqjs = mqjsTool(err)).empty()) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 2; }
  zn::log::step("bundle", zn::log::shortPath(bo.entry) + " for mquickjs");
  if (const int rc = zn::qjs::bundle(bo)) return rc;
  // ES5: SWC lowers the linked program, its source map chained to the bundle's (the traces name the user's files)
  const std::string es5File = p.work + "/es5.js";
  if (capture(quote(swc) + " compile --config-file " + quote((js / "swcrc.json").string()) + " " + quote(bo.out) + " --out-file " + quote(es5File), log) != 0) {
    std::fprintf(stderr, "%szinc: SWC cannot lower the program to ES5 (above)\n", log.c_str());
    return 1;
  }
  std::string es5, prelude, post, sim;
  if (!readText(es5File, es5) || !readText(es5File + ".map", p.map) || !readText(js / "prelude.js", prelude) || !readText(js / "post.js", post) || !readText(js / "sim.js", sim)) {
    std::fprintf(stderr, "zinc: cannot read the files of %s or SWC's output in %s\n", js.string().c_str(), p.work.c_str());
    return 2;
  }
  for (std::size_t at; (at = es5.find("//# sourceMappingURL=")) != std::string::npos;) es5.erase(at, es5.find('\n', at) == std::string::npos ? std::string::npos : es5.find('\n', at) - at);
  // the host calls the board does not have (sim.js lists those it has): each one throws when it is called, naming what is missing
  auto ident = [](const std::string& s, std::size_t at) { std::size_t e = at; while (e < s.size() && (std::isalnum(static_cast<unsigned char>(s[e])) || s[e] == '_')) e++; return s.substr(at, e - at); };
  std::set<std::string> have, missing;
  for (std::size_t at = 0; (at = sim.find("function __host_", at)) != std::string::npos; at += 9) have.insert(ident(sim, at + 9));
  for (std::size_t at = 0; (at = es5.find("__host_", at)) != std::string::npos; at += 7) if (!have.count(ident(es5, at))) missing.insert(ident(es5, at));
  std::string head = prelude;
  for (const std::string& h : missing) {
    std::string what = h.substr(7);
    if (what.rfind("gfx", 0) == 0 && what.size() > 3) { what = what.substr(3); what[0] = static_cast<char>(std::tolower(static_cast<unsigned char>(what[0]))); what = "zinc:gfx " + what + "()"; }
    head += "function " + h + "() { throw new Error(\"" + what + " is not on the ESP32 under mquickjs\"); }\n";
  }
  // the helpers of post.js that SWC's output defines, written again after it (the later declaration holds)
  std::string tail;
  for (std::size_t at = post.find("\nfunction "); at != std::string::npos;) {
    const std::size_t next = post.find("\nfunction ", at + 1);
    const std::string fn = post.substr(at + 1, next == std::string::npos ? std::string::npos : next - at - 1);
    if (es5.find(fn.substr(0, fn.find('(') + 1)) != std::string::npos) tail += fn;
    at = next;
  }
  // the program; what comes before the ES5 moves its lines down, and its source map with them (one ';' per line)
  const std::size_t mappings = p.map.find("\"mappings\":\"");
  if (mappings != std::string::npos) p.map.insert(mappings + 12, std::string(std::count(head.begin(), head.end(), '\n'), ';'));
  p.name = fs::path(bo.entry).stem().string();
  if (!writeText(p.work + "/" + p.name + ".js", head + es5 + "\n" + tail) || !writeText(p.work + "/sim.js", "var FRAMES = " + std::to_string(frames) + ";\n" + sim)) return 2;
  // the check: the host mquickjs runs it for `frames` frames against the board's host calls, in twice the board's heap (the computer's values
  // are 8 bytes, the board's 4); from its directory, so that the traces name <name>.js as the board's do
  if (capture("cd " + quote(p.work) + " && " + quote(mqjs) + " --memory-limit " + std::to_string(2 * kHeap) + " -I sim.js " + quote(p.name + ".js"), log) != 0) {
    std::fprintf(stderr, "%szinc: %s fails under mquickjs on the computer (above); nothing was sent to the board\n", p.mapped(log).c_str(), zn::log::shortPath(bo.entry).c_str());
    return 1;
  }
  // the bytecode (32-bit, as the board's words) and the image the firmware reads: "ZNJS", the length, the bytes
  std::string bin;
  if (capture("cd " + quote(p.work) + " && " + quote(mqjs) + " -m32 -o " + quote(p.name + ".bin") + " " + quote(p.name + ".js"), log) != 0 || !readText(p.work + "/" + p.name + ".bin", bin)) {
    std::fprintf(stderr, "%szinc: mquickjs cannot compile %s\n", log.c_str(), zn::log::shortPath(bo.entry).c_str());
    return 1;
  }
  if (bin.size() + 8 > kJsSize) { std::fprintf(stderr, "zinc: the program is %zu bytes of bytecode; the board's js partition holds %zu\n", bin.size(), kJsSize - 8); return 1; }
  std::string image = "ZNJS";
  for (int k = 0; k < 4; ++k) image += static_cast<char>((bin.size() >> (8 * k)) & 0xff);
  p.img = p.work + "/" + p.name + ".img";
  if (!writeText(p.img, image + bin)) return 2;
  zn::log::step("bytecode", std::to_string(bin.size()) + " bytes, checked for " + std::to_string(frames) + " frames under mquickjs", zn::log::since(t0));
  return 0;
}

// the board's firmware, or the emulator's (its panel on SPI: esp32sim's T-Display board)
std::string firmwareImage(const std::string& root, bool emulator, std::string& err) {
  const fs::path f = fs::path(root) / "firmware/esp32-mquickjs/prebuilt" / (emulator ? "zinc-mquickjs-sim-flash.bin" : "zinc-mquickjs-flash.bin");
  std::error_code ec;
  if (fs::exists(f, ec)) return f.string();
  err = "the firmware image is missing: " + f.string() + " (tools/build-esp32-core mquickjs builds it)";
  return "";
}

// The firmware's UART, line by line: its own lines (mqjs: ...) on stderr, the program's print and console.log on stdout, the positions mapped
// to the user's files; the ROM's boot log before the firmware starts is not shown. `rc` becomes 0 when the program ends, 1 when it fails (the
// rest of an error follows its first line within a moment: `failed` is when it began).
struct Uart {
  using clock = std::chrono::steady_clock;
  const Program& p;
  bool firmware = false;
  int rc = -1;
  clock::time_point failed = clock::time_point::max();
  void take(const std::string& l) {
    if (l.rfind("mqjs: ", 0) == 0) {
      firmware = true;
      std::fprintf(stderr, "%s\n", p.mapped(l).c_str());
      if (l.find("the program ended") != std::string::npos) rc = 0;
      else if (l.rfind("mqjs: Error", 0) == 0 || l.rfind("mqjs: Syntax error", 0) == 0 || l.rfind("mqjs: no ", 0) == 0) failed = clock::now();
    } else if (firmware) {
      std::printf("%s\n", p.mapped(l).c_str());
      std::fflush(stdout);
    }
  }
};

int flashFirmware(const std::string& root, std::string port) {
  std::string err, tool;
  const std::string image = firmwareImage(root, false, err);
  if (image.empty() || !zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  if (port.empty()) port = zn::dev::findSerialPort();
  if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in or give --port <path>\n"); return 1; }
  std::fprintf(stderr, "zinc: flashing the mquickjs firmware to %s\n", port.c_str());
  return std::system((quote(tool) + " --chip esp32 -p " + quote(port) + " -b 460800 write-flash 0x0 " + quote(image)).c_str()) == 0 ? 0 : 1;
}

// The program into the js partition (a second for a few KB), then the board's UART: the firmware's lines (mqjs: ...) on stderr, the program's
// print and console.log on stdout, until it ends (0), fails (1) or `runMs` have passed (0). The boot log of the ROM before the firmware is not shown.
int runOnBoard(const Program& p, std::string port, int runMs) {
  using clock = std::chrono::steady_clock;
  std::string err, tool, log;
  if (!zn::tc::ensureEsptool(tool, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  if (port.empty()) port = zn::dev::findSerialPort();
  if (port.empty()) { std::fprintf(stderr, "zinc: no ESP32 found on a serial port; plug it in or give --port <path>\n"); return 1; }
  const auto t = clock::now();
  if (capture(quote(tool) + " --chip esp32 -p " + quote(port) + " -b 460800 write-flash " + kJsOffset + " " + quote(p.img), log) != 0) {
    std::fprintf(stderr, "%szinc: esptool cannot write the program to %s (above)\n", log.c_str(), port.c_str());
    return 1;
  }
  zn::log::step("flash", "the program to " + port + " at " + kJsOffset, zn::log::since(t));
  zn::dev::Link link;
  if (!zn::dev::openSerial(port, 115200, link, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  // esptool's reset ran the program before the port was open: reset again, now that its first lines are read (the USB-serial chip's RTS
  // drives EN and DTR drives GPIO0, as esptool's "hard reset": EN low with GPIO0 high, then EN high)
  int dtr = TIOCM_DTR, rts = TIOCM_RTS;
  ioctl(link.in, TIOCMBIC, &dtr);
  ioctl(link.in, TIOCMBIS, &rts);
  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  ioctl(link.in, TIOCMBIC, &rts);
  const auto start = clock::now();
  Uart uart{p};
  std::string line;
  for (char buf[512]; uart.rc < 0;) {
    const ssize_t n = ::read(link.in, buf, sizeof buf);
    for (ssize_t i = 0; i < n; i++) {
      if (buf[i] == '\n') { uart.take(line); line.clear(); }
      else if (buf[i] != '\r') line += buf[i];
    }
    if (n <= 0) std::this_thread::sleep_for(std::chrono::milliseconds(10));
    const auto now = clock::now();
    const long long ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - start).count();
    if (!uart.firmware && ms > 5000) {
      std::fprintf(stderr, "zinc: the board does not answer as the mquickjs firmware does; zinc flash --target esp32 --engine mquickjs puts it on the board (once)\n");
      uart.rc = 1;
    } else if (uart.failed != clock::time_point::max() && now - uart.failed > std::chrono::milliseconds(500)) uart.rc = 1;
    else if (runMs > 0 && ms > runMs) uart.rc = 0;
  }
  zn::dev::closeLink(link);
  return uart.rc;
}

// The same program in esp32sim (docs/reports/esp32sim.md): the emulator's firmware and the program in its flash, `runMs` of emulated time
// (10 s by default), the UART as on the board, and the last frame as a PNG (ZINC_SHOT, else <name>.png beside the program's files).
int runOnEmulator(const std::string& root, const Program& p, int runMs) {
  std::string err, sim, rom;
  const std::string image = firmwareImage(root, true, err);
  if (image.empty() || !zn::tc::ensureEsp32sim(sim, rom, err)) { std::fprintf(stderr, "zinc: %s\n", err.c_str()); return 1; }
  const char* shot = std::getenv("ZINC_SHOT");
  const std::string png = shot && *shot ? fs::absolute(shot).string() : p.work + "/" + p.name + ".png";
  const int ms = runMs > 0 ? runMs : 10000;
  char seconds[32];
  std::snprintf(seconds, sizeof seconds, "%.3f", ms / 1000.0);
  const auto t = std::chrono::steady_clock::now();
  // the UART on stdout, the emulator's own report on stderr (kept in emulator.log)
  FILE* out = popen((quote(sim) + " --chip esp32 --board ttgo-tdisplay --boot rom --rom " + quote(rom) + " --flash-image " + quote(image) + " --flash-at " + kJsOffset + "=" +
                     quote(p.img) + " --console uart0 --max-seconds " + seconds + " --no-dump --gram-png " + quote(png) + " 2>" + quote(p.work + "/emulator.log")).c_str(), "r");
  if (!out) { std::fprintf(stderr, "zinc: cannot start %s\n", sim.c_str()); return 1; }
  Uart uart{p};
  char buf[4096];
  while (std::fgets(buf, sizeof buf, out)) {
    std::string l = buf;
    while (!l.empty() && (l.back() == '\n' || l.back() == '\r')) l.pop_back();
    uart.take(l);
  }
  const int rc = pclose(out);
  if (!uart.firmware) {
    std::string log;
    readText(p.work + "/emulator.log", log);
    std::fprintf(stderr, "%szinc: the firmware did not start in the emulator (%s, exit %d)\n", log.c_str(), sim.c_str(), rc);
    return 1;
  }
  zn::log::step("emulator", std::to_string(ms) + " ms of an ESP32 in esp32sim", zn::log::since(t));
  zn::log::step("frame", zn::log::shortPath(png));
  return uart.failed != Uart::clock::time_point::max() ? 1 : 0;
}

int exportTo(const std::string& root, const Program& p, const fs::path& out) {
  std::string err;
  const std::string image = firmwareImage(root, false, err);
  if (image.empty()) { std::fprintf(stderr, "zinc export: %s\n", err.c_str()); return 1; }
  std::error_code ec;
  fs::create_directories(out, ec);
  fs::copy_file(image, out / "firmware.bin", fs::copy_options::overwrite_existing, ec);
  if (!ec) fs::copy_file(p.img, out / "app.img", fs::copy_options::overwrite_existing, ec);
  if (ec) { std::fprintf(stderr, "zinc export: cannot write %s: %s\n", out.string().c_str(), ec.message().c_str()); return 1; }
  writeText(out / "flash.sh", "#!/bin/sh\n# Flashes " + p.name + " onto an ESP32-2432S022: the mquickjs firmware at 0x0, the program at " + kJsOffset +
                                  ". Usage: ./flash.sh [port] (ESPTOOL overrides the esptool).\n"
                                  "cd \"$(dirname \"$0\")\" || exit 1\nESPTOOL=${ESPTOOL:-$(zinc toolchain esptool 2>/dev/null || command -v esptool || command -v esptool.py)}\n"
                                  "[ -n \"$ESPTOOL\" ] || { echo \"flash.sh: no esptool (zinc toolchain esptool fetches the pinned one, or pip install esptool)\"; exit 1; }\n"
                                  "exec \"$ESPTOOL\" --chip esp32 ${1:+-p \"$1\"} -b 460800 write-flash 0x0 firmware.bin " + kJsOffset + " app.img\n");
  fs::permissions(out / "flash.sh", fs::perms::owner_all | fs::perms::group_read | fs::perms::group_exec | fs::perms::others_read | fs::perms::others_exec, ec);
  writeText(out / "README.txt", p.name + " (esp32, mquickjs) built with Zinc.\nFlash: ./flash.sh /dev/ttyUSB0. The program starts when the board boots; "
                                "its print and console.log arrive on the UART at 115200 baud.\nAnother program later: zinc run <app> --target esp32 --engine mquickjs writes only the program.\n");
  std::printf("%s\n", out.string().c_str());
  return 0;
}

}  // namespace

bool mquickjsWanted(const std::vector<std::string>& args) {
  if (args.size() < 3 || (args[1] != "run" && args[1] != "export" && args[1] != "flash")) return false;
  for (std::size_t k = 2; k + 1 < args.size() && args[k] != "--"; ++k)
    if (args[k] == "--engine" && args[k + 1] == "mquickjs") return true;
  return false;
}

int mquickjs(const std::vector<std::string>& args, const std::string& root, const std::string& cacheDir) {
  const std::string& cmd = args[1];
  std::string target, port, out, entry = ".";
  int frames = 300, runMs = 0;
  bool emulator = false;
  for (std::size_t k = 2; k < args.size(); ++k) {
    const std::string& a = args[k];
    const bool more = k + 1 < args.size();
    if (a == "--engine" && more) ++k;
    else if (a == "--target" && more) target = args[++k];
    else if (a == "--port" && more) port = args[++k];
    else if (a == "-o" && more) out = args[++k];
    else if (a == "--frames" && more) frames = std::max(1, std::atoi(args[++k].c_str()));
    else if (a == "--run-ms" && more) runMs = std::atoi(args[++k].c_str());
    else if (a == "--emulator") emulator = true;
    else if (a[0] != '-') entry = a;
    else { std::fprintf(stderr, "zinc: unknown option %s\nusage: zinc run|export <app> --target esp32 --engine mquickjs [--port P | --emulator] [-o dir] [--frames N] [--run-ms N]\n", a.c_str()); return 2; }
  }
  if (target != "esp32") { std::fprintf(stderr, "zinc: --engine mquickjs runs on --target esp32 (the board's firmware, firmware/esp32-mquickjs)\n"); return 2; }
  if (cmd == "flash") return flashFirmware(root, port);
  // the entry: a file, or a project's (zinc.json "entry", else src/main.ts...)
  std::error_code ec;
  std::string file = entry;
  fs::path projectDir = fs::absolute(entry).parent_path();
  if (fs::is_directory(entry, ec)) {
    projectDir = fs::canonical(entry, ec);
    std::string manifest, perr;
    zn::frontend::Project proj;
    const bool have = readText(projectDir / "zinc.json", manifest) && zn::frontend::parseProject(manifest, proj, perr);
    file = zn::frontend::entryOf(projectDir.string(), have ? &proj : nullptr);
    if (file.empty()) { std::fprintf(stderr, "zinc: no program in %s (zinc.json \"entry\", src/main.ts or main.ts)\n", entry.c_str()); return 2; }
  }
  if (!fs::exists(file, ec)) { std::fprintf(stderr, "zinc: no such file: %s\n", file.c_str()); return 2; }
  Program p;
  if (const int rc = prepare(root, file, cacheDir, frames, p)) return rc;
  if (cmd == "run") return emulator ? runOnEmulator(root, p, runMs) : runOnBoard(p, port, runMs);
  return exportTo(root, p, out.empty() ? projectDir / "dist" / (projectDir.filename().string() + "-esp32") : fs::path(out));
}

}  // namespace zn::cli
