#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
libs=$(cd "$(dirname "$ZINC")" && pwd)
[ -f "$libs/libzn_codec.a" ] || { echo 'skipped: no native codecs'; exit 77; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
cat > "$tmp/test.cpp" <<'CPP'
#include <cstddef>
#include <cassert>
#include <vector>
#include "res/codec.h"
#include "aot/aot.h"
#include "zn/bytecode.h"
#include "zn/runtime.h"
int main() {
  std::vector<std::uint8_t> original(32768);
  for (std::size_t i = 0; i < original.size(); ++i) original[i] = static_cast<std::uint8_t>((i / 512 + i % 7) % 256);
  const auto packed = zn::res::packEmbeddedBlob(original);
  assert(!packed.empty() && packed.size() < original.size());
  std::vector<std::uint8_t> decoded;
  assert(zn::res::unpackEmbeddedBlob(packed.data(), packed.size(), original.size(), decoded));
  assert(decoded == original);
  const auto kept = decoded;
  assert(!zn::res::unpackEmbeddedBlob(packed.data(), packed.size() - 1, original.size(), decoded));
  assert(!zn::res::unpackEmbeddedBlob(packed.data(), packed.size(), original.size() + 1, decoded));
  assert(!zn::res::unpackEmbeddedBlob(packed.data(), packed.size(), original.size() - 1, decoded));
  assert(!zn::res::unpackEmbeddedBlob(nullptr, 0, original.size(), decoded));
  assert(!zn::res::unpackEmbeddedBlob(packed.data(), 3, original.size(), decoded));
  assert(decoded == kept);
  assert(zn::res::packEmbeddedBlob({}).empty());
  zn::zbc::Module module;
  zn::zbc::Function function;
  function.name = "main"; function.nregs = 1;
  function.code = {zn::encAD(zn::Op::LoadI, 0, 42), zn::encABC(zn::Op::RetV, 0)};
  function.consts.push_back({zn::zbc::Cls::I, 7});
  module.functions.push_back(function);
  module.workers.push_back({"child", zn::zbc::encode(module)});
  const auto tables = zn::aot::tableBytes(module);
  const auto packedTables = zn::res::packEmbeddedBlob(tables);
  assert(zn::res::unpackEmbeddedBlob(packedTables.data(), packedTables.size(), tables.size(), decoded));
  assert(decoded == tables);
  assert(!zn::res::unpackEmbeddedBlob(packedTables.data(), packedTables.size() - 1, tables.size(), decoded));
  assert(!zn::res::unpackEmbeddedBlob(packedTables.data(), packedTables.size(), tables.size() + 1, decoded));
  std::vector<std::uint8_t> raw;
  assert(zn::zbc::unpackRuns(tables.data(), tables.size(), raw));
  zn::zbc::Module restored;
  std::string error;
  assert(zn::zbc::decode(raw, restored, error));
  assert(restored.workers.empty() && restored.functions.size() == 1);
  assert(restored.functions[0].code == std::vector<std::uint32_t>{static_cast<std::uint32_t>(zn::Op::Trap)});
  assert(restored.functions[0].consts.empty() && restored.functions[0].handlers.empty());
  assert(!zn::aot::usesNet(module));
  zn::zbc::Module network;
  zn::zbc::ClassInfo stringClass;
  stringClass.name = "string"; stringClass.kind = zn::zbc::CKind::String;
  network.classes.push_back(stringClass);
  function.code = {zn::encAD(zn::Op::Rt, 0, static_cast<unsigned>(zn::Rt::HostSockError)), zn::encABC(zn::Op::RetV, 0)};
  function.consts.clear();
  network.functions.push_back(function);
  assert(zn::zbc::verify(network).empty());
  module.workers.push_back({"network", zn::zbc::encode(network)});
  assert(zn::aot::usesNet(module));
  zn::zbc::Module parent;
  parent.workers.push_back({"nested", zn::zbc::encode(module)});
  assert(zn::aot::usesNet(parent));
  // Classification scans rows, independent of argument/register validation.
  for (const auto row : {zn::Rt::HostOscListen, zn::Rt::HostOscClose, zn::Rt::HostOscSend}) {
    network.functions[0].code[0] = zn::encAD(zn::Op::Rt, 0, static_cast<unsigned>(row));
    assert(zn::aot::usesNet(network));
    zn::zbc::Module child;
    child.workers = {{"osc", zn::zbc::encode(network)}};
    parent.workers = {{"nested", zn::zbc::encode(child)}};
    assert(zn::aot::usesNet(parent));
  }
  parent.workers = {{"damaged", {1, 2, 3}}};
  assert(zn::aot::usesNet(parent));


}
CPP
"${CXX:-c++}" -std=c++20 -I src -I include "$tmp/test.cpp" "$libs/libzn_aot.a" "$libs/libzn_zbc.a" "$libs/libzn_codec.a" "$libs/libzn_webp_dec.a" "$libs/libzn_zstd.a" -o "$tmp/test"
"$tmp/test"
echo 'aot embedded blob: ok'
