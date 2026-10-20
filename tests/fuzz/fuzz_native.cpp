// Fuzz target (ZN-147): the native ABI. The first line of the input is an export signature, the rest feeds its arguments. The signature parser must refuse what it does not know,
// the registry must refuse a malformed export, and a call of a registered export decodes whatever the arguments hold without reading outside them.
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include "zn/native.h"
#include "zn/native_sig.h"

static int32_t echo(void*, ZnCtx*, const ZnVal* args, ZnVal* ret) { ret->i = args ? args[0].i : 0; return ZN_OK; }

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
  if (size > 4096) return 0;
  const char* nl = static_cast<const char*>(std::memchr(data, '\n', size));
  std::string sig(reinterpret_cast<const char*>(data), nl ? static_cast<std::size_t>(nl - reinterpret_cast<const char*>(data)) : size);
  std::string rest = nl ? std::string(nl + 1, reinterpret_cast<const char*>(data) + size) : std::string();
  zn::nsig::Sig parsed;
  bool ok = zn::nsig::parse(sig.c_str(), parsed);
  std::string a, b; char r = 0;
  zn::nsig::parseCallback(sig, a, r);
  static unsigned counter = 0;
  if (!ok || counter > 20000) return 0;
  std::string name = "F" + std::to_string(counter++);
  static std::vector<std::string> keep;   // the registry keeps pointers to the names
  keep.push_back(name); keep.push_back(sig);
  ZnExport ex = {keep[keep.size() - 1].c_str(), keep[keep.size() - 1].c_str(), echo, 0};
  ex.name = "e";
  ZnModule mod = {};
  mod.abi = ZN_ABI_VERSION; mod.size = sizeof mod; mod.name = keep[keep.size() - 2].c_str();
  mod.exports = &ex; mod.nexports = 1;
  char err[256];
  if (zn_register_module(&mod, err, sizeof err) != 0) return 0;
  // arguments from the rest of the input: scalars from 8-byte groups, strings and arrays pointing into a private copy
  std::string pool = rest + std::string(64, '\0');
  std::vector<ZnVal> args(parsed.arity() + 1);
  std::size_t at = 0;
  for (std::size_t i = 0; i < parsed.params.size(); ++i) {
    ZnVal v; std::memset(&v, 0, sizeof v);
    char l = parsed.params[i];
    if (l == 's') { v.s.p = pool.c_str() + (at % rest.size() % 8); v.s.n = static_cast<uint32_t>(std::strlen(v.s.p)); }
    else if (l == 'B' || l == 'I' || l == 'U' || l == 'D' || l == 'S') { v.v.p = pool.data(); v.v.n = 0; }
    else if (at + 8 <= pool.size()) std::memcpy(&v.u, pool.data() + at, 8);
    at += 8;
    args[i] = v;
  }
  ZnVal ret; std::memset(&ret, 0, sizeof ret);
  zn_native_call(mod.name, "e", sig.c_str(), args.data(), &ret, err, sizeof err);
  return 0;
}
