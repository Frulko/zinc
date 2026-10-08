// The `rn` layout engine (ZN-283, docs/reports/layout-engines.md §5): Yoga 3.2.1 behind zn::host::Layout. One YGNode per UI node handle, kept in a table indexed
// by the handle; the UI node itself gets no field. Boxes come back parent-relative and rounded by Yoga (point scale factor 1).
#include <vector>

#include <yoga/Yoga.h>

#include "host/layout.h"

namespace zn::host {
namespace {

constexpr float kUnsetInset = -100000;   // UNSET of lib/std/ui.ts

class YogaLayout final : public Layout {
 public:
  explicit YogaLayout(bool webDefaults) : config_(YGConfigNew()) {
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
    if (!p || !c) return;
    if (YGNodeRef owner = YGNodeGetOwner(c->node)) YGNodeRemoveChild(owner, c->node);
    const std::size_t count = YGNodeGetChildCount(p->node);
    YGNodeInsertChild(p->node, c->node, index < 0 || static_cast<std::size_t>(index) > count ? count : static_cast<std::size_t>(index));
  }
  void remove(std::int32_t parent, std::int32_t child) override {
    Rec *p = rec(parent), *c = rec(child);
    if (p && c) YGNodeRemoveChild(p->node, c->node);
  }
  void setMeasure(std::int32_t h, MeasureKind kind, std::int32_t textId, std::int32_t fontId, std::int32_t sizeX64, float tracking) override {
    if (Rec* r = rec(h)) r->measure = {kind, textId, fontId, sizeX64, tracking};   // (the measure callbacks that read it: ZN-284)
  }
  void markDirty(std::int32_t h) override {
    Rec* r = rec(h);
    if (r && YGNodeHasMeasureFunc(r->node)) YGNodeMarkDirty(r->node);   // Yoga dirties ancestors itself; a node without a measure function is dirtied by its style setters
  }
  void calculate(std::int32_t root, float width, float height) override {
    if (Rec* r = rec(root)) YGNodeCalculateLayout(r->node, width, height, YGDirectionLTR);
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
    switch (prop) {
      case LayoutProp::Width: v < 0 ? YGNodeStyleSetWidthAuto(n) : YGNodeStyleSetWidth(n, v); break;
      case LayoutProp::Height: v < 0 ? YGNodeStyleSetHeightAuto(n) : YGNodeStyleSetHeight(n, v); break;
      case LayoutProp::WidthPercent: YGNodeStyleSetWidthPercent(n, v * 100); break;
      case LayoutProp::HeightPercent: YGNodeStyleSetHeightPercent(n, v * 100); break;
      case LayoutProp::FullWidth: if (v != 0) YGNodeStyleSetWidthPercent(n, 100); else YGNodeStyleSetWidthAuto(n); break;   // w-full is width 100% here, CSS-like
      case LayoutProp::FullHeight: if (v != 0) YGNodeStyleSetHeightPercent(n, 100); else YGNodeStyleSetHeightAuto(n); break;
      case LayoutProp::FlexDirection: r->row = v != 0; direction(*r); break;
      case LayoutProp::Reverse: r->reverse = v != 0; direction(*r); break;
      case LayoutProp::FlexWrap: YGNodeStyleSetFlexWrap(n, v != 0 ? YGWrapWrap : YGWrapNoWrap); break;
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
      case LayoutProp::Position: YGNodeStyleSetPositionType(n, v != 0 ? YGPositionTypeAbsolute : YGPositionTypeRelative); break;
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
      case LayoutProp::MarginTop: YGNodeStyleSetMargin(n, YGEdgeTop, v); break;
      case LayoutProp::MarginRight: YGNodeStyleSetMargin(n, YGEdgeRight, v); break;
      case LayoutProp::MarginBottom: YGNodeStyleSetMargin(n, YGEdgeBottom, v); break;
      case LayoutProp::MarginLeft: YGNodeStyleSetMargin(n, YGEdgeLeft, v); break;
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
    }
  }

 private:
  struct Measure { MeasureKind kind = MeasureKind::None; std::int32_t textId = 0, fontId = 0, sizeX64 = 0; float tracking = 0; };
  struct Rec { YGNodeRef node = nullptr; bool row = false, reverse = false, hidden = false, contents = false; Measure measure; };

  Rec* rec(std::int32_t h) { return h >= 0 && static_cast<std::size_t>(h) < nodes_.size() && nodes_[static_cast<std::size_t>(h)].node ? &nodes_[static_cast<std::size_t>(h)] : nullptr; }
  const Rec* rec(std::int32_t h) const { return const_cast<YogaLayout*>(this)->rec(h); }
  static int index(float v, int count) { const int i = static_cast<int>(v); return i < 0 ? 0 : i >= count ? count - 1 : i; }
  static YGAlign align(float v) { static const YGAlign a[] = {YGAlignFlexStart, YGAlignCenter, YGAlignFlexEnd, YGAlignStretch}; return a[index(v, 4)]; }
  static void inset(YGNodeRef n, YGEdge e, float v) { if (v <= kUnsetInset) YGNodeStyleSetPositionAuto(n, e); else YGNodeStyleSetPosition(n, e, v); }
  static void direction(const Rec& r) {
    YGNodeStyleSetFlexDirection(r.node, r.row ? (r.reverse ? YGFlexDirectionRowReverse : YGFlexDirectionRow) : (r.reverse ? YGFlexDirectionColumnReverse : YGFlexDirectionColumn));
  }
  static void display(const Rec& r) { YGNodeStyleSetDisplay(r.node, r.hidden ? YGDisplayNone : r.contents ? YGDisplayContents : YGDisplayFlex); }

  YGConfigRef config_;
  std::vector<Rec> nodes_;
};

}  // namespace

std::unique_ptr<Layout> makeYogaLayout(bool webDefaults) { return std::make_unique<YogaLayout>(webDefaults); }

}  // namespace zn::host
