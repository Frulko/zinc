#include <algorithm>
#include <cassert>
#include "frontend/dyn.h"
#include "frontend/inspect.h"

using namespace zn::frontend;

int main() {
  Ast ast;
  Checked checked;
  checked.types.resize(5);
  checked.types[0].k = TK::Any;
  checked.objs.resize(2);
  checked.objs[0].name = "Dyn";
  checked.objs[1].name = "DynNum";
  checked.objs[1].parent = 0;
  checked.types[1].k = checked.types[2].k = TK::Object;
  checked.types[1].obj = 0;
  checked.types[2].obj = 1;
  checked.types[3].k = TK::Void;
  checked.types[4].k = TK::Func;
  checked.types[4].params = {0, 1, 2};
  checked.types[4].minArgs = 3;
  for (TypeId result : {0u, 1u, 2u, 3u}) {
    checked.types[4].elem = result;
    std::vector<std::pair<TypeId, bool>> deps;
    std::vector<TypeId> formatters, aliases;
    const auto source = dynConverter(ast, checked, 4, false, deps, formatters, aliases, [](const Member&) { return std::string(); });
    const auto signature = "return (p0: " + inspectAliasName(0) + ", p1: " + inspectAliasName(1) + ", p2: " + inspectAliasName(2) + "): " + (result == 3 ? "void" : inspectAliasName(result)) + " =>";
    assert(source.find(signature) != std::string::npos);
    assert(deps.empty());
    for (TypeId parameter : {0u, 1u, 2u}) assert(std::find(aliases.begin(), aliases.end(), parameter) != aliases.end());
    if (result == 2) assert(source.find("as " + inspectAliasName(2)) != std::string::npos);
    if (result != 3) assert(std::find(aliases.begin(), aliases.end(), result) != aliases.end());
    deps.clear();
    aliases.clear();
    const auto boxed = dynConverter(ast, checked, 4, true, deps, formatters, aliases, [](const Member&) { return std::string(); });
    assert(boxed.find("as " + inspectAliasName(2)) != std::string::npos);
    assert(deps.empty());
  }
}
