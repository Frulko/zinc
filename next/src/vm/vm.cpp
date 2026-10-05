#include "vm/vm.h"

namespace zn::vm {

int run(const std::vector<Op>& code) {
  int n = 0;
  for (Op op : code) {
    ++n;
    if (op == Op::Ret) return n;
  }
  return -1;
}

}  // namespace zn::vm
