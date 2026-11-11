// Bootstrap reachability must include raw process rows, workers, and legacy native imports.
#include "aot/aot.h"
#include "zn/bytecode.h"
#include "zn/runtime.h"
#include <cassert>
#include <cstdio>

static zn::zbc::Module module(zn::Rt row) {
  zn::zbc::Module m;
  zn::zbc::Function f;
  f.name = "main"; f.ret = {}; f.nregs = 4;
  f.code = {zn::encAD(zn::Op::Rt, 0, static_cast<unsigned>(row)), zn::encABC(zn::Op::RetV, 0)};
  m.functions.push_back(f); return m;
}
static void check(const zn::zbc::Module& m, bool wanted) {
  std::string text = zn::aot::emitCpp(m);
  auto start = text.find("int main(");
  auto dispatch = text.find("  zn::plat::dispatchProcessGuard(argc, argv);", start);
  auto marker = text.find("  // ZINC_PROGRAM_START", start);
  assert(marker != std::string::npos);
  assert((dispatch != std::string::npos) == wanted);
  if (wanted) assert(dispatch < marker);
  auto args = text.find("  zn::host::setProgramArgs", start);
  if (wanted && args != std::string::npos) assert(dispatch < args);
}
int main() {
  auto plain = module(zn::Rt::HostSysPid);
  check(plain, false);
  for (auto row : {zn::Rt::HostProcSpawnEx, zn::Rt::HostProcSpawn}) {
    auto child = module(row); check(child, true);
    auto parent = plain; parent.workers.push_back({"child", zn::zbc::encode(child)}); check(parent, true);
  }
  auto native = plain; native.natives.push_back({"Process", "spawn", "ssss>i"}); check(native, true);
  auto malformed = plain; malformed.workers.push_back({"unknown", {1, 2, 3}}); check(malformed, true);
  std::puts("AOT process bootstrap reachability: PASS");
}
