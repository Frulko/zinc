// The `rn` layout engine (ZN-283, docs/reports/layout-engines.md §5): Yoga 3.2.1 behind zn::host::Layout. One YGNode per UI node handle, kept in a table indexed
// by the handle; the UI node itself gets no field. Boxes come back parent-relative and rounded by Yoga (point scale factor 1). Leaves (text, image, text field)
// are measured here with the port of wrapText (text_wrap.cpp), never by calling back into the program (ZN-284).
#include <cmath>
#include <vector>

#include <yoga/Yoga.h>

#include "host/layout.h"

namespace zn::host {
namespace {

constexpr float kUnsetInset = -100000;   // UNSET of lib/std/ui.ts
constexpr std::int32_t kPercent = 2000;   // LayoutProp + kPercent: the same property as a percentage (layout.h)

class YogaLayout final : public Layout {
 public:
  YogaLayout(TextMetric metric, bool webDefaults) : metric_(metric), config_(YGConfigNew()) {
    YGConfigSetPointScaleFactor(config_, 1);
    YGConfigSetUseWebDefaults(config_, webDefaults);
  }
  ~YogaLayout() override {
    for (Rec& r : nodes_) if (r.node) YGNodeFree(r.node);
    YGConfigFree(config_);
  }

  void create(std::int32_t h) override {
    if (h < 0) return;
    if (static_cast<std::size_t>(h) >= nodes_.size()) nodes_.resize(static_cast<std::size_t>(h) + 1);
    Rec& r = nodes_[static_cast<std::size_t>(h)];
    if (r.node) YGNodeFree(r.node);
    r = Rec{};
    r.node = YGNodeNewWithConfig(config_);
  }
  void destroy(std::int32_t h) override {   // YGNodeFree detaches it from its parent and its children from it
    if (Rec* r = rec(h)) { YGNodeFree(r->node); *r = Rec{}; }
  }
  void insert(std::int32_t parent, std::int32_t child, std::int32_t index) override {
    Rec *p = rec(parent), *c = rec(child);
    if (!p || !c || p->leaf) return;   // a measured leaf has no children in Yoga (the spans of a text are measured with it)
    if (YGNodeRef owner = YGNodeGetOwner(c->node)) YGNodeRemoveChild(owner, c->node);
    const std::size_t count = YGNodeGetChildCount(p->node);
    YGNodeInsertChild(p->node, c->node, index < 0 || static_cast<std::size_t>(index) > count ? count : static_cast<std::size_t>(index));
  }
  void remove(std::int32_t parent, std::int32_t child) override {
    Rec *p = rec(parent), *c = rec(child);
    if (p && c) YGNodeRemoveChild(p->node, c->node);
  }
  void setText(std::int32_t h, std::string_view text, const WrapStyle& style, float lineHeight) override {
    Leaf* f = leaf(h, Leaf::Text);
    if (!f) return;
    const bool same = f->text == text && f->lineHeight == lineHeight && sameStyle(f->style, style);
    f->text.assign(text);
    f->style = style;
    f->lineHeight = lineHeight;
    if (!same) { f->wrappedAt = -1; YGNodeMarkDirty(rec(h)->node); }
  }
  void setImage(std::int32_t h, float width, float height) override {
    Leaf* f = leaf(h, Leaf::Image);
    if (!f || (f->imageW == width && f->imageH == height)) return;
    f->imageW = width; f->imageH = height;
    YGNodeMarkDirty(rec(h)->node);
  }
  void setField(std::int32_t h, std::int32_t rows, float lineHeight, bool fullWidth) override {
    Leaf* f = leaf(h, Leaf::Field);
    if (!f || (f->rows == rows && f->lineHeight == lineHeight && f->fullWidth == fullWidth)) return;
    f->rows = rows; f->lineHeight = lineHeight; f->fullWidth = fullWidth;
    YGNodeMarkDirty(rec(h)->node);
  }
  void clearMeasure(std::int32_t h) override {
    Rec* r = rec(h);
    if (!r || !r->leaf) return;
    YGNodeMarkDirty(r->node);   // (only a node with a measure function can be marked)
    YGNodeSetMeasureFunc(r->node, nullptr);
    YGNodeSetContext(r->node, nullptr);
    r->leaf.reset();
  }
  const std::vector<std::string>* lines(std::int32_t h) const override { const Rec* r = rec(h); return r && r->leaf && r->leaf->kind == Leaf::Text ? &r->leaf->lines : nullptr; }
  std::uint64_t counter(int which) const override { return which == 0 ? measures_ : calculates_; }
  const std::vector<double>* lineWidths(std::int32_t h) const override { const Rec* r = rec(h); return r && r->leaf && r->leaf->kind == Leaf::Text ? &r->leaf->widths : nullptr; }
  void markDirty(std::int32_t h) override {
    Rec* r = rec(h);
    if (r && YGNodeHasMeasureFunc(r->node)) YGNodeMarkDirty(r->node);   // Yoga dirties ancestors itself; a node without a measure function is dirtied by its style setters
  }
  void calculate(std::int32_t root, float width, float height) override {
    Rec* r = rec(root);
    if (!r) return;
    ++calculates_;
    YGNodeCalculateLayout(r->node, width, height, YGDirectionLTR);
    // the lines the painter draws: wrapped again at the final content width when the last measure ran at another one (a flex item is measured
    // before it grows or shrinks); ponytail: a pass over every text leaf, per subtree if layouts of several roots share an engine
    for (Rec& t : nodes_) {
      if (!t.leaf || t.leaf->kind != Leaf::Text) continue;
      const double avail = YGNodeLayoutGetWidth(t.node) - YGNodeLayoutGetPadding(t.node, YGEdgeLeft) - YGNodeLayoutGetPadding(t.node, YGEdgeRight);
      if (t.leaf->wrappedAt != avail) wrap(*t.leaf, avail);
    }
  }
  LayoutBox box(std::int32_t h) const override {
    const Rec* r = rec(h);
    if (!r) return {};
    return {YGNodeLayoutGetLeft(r->node), YGNodeLayoutGetTop(r->node), YGNodeLayoutGetWidth(r->node), YGNodeLayoutGetHeight(r->node)};
  }

