// layout-175 (ZN-281): the flexbox tree of docs/reports/layout-engines.md section 3 built through Yoga, timed: full relayout (root width changes every run), one leaf text dirty, nothing dirty.
// Header row of 6 items, a sidebar of 10 rows (icon + text), a wrapping content area of N cards (title, wrapped body, a row of two buttons with text): N = 16 gives 175 nodes.
// Fake text metrics (7 px per character, 16 px lines) so only the layout engine is timed.  usage: layout_bench [runs] -> JSON on stdout
#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>
#include <yoga/Yoga.h>

static YGSize measureText(YGNodeConstRef n, float width, YGMeasureMode wm, float, YGMeasureMode) {
  const char* text = static_cast<const char*>(YGNodeGetContext(n));
  float chars = static_cast<float>(std::strlen(text)), natural = chars * 7;
  float w = wm == YGMeasureModeUndefined ? natural : std::fmin(natural, width);
  float lines = std::ceil(natural / std::fmax(w, 7.f));
  return {w, lines * 16};
}
struct Tree {
  YGConfigRef cfg = YGConfigNew();
  YGNodeRef root = nullptr, leaf = nullptr;
  int nodes = 0;
  YGNodeRef make(YGNodeRef parent) { YGNodeRef n = YGNodeNewWithConfig(cfg); if (parent) YGNodeInsertChild(parent, n, YGNodeGetChildCount(parent)); nodes++; return n; }
  YGNodeRef text(YGNodeRef parent, const char* s) { YGNodeRef n = make(parent); YGNodeSetContext(n, const_cast<char*>(s)); YGNodeSetMeasureFunc(n, measureText); return n; }
  void build(int cards) {
    root = make(nullptr);
    YGNodeStyleSetFlexDirection(root, YGFlexDirectionColumn); YGNodeStyleSetWidth(root, 1024); YGNodeStyleSetHeight(root, 768);
    YGNodeRef header = make(root);
    YGNodeStyleSetFlexDirection(header, YGFlexDirectionRow); YGNodeStyleSetPadding(header, YGEdgeAll, 8); YGNodeStyleSetGap(header, YGGutterAll, 8);
    for (int i = 0; i < 6; i++) { YGNodeRef item = make(header); YGNodeStyleSetFlexGrow(item, 1); text(item, "Header item"); }
    YGNodeRef body = make(root);
    YGNodeStyleSetFlexDirection(body, YGFlexDirectionRow); YGNodeStyleSetFlexGrow(body, 1);
    YGNodeRef side = make(body);
    YGNodeStyleSetWidthPercent(side, 20); YGNodeStyleSetFlexDirection(side, YGFlexDirectionColumn); YGNodeStyleSetPadding(side, YGEdgeAll, 8); YGNodeStyleSetGap(side, YGGutterAll, 4);
    for (int i = 0; i < 10; i++) { YGNodeRef row = make(side); YGNodeStyleSetFlexDirection(row, YGFlexDirectionRow); YGNodeStyleSetGap(row, YGGutterAll, 6); YGNodeRef icon = make(row); YGNodeStyleSetWidth(icon, 16); YGNodeStyleSetHeight(icon, 16); text(row, "Sidebar entry"); }
    YGNodeRef content = make(body);
    YGNodeStyleSetFlexGrow(content, 1); YGNodeStyleSetFlexDirection(content, YGFlexDirectionRow); YGNodeStyleSetFlexWrap(content, YGWrapWrap); YGNodeStyleSetPadding(content, YGEdgeAll, 8); YGNodeStyleSetGap(content, YGGutterAll, 8);
    for (int i = 0; i < cards; i++) {
      YGNodeRef card = make(content);
      YGNodeStyleSetWidthPercent(card, 31); YGNodeStyleSetFlexDirection(card, YGFlexDirectionColumn); YGNodeStyleSetPadding(card, YGEdgeAll, 8); YGNodeStyleSetGap(card, YGGutterAll, 4);
      text(card, "Card title");
      YGNodeRef body2 = text(card, "A longer body of text that wraps over several lines inside the card, as real content does");
      if (i == cards / 2) leaf = body2;
      YGNodeRef btns = make(card);
      YGNodeStyleSetFlexDirection(btns, YGFlexDirectionRow); YGNodeStyleSetGap(btns, YGGutterAll, 6);
      for (int b = 0; b < 2; b++) { YGNodeRef btn = make(btns); YGNodeStyleSetPadding(btn, YGEdgeAll, 6); text(btn, b ? "Cancel" : "Open"); }
    }
  }
};
static double now() { return std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

int main(int argc, char** argv) {
  int runs = argc > 1 ? std::atoi(argv[1]) : 1000;
  Tree t;
  t.build(16);
  YGNodeCalculateLayout(t.root, 1024, 768, YGDirectionLTR);   // first layout: caches filled
  double full = 0, one = 0, clean = 0;
  for (int i = 0; i < runs; i++) {
    YGNodeStyleSetWidth(t.root, 1000 + (i & 15));   // the root width changes: every cache misses
    double a = now(); YGNodeCalculateLayout(t.root, YGUndefined, YGUndefined, YGDirectionLTR); full += now() - a;
  }
  for (int i = 0; i < runs; i++) {
    YGNodeMarkDirty(t.leaf);
    double a = now(); YGNodeCalculateLayout(t.root, YGUndefined, YGUndefined, YGDirectionLTR); one += now() - a;
  }
  for (int i = 0; i < runs; i++) { double a = now(); YGNodeCalculateLayout(t.root, YGUndefined, YGUndefined, YGDirectionLTR); clean += now() - a; }
  std::printf("{\"engine\":\"yoga-3.2.1\",\"nodes\":%d,\"runs\":%d,\"full_us\":%.3f,\"one_leaf_us\":%.3f,\"clean_us\":%.4f}\n", t.nodes, runs, full / runs, one / runs, clean / runs);
  YGNodeFreeRecursive(t.root);
  YGConfigFree(t.cfg);
}
