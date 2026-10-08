// The `rn` layout engine (ZN-283): every UiNode layout field of docs/reports/layout-engines.md §5 reaches Yoga (one check per row of the table), boxes are
// parent-relative and rounded, and 1000 create/destroy cycles leave the heap as they found it. Leaves (ZN-284): the line breaking of text_wrap.cpp against
// hand-computed lines, and text, image and field measure with a fixed 10 px advance.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "host/layout.h"

#if defined(__has_feature)
#if __has_feature(address_sanitizer)
#define ZN_ASAN 1   // freed blocks wait in ASan's quarantine: the heap is compared in the plain build, the sanitizers check the accesses
#endif
#endif
#if defined(ZN_ASAN)
static std::size_t heapInUse() { return 0; }
#elif defined(__APPLE__)
#include <malloc/malloc.h>
static std::size_t heapInUse() { malloc_statistics_t s; malloc_zone_statistics(nullptr, &s); return s.size_in_use; }
#elif defined(__GLIBC__)
#include <malloc.h>
static std::size_t heapInUse() { return mallinfo2().uordblks; }
#else
static std::size_t heapInUse() { return 0; }
#endif

using zn::host::Layout;
using zn::host::WrapStyle;

/** A monospace font: 10 px a character (a code point), plus the tracking after each. */
static double mono(void*, std::int32_t, std::string_view s, double tracking) {
  double n = 0;
  for (unsigned char c : s) n += (c & 0xC0) != 0x80;
  return n * (10 + tracking);
}
static const zn::host::TextMetric kMono{mono, nullptr};
using zn::host::LayoutProp;
using P = LayoutProp;

static int failures = 0;
#define CHECK(c) do { if (!(c)) { std::fprintf(stderr, "%s:%d: check failed: %s\n", __FILE__, __LINE__, #c); failures++; } } while (0)

/** A root of w x h (handle 0) with `n` children (handles 1..n) of cw x ch; `row`: a row. */
static std::unique_ptr<Layout> tree(float w, float h, int n, float cw, float ch, bool row) {
  auto l = zn::host::makeYogaLayout(kMono);
  l->create(0);
  l->setStyle(0, P::Width, w);
  l->setStyle(0, P::Height, h);
  l->setStyle(0, P::FlexDirection, row);
  for (int i = 1; i <= n; i++) {
    l->create(i);
    l->setStyle(i, P::Width, cw);
    l->setStyle(i, P::Height, ch);
    l->insert(0, i, i - 1);
  }
  return l;
}
static float x(Layout& l, int h) { return l.box(h).x; }
static float y(Layout& l, int h) { return l.box(h).y; }