  void setStyle(std::int32_t h, LayoutProp prop, float v) override {
    Rec* r = rec(h);
    if (!r) return;
    YGNodeRef n = r->node;
    if (static_cast<std::int32_t>(prop) >= kPercent) { percent(n, static_cast<LayoutProp>(static_cast<std::int32_t>(prop) - kPercent), v * 100); return; }
    switch (prop) {
      case LayoutProp::Width: v < 0 ? YGNodeStyleSetWidthAuto(n) : YGNodeStyleSetWidth(n, v); break;
      case LayoutProp::Height: v < 0 ? YGNodeStyleSetHeightAuto(n) : YGNodeStyleSetHeight(n, v); break;
      case LayoutProp::WidthPercent: YGNodeStyleSetWidthPercent(n, v * 100); break;
      case LayoutProp::HeightPercent: YGNodeStyleSetHeightPercent(n, v * 100); break;
      case LayoutProp::FullWidth: if (v != 0) YGNodeStyleSetWidthPercent(n, 100); else YGNodeStyleSetWidthAuto(n); break;   // w-full is width 100% here, CSS-like
      case LayoutProp::FullHeight: if (v != 0) YGNodeStyleSetHeightPercent(n, 100); else YGNodeStyleSetHeightAuto(n); break;
      case LayoutProp::FlexDirection: r->row = v != 0; direction(*r); break;
      case LayoutProp::Reverse: r->reverse = v != 0; direction(*r); break;
      case LayoutProp::FlexWrap: YGNodeStyleSetFlexWrap(n, v >= 2 ? YGWrapWrapReverse : v != 0 ? YGWrapWrap : YGWrapNoWrap); break;
      case LayoutProp::JustifyContent: {
        static const YGJustify j[] = {YGJustifyFlexStart, YGJustifyCenter, YGJustifyFlexEnd, YGJustifySpaceBetween, YGJustifySpaceAround, YGJustifySpaceEvenly};
        YGNodeStyleSetJustifyContent(n, j[index(v, 6)]);
        break;
      }
      case LayoutProp::AlignItems: YGNodeStyleSetAlignItems(n, align(v)); break;
      case LayoutProp::AlignSelf: YGNodeStyleSetAlignSelf(n, v < 0 ? YGAlignAuto : align(v)); break;
      case LayoutProp::AlignContent: {
        static const YGAlign a[] = {YGAlignFlexStart, YGAlignCenter, YGAlignFlexEnd, YGAlignStretch, YGAlignSpaceBetween, YGAlignSpaceAround, YGAlignSpaceEvenly};
        YGNodeStyleSetAlignContent(n, v < 0 ? YGAlignFlexStart : a[index(v, 7)]);
        break;
      }
      case LayoutProp::Position: YGNodeStyleSetPositionType(n, v >= 2 ? YGPositionTypeStatic : v != 0 ? YGPositionTypeAbsolute : YGPositionTypeRelative); break;
      case LayoutProp::BoxSizing: YGNodeStyleSetBoxSizing(n, v != 0 ? YGBoxSizingContentBox : YGBoxSizingBorderBox); break;
      case LayoutProp::BorderTopWidth: YGNodeStyleSetBorder(n, YGEdgeTop, v); break;
      case LayoutProp::BorderRightWidth: YGNodeStyleSetBorder(n, YGEdgeRight, v); break;
      case LayoutProp::BorderBottomWidth: YGNodeStyleSetBorder(n, YGEdgeBottom, v); break;
      case LayoutProp::BorderLeftWidth: YGNodeStyleSetBorder(n, YGEdgeLeft, v); break;
      case LayoutProp::Top: inset(n, YGEdgeTop, v); break;
      case LayoutProp::Left: inset(n, YGEdgeLeft, v); break;
      case LayoutProp::Right: inset(n, YGEdgeRight, v); break;
      case LayoutProp::Bottom: inset(n, YGEdgeBottom, v); break;
      case LayoutProp::Overflow: YGNodeStyleSetOverflow(n, v >= 2 ? YGOverflowScroll : v != 0 ? YGOverflowHidden : YGOverflowVisible); break;
      case LayoutProp::PaddingTop: YGNodeStyleSetPadding(n, YGEdgeTop, v); break;
      case LayoutProp::PaddingRight: YGNodeStyleSetPadding(n, YGEdgeRight, v); break;
      case LayoutProp::PaddingBottom: YGNodeStyleSetPadding(n, YGEdgeBottom, v); break;
      case LayoutProp::PaddingLeft: YGNodeStyleSetPadding(n, YGEdgeLeft, v); break;
      case LayoutProp::Padding: YGNodeStyleSetPadding(n, YGEdgeAll, v); break;
      case LayoutProp::MarginTop: margin(n, YGEdgeTop, v); break;
      case LayoutProp::MarginRight: margin(n, YGEdgeRight, v); break;
      case LayoutProp::MarginBottom: margin(n, YGEdgeBottom, v); break;
      case LayoutProp::MarginLeft: margin(n, YGEdgeLeft, v); break;
      case LayoutProp::Grow: YGNodeStyleSetFlexGrow(n, v); break;
      case LayoutProp::Shrink: YGNodeStyleSetFlexShrink(n, v < 0 ? YGUndefined : v); break;   // undefined: the config's default (1 with web defaults, 0 otherwise)
      case LayoutProp::Basis: v < 0 ? YGNodeStyleSetFlexBasisAuto(n) : YGNodeStyleSetFlexBasis(n, v); break;
      case LayoutProp::BasisPercent: YGNodeStyleSetFlexBasisPercent(n, v * 100); break;
      case LayoutProp::Gap: YGNodeStyleSetGap(n, YGGutterAll, v); break;
      case LayoutProp::GapX: YGNodeStyleSetGap(n, YGGutterColumn, v < 0 ? YGUndefined : v); break;
      case LayoutProp::GapY: YGNodeStyleSetGap(n, YGGutterRow, v < 0 ? YGUndefined : v); break;
      case LayoutProp::MinWidth: YGNodeStyleSetMinWidth(n, v < 0 ? YGUndefined : v); break;
      case LayoutProp::MaxWidth: YGNodeStyleSetMaxWidth(n, v < 0 ? YGUndefined : v); break;
      case LayoutProp::MinHeight: YGNodeStyleSetMinHeight(n, v < 0 ? YGUndefined : v); break;
      case LayoutProp::MaxHeight: YGNodeStyleSetMaxHeight(n, v < 0 ? YGUndefined : v); break;
      case LayoutProp::AspectRatio: YGNodeStyleSetAspectRatio(n, v > 0 ? v : YGUndefined); break;
      case LayoutProp::Hidden: r->hidden = v != 0; display(*r); break;
      case LayoutProp::Contents: r->contents = v != 0; display(*r); break;
      case LayoutProp::Direction: YGNodeStyleSetDirection(n, v > 0 ? YGDirectionRTL : v == 0 ? YGDirectionLTR : YGDirectionInherit); break;
    }
  }

