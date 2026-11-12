#include "frontend/project.h"
#include <cassert>
int main() {
  zn::frontend::Project p; std::string error;
  assert(zn::frontend::parseProject(R"({"permissions":["wifi","-wifi","bluetooth"]})", p, error));
  assert(!zn::frontend::parseProject(R"({"permissions":["unknown-radio"]})", p, error));
}
