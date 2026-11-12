#include "frontend/native_gen.h"
#include <cassert>
#include <iostream>
#include <string>
int main(int argc, char**) {
  const std::string decls = "type Maybe=number|null; interface P { n?:number; alias?:Maybe; u:number|undefined; nill:number|null; both:number|null|undefined; }";
  const auto wire = zn::frontend::schemaOfType(decls, "P");
  assert(wire == "{n:?d,alias:??d,u:?d,nill:?d,both:?d}");
  std::cout << wire << '\n';
  if (argc > 1) return 0;
  const auto checked = zn::frontend::schemaOfType(decls, "P", true);
  assert(checked == "@P{n:~d,alias:~?d,u:~d,nill:?d,both:~?d}");
  assert(zn::frontend::schemaOfType(decls,"number|undefined",true)=="~d");
  assert(zn::frontend::schemaOfType(decls,"number|null",true)=="?d");
}