 private:
  struct Leaf {   // a measured node; its address is the YGNode's context, so it lives on the heap (the node table grows)
    enum Kind { Text, Image, Field } kind = Text;
    const YogaLayout* engine = nullptr;
    std::string text;
    WrapStyle style;
    float lineHeight = 0, imageW = 0, imageH = 0;
    std::int32_t rows = 1;
    bool fullWidth = false;
    double wrappedAt = -1;   // the width `lines` were wrapped at
    std::vector<std::string> lines;
    std::vector<double> widths;
  };
  struct Rec { YGNodeRef node = nullptr; bool row = false, reverse = false, hidden = false, contents = false; std::unique_ptr<Leaf> leaf; };

  Leaf* leaf(std::int32_t h, Leaf::Kind kind) {
    Rec* r = rec(h);
    if (!r || YGNodeGetChildCount(r->node) > 0) return nullptr;   // Yoga refuses a measure function on a node with children
    if (!r->leaf || r->leaf->kind != kind) {
      r->leaf = std::make_unique<Leaf>();
      r->leaf->kind = kind;
      r->leaf->engine = this;
      YGNodeSetContext(r->node, r->leaf.get());
      YGNodeSetMeasureFunc(r->node, &YogaLayout::measure);
    }
    return r->leaf.get();
  }
  static bool sameStyle(const WrapStyle& a, const WrapStyle& b) {
    return a.font == b.font && a.size == b.size && a.tracking == b.tracking && a.wordSpacing == b.wordSpacing && a.whiteSpace == b.whiteSpace && a.wordBreak == b.wordBreak &&
           a.clamp == b.clamp && a.ellipsis == b.ellipsis && a.balance == b.balance;
  }
  void wrap(Leaf& f, double avail) const {
    wrapLines(metric_, f.style, f.text, avail, f.lines, f.widths);
    f.wrappedAt = avail;
  }
  /** Yoga asks a leaf its size under the constraints: `width` is the content width (the padding is Yoga's), exact, at most, or none. */
  static YGSize measure(YGNodeConstRef node, float width, YGMeasureMode wm, float height, YGMeasureMode hm) {
    Leaf& f = *static_cast<Leaf*>(YGNodeGetContext(node));
    ++f.engine->measures_;
    const bool wExact = wm == YGMeasureModeExactly, hExact = hm == YGMeasureModeExactly;
    if (f.kind == Leaf::Text) {   // as measure() of ui.ts: the widest line, rounded up, and one line height per line
      const double avail = wm == YGMeasureModeUndefined ? INFINITY : width;
      if (f.wrappedAt != avail) f.engine->wrap(f, avail);
      double widest = 0;
      for (double w : f.widths) widest = std::max(widest, w);
      return {wExact ? width : static_cast<float>(std::ceil(widest)), hExact ? height : f.lineHeight * static_cast<float>(f.lines.size())};
    }
    if (f.kind == Leaf::Image) {   // the intrinsic size, the aspect ratio kept when one side is set
      float w = f.imageW, h = f.imageH;
      if (wExact && hExact) { w = width; h = height; }
      else if (wExact) { w = width; h = f.imageW > 0 ? std::round(width * f.imageH / f.imageW) : f.imageH; }
      else if (hExact) { h = height; w = f.imageH > 0 ? std::round(height * f.imageW / f.imageH) : f.imageW; }
      return {w, h};
    }
    return {wExact ? width : f.fullWidth ? 0.f : 200.f, hExact ? height : f.lineHeight * static_cast<float>(f.rows)};   // a text field
  }