static void rowAndWrap() {
  auto l = tree(100, 100, 3, 40, 20, true);
  for (int i = 1; i <= 3; i++) l->setStyle(i, P::Shrink, 0);
  l->calculate(0, 100, 100);
  CHECK(x(*l, 2) == 40 && y(*l, 2) == 0);
  l->setStyle(0, P::FlexWrap, 1);
  l->setStyle(0, P::AlignContent, 0);   // (web defaults stretch the lines over the 100 px)
  l->calculate(0, 100, 100);
  CHECK(x(*l, 3) == 0 && y(*l, 3) == 20);
  l->setStyle(0, P::Reverse, 1);
  l->setStyle(0, P::FlexWrap, 0);
  l->calculate(0, 100, 100);
  CHECK(x(*l, 1) == 60);   // row-reverse: the first child at the end
}
static void justify() {
  const float one[] = {0, 40, 80}, two[][2] = {{0, 80}, {15, 65}, {20, 60}};
  for (int j = 0; j < 3; j++) { auto l = tree(100, 20, 1, 20, 20, true); l->setStyle(0, P::JustifyContent, j); l->calculate(0, 100, 20); CHECK(x(*l, 1) == one[j]); }
  for (int j = 3; j < 6; j++) { auto l = tree(100, 20, 2, 20, 20, true); l->setStyle(0, P::JustifyContent, j); l->calculate(0, 100, 20); CHECK(x(*l, 1) == two[j - 3][0] && x(*l, 2) == two[j - 3][1]); }
}
static void align() {
  const float at[] = {0, 20, 40};
  for (int a = 0; a < 3; a++) { auto l = tree(100, 50, 1, 20, 10, true); l->setStyle(0, P::AlignItems, a); l->calculate(0, 100, 50); CHECK(y(*l, 1) == at[a]); }
  auto l = tree(100, 50, 1, 20, 10, true);
  l->setStyle(1, P::Height, -1);
  l->setStyle(0, P::AlignItems, 3);
  l->calculate(0, 100, 50);
  CHECK(l->box(1).h == 50);   // stretch
  l->setStyle(1, P::AlignSelf, 1);
  l->calculate(0, 100, 50);
  CHECK(l->box(1).h == 0 && y(*l, 1) == 25);   // align-self center overrides stretch
}
static void growAndFull() {
  auto l = tree(100, 20, 2, -1, 20, true);
  l->setStyle(1, P::Grow, 1);
  l->setStyle(2, P::Grow, 3);
  l->calculate(0, 100, 20);
  CHECK(l->box(1).w == 25 && l->box(2).w == 75);
  auto f = tree(200, 50, 1, -1, 10, false);
  f->setStyle(0, P::AlignItems, 0);
  f->setStyle(1, P::FullWidth, 1);
  f->calculate(0, 200, 50);
  CHECK(f->box(1).w == 200);
  f->setStyle(1, P::FullHeight, 1);
  f->calculate(0, 200, 50);
  CHECK(f->box(1).h == 50);
}
static void spacing() {
  auto l = tree(100, 50, 2, 20, 10, true);
  l->setStyle(0, P::Padding, 10);
  l->setStyle(1, P::MarginLeft, 5);
  l->setStyle(0, P::Gap, 7);
  l->calculate(0, 100, 50);
  CHECK(x(*l, 1) == 15 && y(*l, 1) == 10 && x(*l, 2) == 42);
  l->setStyle(0, P::PaddingLeft, 0);
  l->setStyle(0, P::PaddingTop, 3);
  l->setStyle(1, P::MarginTop, 2);
  l->setStyle(0, P::GapX, 1);
  l->calculate(0, 100, 50);
  CHECK(x(*l, 1) == 5 && y(*l, 1) == 5 && x(*l, 2) == 26);
  l->setStyle(0, P::PaddingRight, 4); l->setStyle(0, P::PaddingBottom, 4); l->setStyle(1, P::MarginRight, 1); l->setStyle(1, P::MarginBottom, 1); l->setStyle(0, P::GapY, 2);
  l->calculate(0, 100, 50);
  CHECK(x(*l, 2) == 27);   // margin-right 1 pushes the next child
}
static void sizes() {
  auto l = tree(200, 100, 1, 30, 10, false);
  l->setStyle(0, P::AlignItems, 0);
  l->calculate(0, 200, 100);
  CHECK(l->box(1).w == 30 && l->box(1).h == 10);
  l->setStyle(1, P::WidthPercent, 0.5f);
  l->setStyle(1, P::HeightPercent, 0.25f);
  l->calculate(0, 200, 100);
  CHECK(l->box(1).w == 100 && l->box(1).h == 25);
  l->setStyle(1, P::Width, 10);
  l->setStyle(1, P::MinWidth, 30);
  l->calculate(0, 200, 100);
  CHECK(l->box(1).w == 30);
  l->setStyle(1, P::Width, 150);
  l->setStyle(1, P::MaxWidth, 50);
  l->setStyle(1, P::MinHeight, 40);
  l->calculate(0, 200, 100);
  CHECK(l->box(1).w == 50 && l->box(1).h == 40);
  l->setStyle(1, P::MaxWidth, -1);
  l->setStyle(1, P::MinHeight, -1);
  l->setStyle(1, P::MaxHeight, 5);
  l->calculate(0, 200, 100);
  CHECK(l->box(1).w == 150 && l->box(1).h == 5);
  l->setStyle(1, P::MaxHeight, -1);
  l->setStyle(1, P::Width, 40);
  l->setStyle(1, P::Height, -1);
  l->setStyle(1, P::AspectRatio, 2);
  l->calculate(0, 200, 100);
  CHECK(l->box(1).h == 20);
}
static void flexSide() {
  auto l = tree(100, 20, 2, -1, 20, true);
  l->setStyle(1, P::Basis, 40);
  l->setStyle(2, P::BasisPercent, 0.3f);
  l->calculate(0, 100, 20);
  CHECK(l->box(1).w == 40 && l->box(2).w == 30);
  auto s = tree(100, 20, 2, 80, 20, true);
  s->calculate(0, 100, 20);
  CHECK(s->box(1).w == 50);   // web defaults: shrink 1
  s->setStyle(1, P::Shrink, 0);
  s->setStyle(2, P::Shrink, 0);
  s->calculate(0, 100, 20);
  CHECK(s->box(1).w == 80 && x(*s, 2) == 80);
  auto w = tree(100, 100, 3, 40, 20, true);   // align-content of the wrapped lines
  for (int i = 1; i <= 3; i++) w->setStyle(i, P::Shrink, 0);
  w->setStyle(0, P::FlexWrap, 1);
  w->setStyle(0, P::AlignContent, 2);
  w->calculate(0, 100, 100);
  CHECK(y(*w, 1) == 60 && y(*w, 3) == 80);
}
static void insets() {
  auto l = tree(200, 100, 2, 20, 10, true);
  l->setStyle(1, P::Position, 1);
  l->setStyle(1, P::Left, 10);
  l->setStyle(1, P::Top, 5);
  l->calculate(0, 200, 100);
  CHECK(x(*l, 1) == 10 && y(*l, 1) == 5 && x(*l, 2) == 0);   // out of the flow
  l->setStyle(1, P::Left, -100000);
  l->setStyle(1, P::Top, -100000);
  l->setStyle(1, P::Right, 10);
  l->setStyle(1, P::Bottom, 20);
  l->calculate(0, 200, 100);
  CHECK(x(*l, 1) == 170 && y(*l, 1) == 70);
}
static void scrollHiddenContents() {
  auto l = tree(100, 100, 1, 20, 300, false);
  l->setStyle(0, P::Overflow, 2);
  l->setStyle(1, P::Shrink, 0);   // (as in CSS, a flex item shrinks into a scroll container unless told not to)
  l->calculate(0, 100, 100);
  CHECK(l->box(0).h == 100 && l->box(1).h == 300);   // a scroll view: its content keeps its size
  auto h = tree(100, 20, 2, 20, 20, true);
  h->setStyle(1, P::Hidden, 1);
  h->calculate(0, 100, 20);
  CHECK(h->box(1).w == 0 && x(*h, 2) == 0);
  auto c = tree(100, 20, 1, -1, -1, true);   // a fragment: its children are laid out in its parent
  c->create(2); c->setStyle(2, P::Width, 30); c->setStyle(2, P::Height, 20); c->insert(1, 2, 0);
  c->create(3); c->setStyle(3, P::Width, 30); c->setStyle(3, P::Height, 20); c->insert(0, 3, 1);
  c->setStyle(1, P::Contents, 1);
  c->setStyle(0, P::JustifyContent, 2);
  c->calculate(0, 100, 20);
  CHECK(x(*c, 2) == 40 && x(*c, 3) == 70);
}
static void roundedRelativeBoxes() {
  auto l = zn::host::makeYogaLayout(kMono);
  l->create(0); l->setStyle(0, P::Width, 100); l->setStyle(0, P::Height, 10); l->setStyle(0, P::FlexDirection, 1); l->setStyle(0, P::Padding, 0.4f);
  float sum = 0;
  for (int i = 1; i <= 3; i++) { l->create(i); l->setStyle(i, P::WidthPercent, 1.f / 3); l->setStyle(i, P::Height, 5.6f); l->insert(0, i, i - 1); }
  l->create(4); l->setStyle(4, P::Width, 7.7f); l->setStyle(4, P::Height, 3); l->setStyle(4, P::MarginLeft, 2.2f); l->insert(2, 4, 0);
  l->calculate(0, 100, 10);
  for (int i = 0; i <= 4; i++) { zn::host::LayoutBox b = l->box(i); CHECK(b.x == std::round(b.x) && b.y == std::round(b.y) && b.w == std::round(b.w) && b.h == std::round(b.h)); }
  for (int i = 1; i <= 3; i++) sum += l->box(i).w;
  CHECK(sum == 99 || sum == 100);   // the thirds round to whole pixels and still tile the row
  // absolute = the sum of the parents' lefts, the values YGNodeLayoutGetLeft gives: child 2 at 33 (0.4 + 99.2 / 3), node 4 at 33 + 2 (its margin 2.2)
  CHECK(x(*l, 0) + x(*l, 2) == 33);
  CHECK(x(*l, 0) + x(*l, 2) + x(*l, 4) == 35);
}
static void cycles() {
  auto churn = [] {
    auto l = zn::host::makeYogaLayout(kMono);
    for (int k = 0; k < 1000; k++) {
      l->create(0); l->setStyle(0, P::Width, 300); l->setStyle(0, P::FlexDirection, k & 1);
      for (int i = 1; i <= 8; i++) { l->create(i); l->setStyle(i, P::Grow, i); l->insert(i < 5 ? 0 : i - 4, i, 0); }
      l->setText(8, "a few words to wrap", WrapStyle{0, 14}, 20);
      l->setText(3, "a parent: refused", WrapStyle{0, 14}, 20);   // (node 3 has a child)
      l->calculate(0, 300, 200);
      for (int i = (k & 1) ? 0 : 8; (k & 1) ? i <= 8 : i >= 0; i += (k & 1) ? 1 : -1) l->destroy(i);   // parents first, then children first
    }
  };
  churn();   // the first run settles the allocator's own caches
  const std::size_t before = heapInUse();
  churn();
  const std::size_t after = heapInUse();
  if (after != before) std::fprintf(stderr, "heap %zu -> %zu\n", before, after);
  CHECK(after == before);
}

