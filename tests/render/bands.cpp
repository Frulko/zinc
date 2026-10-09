#include "render_bands.h"
#include <array>
#include <cassert>

static void render(void* context, int32_t first, int32_t last) {
  auto& rows = *static_cast<std::array<int, 97>*>(context);
  assert(first >= 3 && last <= 94 && first < last);
  for (int32_t row = first; row < last; ++row) rows[row]++;
}

int main() {
  // The display pool intentionally lives for the process lifetime.
  auto& pool = *new zbands::Pool;
  pool.init();
  std::array<int, 97> rows{};
  for (int frame = 1; frame <= 64; ++frame) {
    pool.run(3, 94, 13, render, &rows);
    for (int row = 0; row < 97; ++row)
      assert(rows[row] == (row >= 3 && row < 94 ? frame : 0));
  }
}