  Rec* rec(std::int32_t h) { return h >= 0 && static_cast<std::size_t>(h) < nodes_.size() && nodes_[static_cast<std::size_t>(h)].node ? &nodes_[static_cast<std::size_t>(h)] : nullptr; }
  const Rec* rec(std::int32_t h) const { return const_cast<YogaLayout*>(this)->rec(h); }
  static int index(float v, int count) { const int i = static_cast<int>(v); return i < 0 ? 0 : i >= count ? count - 1 : i; }
  static YGAlign align(float v) { static const YGAlign a[] = {YGAlignFlexStart, YGAlignCenter, YGAlignFlexEnd, YGAlignStretch, YGAlignBaseline}; return a[index(v, 5)]; }
  // A percent length (ZN-382): the property's number + kPercent, the value a percentage of the containing block.
  static void percent(YGNodeRef n, LayoutProp p, float v) {
    switch (p) {
      case LayoutProp::PaddingTop: YGNodeStyleSetPaddingPercent(n, YGEdgeTop, v); break;
      case LayoutProp::PaddingRight: YGNodeStyleSetPaddingPercent(n, YGEdgeRight, v); break;
      case LayoutProp::PaddingBottom: YGNodeStyleSetPaddingPercent(n, YGEdgeBottom, v); break;
      case LayoutProp::PaddingLeft: YGNodeStyleSetPaddingPercent(n, YGEdgeLeft, v); break;
      case LayoutProp::MarginTop: YGNodeStyleSetMarginPercent(n, YGEdgeTop, v); break;
      case LayoutProp::MarginRight: YGNodeStyleSetMarginPercent(n, YGEdgeRight, v); break;
      case LayoutProp::MarginBottom: YGNodeStyleSetMarginPercent(n, YGEdgeBottom, v); break;
      case LayoutProp::MarginLeft: YGNodeStyleSetMarginPercent(n, YGEdgeLeft, v); break;
      case LayoutProp::Top: YGNodeStyleSetPositionPercent(n, YGEdgeTop, v); break;
      case LayoutProp::Left: YGNodeStyleSetPositionPercent(n, YGEdgeLeft, v); break;
      case LayoutProp::Right: YGNodeStyleSetPositionPercent(n, YGEdgeRight, v); break;
      case LayoutProp::Bottom: YGNodeStyleSetPositionPercent(n, YGEdgeBottom, v); break;
      case LayoutProp::Gap: YGNodeStyleSetGapPercent(n, YGGutterAll, v); break;
      case LayoutProp::GapX: YGNodeStyleSetGapPercent(n, YGGutterColumn, v); break;
      case LayoutProp::GapY: YGNodeStyleSetGapPercent(n, YGGutterRow, v); break;
      case LayoutProp::MinWidth: YGNodeStyleSetMinWidthPercent(n, v); break;
      case LayoutProp::MaxWidth: YGNodeStyleSetMaxWidthPercent(n, v); break;
      case LayoutProp::MinHeight: YGNodeStyleSetMinHeightPercent(n, v); break;
      case LayoutProp::MaxHeight: YGNodeStyleSetMaxHeightPercent(n, v); break;
      default: break;
    }
  }
  static void margin(YGNodeRef n, YGEdge e, float v) { if (v <= kUnsetInset) YGNodeStyleSetMarginAuto(n, e); else YGNodeStyleSetMargin(n, e, v); }   // unset: auto (ZN-380)
  static void inset(YGNodeRef n, YGEdge e, float v) { YGNodeStyleSetPosition(n, e, v <= kUnsetInset ? YGUndefined : v); }   // undefined, not auto: an absolute node without insets keeps its static position
  static void direction(const Rec& r) {
    YGNodeStyleSetFlexDirection(r.node, r.row ? (r.reverse ? YGFlexDirectionRowReverse : YGFlexDirectionRow) : (r.reverse ? YGFlexDirectionColumnReverse : YGFlexDirectionColumn));
  }
  static void display(const Rec& r) { YGNodeStyleSetDisplay(r.node, r.hidden ? YGDisplayNone : r.contents ? YGDisplayContents : YGDisplayFlex); }

  TextMetric metric_;
  mutable std::uint64_t measures_ = 0;   // (counted from the measure callback, which only sees the engine as const)
  std::uint64_t calculates_ = 0;
  YGConfigRef config_;
  std::vector<Rec> nodes_;
};

}  // namespace

std::unique_ptr<Layout> makeYogaLayout(TextMetric metric, bool webDefaults) { return std::make_unique<YogaLayout>(metric, webDefaults); }

}  // namespace zn::host
