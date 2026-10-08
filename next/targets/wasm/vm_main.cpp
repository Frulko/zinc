// The ZBC interpreter as a WASI program (ZN-135): `vm.wasm program.zbc` decodes, verifies and runs a module and prints its output, on wasmtime or Node's WASI, and in a browser through
// targets/wasm/glue.mjs. Only the pure runtime is linked (strings, arrays, Maps, classes, exceptions); programs that need host modules (zinc:gfx, zinc:sys...) run through the JS glue.
#include <cstdio>
#include <string>
#include <vector>

#include "rt/rt.h"
#include "vm/vm.h"
#include "zbc/zbc.h"

int main(int argc, char** argv) {
  if (argc < 2) { std::fprintf(stderr, "usage: vm.wasm program.zbc\n"); return 2; }
  std::FILE* f = std::fopen(argv[1], "rb");   // libc++ for WASI has no file streams
  if (!f) { std::fprintf(stderr, "cannot read %s\n", argv[1]); return 2; }
  std::vector<std::uint8_t> bytes;
  std::uint8_t buf[65536];
  for (std::size_t n; (n = std::fread(buf, 1, sizeof buf, f)) > 0;) bytes.insert(bytes.end(), buf, buf + n);
  std::fclose(f);
  zn::zbc::Module m;
  std::string err;
  if (!zn::zbc::decode(bytes, m, err)) { std::fprintf(stderr, "%s: %s\n", argv[1], err.c_str()); return 1; }
  err = zn::zbc::verify(m);
  if (!err.empty()) { std::fprintf(stderr, "%s: invalid ZBC: %s\n", argv[1], err.c_str()); return 1; }
  std::string out;
  auto res = zn::vm::run(m, out, false);
  return zn::rt::report(res, out, false);
}
