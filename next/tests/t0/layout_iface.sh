#!/bin/sh
# The host layout interface (ZN-282): src/host/layout.h builds warning-free on its own, an engine can implement it, and its property numbers are those of the PROP table of lib/std/ui.ts.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cat > "$tmp/t.cpp" <<'C'
#include "host/layout.h"
#include <cstdio>
struct Fixed : zn::host::Layout {   // the smallest engine: every node a 10x10 box
  void create(std::int32_t) override {}
  void destroy(std::int32_t) override {}
  void setStyle(std::int32_t, zn::host::LayoutProp, float) override {}
  void insert(std::int32_t, std::int32_t, std::int32_t) override {}
  void remove(std::int32_t, std::int32_t) override {}
  void setText(std::int32_t, std::string_view, const zn::host::WrapStyle&, float) override {}
  void setImage(std::int32_t, float, float) override {}
  void setField(std::int32_t, std::int32_t, float, bool) override {}
  void clearMeasure(std::int32_t) override {}
  const std::vector<std::string>* lines(std::int32_t) const override { return nullptr; }
  const std::vector<double>* lineWidths(std::int32_t) const override { return nullptr; }
  std::uint64_t counter(int) const override { return 0; }
  void markDirty(std::int32_t) override {}
  void calculate(std::int32_t, float, float) override {}
  zn::host::LayoutBox box(std::int32_t) const override { return {0, 0, 10, 10}; }
};
#define P(name) std::printf(#name " %d\n", (int)zn::host::LayoutProp::name)
int main() {
  Fixed f;
  zn::host::Layout& l = f;
  l.calculate(0, 100, 100);
  if (l.box(1).w != 10) return 1;
  P(Width); P(Height); P(WidthPercent); P(HeightPercent); P(FlexDirection); P(FlexWrap); P(JustifyContent); P(AlignItems); P(Position); P(Overflow);
  P(PaddingTop); P(PaddingRight); P(PaddingBottom); P(PaddingLeft); P(MarginTop); P(MarginRight); P(MarginBottom); P(MarginLeft);
  P(Grow); P(Gap); P(Padding); P(Hidden); P(Top); P(Left); P(Right); P(Bottom);
}
C
c++ -std=c++20 -Wall -Wextra -Werror -Isrc "$tmp/t.cpp" -o "$tmp/t" 2>"$tmp/err" || { echo "layout.h: does not build: $(head -c 400 "$tmp/err")"; exit 1; }
"$tmp/t" > "$tmp/ids" || { echo "layout.h: the test engine fails"; exit 1; }
fail=0
while read -r name id; do   # WidthPercent -> P_WIDTH_PERCENT
  p=P_$(echo "$name" | sed 's/\([a-z]\)\([A-Z]\)/\1_\2/g' | tr '[:lower:]' '[:upper:]')
  want=$(sed -n "s/^const $p: i32 = \([0-9]*\);.*/\1/p" ../lib/std/ui.ts)
  [ "$want" = "$id" ] || { echo "layout.h: $name is $id, lib/std/ui.ts has $p = ${want:-missing}"; fail=1; }
done < "$tmp/ids"
[ $fail -eq 0 ] && echo "layout iface: ok"
exit $fail
