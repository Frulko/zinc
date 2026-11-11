#include "text/module.h"
#include <cstdlib>
extern "C" __attribute__((visibility("default"))) const zn::text::Module* zn_text_open() {
  static const zn::text::Module api = [] {
    zn::text::Module value{};
    value.version = 1;
    value.bytes = std::getenv("ZINC_BAD_TEXT_SHORT") ? 8 : sizeof(value);
    return value;
  }();
  return &api;
}
