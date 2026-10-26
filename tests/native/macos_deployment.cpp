#include "tc/bundle.h"
#include <iostream>
int main() {
  zn::tc::BundleSpec spec;
  spec.id = "dev.zinc.test.minimum";
  std::cout << zn::tc::infoPlist(spec, false);
}