static std::vector<std::string> wrap(const char* text, double avail, WrapStyle st = WrapStyle{0, 14}) {
  std::vector<std::string> lines;
  std::vector<double> widths;
  zn::host::wrapLines(kMono, st, text, avail, lines, widths);
  return lines;
}
using L = std::vector<std::string>;
static void wrapping() {   // the cases of wrapText, worked out by hand with 10 px characters
  CHECK(wrap("aaaa bbbb cccc dddd", 100) == (L{"aaaa bbbb", "cccc dddd"}));
  CHECK(wrap("aaaa bbbb", 10) == (L{"aaaa bbbb"}));   // no narrower than the font size: one line
  CHECK(wrap("x y", INFINITY) == (L{"x y"}));
  WrapStyle s{0, 14};
  s.wordBreak = 1;
  CHECK(wrap("abcdefghijkl xy", 50, s) == (L{"abcde", "fghij", "kl xy"}));
  s.wordBreak = 2;
  CHECK(wrap("abc def", 30, s) == (L{"abc", " de", "f"}));
  s = WrapStyle{0, 14}; s.clamp = 2;
  CHECK(wrap("aaaa bbbb cccc dddd eeee", 95, s) == (L{"aaaa bbbb", "cccc ddd\u2026"}));
  s = WrapStyle{0, 14}; s.whiteSpace = 1; s.ellipsis = true;
  CHECK(wrap("aaaa bbbb cccc", 75, s) == (L{"aaaa b\u2026"}));
  s = WrapStyle{0, 14}; s.whiteSpace = 2;
  CHECK(wrap("ab\ncd ef", 20, s) == (L{"ab", "cd ef"}));
  s.whiteSpace = 3;
  CHECK(wrap("ab\ncd ef", 30, s) == (L{"ab", "cd", "ef"}));
  s = WrapStyle{0, 14}; s.balance = true;
  CHECK(wrap("aa bb cc dd ee", 120) == (L{"aa bb cc dd", "ee"}) && wrap("aa bb cc dd ee", 120, s) == (L{"aa bb cc", "dd ee"}));
  s = WrapStyle{0, 14}; s.wordSpacing = 5;
  std::vector<std::string> lines; std::vector<double> widths;
  zn::host::wrapLines(kMono, s, "ab cd", 100, lines, widths);
  CHECK(widths.size() == 1 && widths[0] == 55);
  s = WrapStyle{0, 14}; s.tracking = 2;
  zn::host::wrapLines(kMono, s, "abc", 100, lines, widths);
  CHECK(widths[0] == 36);
}
static void textAtFinalWidth() {   // the owner's case: a flex: 1 text in a flex: 1 row in a flex: 1 column wraps at the width it ends with
  auto l = zn::host::makeYogaLayout(kMono);
  l->create(0); l->setStyle(0, P::Width, 100); l->setStyle(0, P::Height, 200);
  l->create(1); l->setStyle(1, P::Grow, 1); l->setStyle(1, P::Shrink, 1); l->setStyle(1, P::Basis, 0); l->insert(0, 1, 0);
  l->create(2); l->setStyle(2, P::FlexDirection, 1); l->setStyle(2, P::AlignItems, 0); l->setStyle(2, P::Grow, 1); l->setStyle(2, P::Shrink, 1); l->setStyle(2, P::Basis, 0); l->insert(1, 2, 0);
  l->create(3); l->setStyle(3, P::Grow, 1); l->setStyle(3, P::Shrink, 1); l->setStyle(3, P::Basis, 0); l->setStyle(3, P::PaddingLeft, 5); l->setStyle(3, P::PaddingRight, 5); l->insert(2, 3, 0);
  l->setText(3, "aaaa bbbb cccc dddd", WrapStyle{0, 14}, 20);
  l->calculate(0, 100, 200);
  CHECK(l->box(3).w == 100 && l->box(3).h == 40);
  CHECK(l->lines(3) && *l->lines(3) == (L{"aaaa bbbb", "cccc dddd"}));
  l->setStyle(0, P::Width, 60);   // narrower: four lines of 40 px in 50 px of content
  l->calculate(0, 60, 200);
  CHECK(l->box(3).h == 80 && l->lines(3)->size() == 4);
  l->setText(3, "aaaa", WrapStyle{0, 14}, 20);
  l->calculate(0, 60, 200);
  CHECK(l->box(3).h == 20 && *l->lines(3) == (L{"aaaa"}));
  CHECK(!l->lines(2));
}
static void imageAndField() {
  auto l = tree(300, 300, 3, -1, -1, false);
  l->setStyle(0, P::AlignItems, 0);
  l->setImage(1, 40, 20);
  l->setField(2, 3, 20, false);
  l->setImage(3, 40, 20);
  l->setStyle(3, P::Width, 100);
  l->calculate(0, 300, 300);
  CHECK(l->box(1).w == 40 && l->box(1).h == 20);    // intrinsic size
  CHECK(l->box(2).w == 200 && l->box(2).h == 60);   // a 3-row field
  CHECK(l->box(3).w == 100 && l->box(3).h == 50);   // the width set, the aspect ratio kept
  l->clearMeasure(1);
  l->calculate(0, 300, 300);
  CHECK(l->box(1).w == 0 && l->box(1).h == 0);
}

int main() {
  wrapping(); textAtFinalWidth(); imageAndField();
  rowAndWrap(); justify(); align(); growAndFull(); spacing(); sizes(); flexSide(); insets(); scrollHiddenContents(); roundedRelativeBoxes(); cycles();
  if (failures) return 1;
  std::puts("layout yoga ok");
}
