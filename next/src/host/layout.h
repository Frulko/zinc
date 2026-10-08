// Layout engines that live in the host (ZN-282, docs/reports/layout-engines.md §5). Two engines exist: `classic`, the measure and place passes of
// lib/std/ui.ts (it reads the UI nodes directly, so it never comes through here), and `rn`, Yoga behind this interface (ZN-283). lib/std/ui.ts calls one
// of them where it computes the layout (`calculate` there); the runtime calls that reach a host engine are added with the Yoga wrapper.
#pragma once
#include <cstdint>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

#include "host/text_wrap.h"

namespace zn::host {

/** The layout properties a host engine is given. Below 1000: the layout class of the PROP table of lib/std/ui.ts, with the same numbers (tests/t0/layout_iface.sh
 *  checks them); from 1000: the other layout fields of a UiNode, which have no PROP number yet. Values are those of the UiNode fields:
 *  sizes, insets, paddings, margins and gaps in pixels (Width/Height -1: auto; insets -100000: unset); *Percent a fraction 0..1; FlexDirection, FlexWrap, Reverse,
 *  Position (1 absolute, 2 static), BoxSizing (1 content-box), Hidden, FullWidth/FullHeight and Contents 0 or 1; JustifyContent 0 start, 1 center, 2 end, 3 between, 4 around, 5 evenly; AlignItems and
 *  AlignSelf 0 start, 1 center, 2 end, 3 stretch (AlignSelf -1: auto); AlignContent 0 start, 1 center, 2 end, 3 stretch, 4 between, 5 around, 6 evenly (-1: the
 *  default); Overflow 0 visible, 1 hidden, 2 scroll; Shrink -1: the engine's default; min/max -1: none; AspectRatio width / height, 0: none. */
enum class LayoutProp : std::int32_t {
  Width = 17, Height = 18, WidthPercent = 19, HeightPercent = 20,
  FlexDirection = 21, FlexWrap = 22, JustifyContent = 23, AlignItems = 24, Position = 25, Overflow = 26,
  PaddingTop = 36, PaddingRight = 37, PaddingBottom = 38, PaddingLeft = 39,
  MarginTop = 40, MarginRight = 41, MarginBottom = 42, MarginLeft = 43,
  BorderTopWidth = 32, BorderRightWidth = 33, BorderBottomWidth = 34, BorderLeftWidth = 35,
  Grow = 44, Gap = 45, Padding = 46, Hidden = 48, Top = 51, Left = 52, Right = 53, Bottom = 54, BoxSizing = 89,
  FullWidth = 1000, FullHeight, MinWidth, MaxWidth, MinHeight, MaxHeight, AspectRatio, Basis, BasisPercent, Shrink, AlignSelf, AlignContent, Reverse,
  GapX, GapY, Contents, Direction,   // Direction: 1 rtl, 0 ltr, -1 inherit (ZN-377)
};

/** A node's box after `calculate`, relative to its parent and already rounded to pixels. */
struct LayoutBox { float x = 0, y = 0, w = 0, h = 0; };

/** A layout engine. Nodes are the handles of lib/std/ui.ts; the engine keeps its own record per handle. */
class Layout {
 public:
  virtual ~Layout() = default;
  virtual void create(std::int32_t node) = 0;
  virtual void destroy(std::int32_t node) = 0;
  virtual void setStyle(std::int32_t node, LayoutProp prop, float value) = 0;
  virtual void insert(std::int32_t parent, std::int32_t child, std::int32_t index) = 0;
  virtual void remove(std::int32_t parent, std::int32_t child) = 0;
  // What sizes a leaf, measured natively (no call back into the program): its text (already transformed), the intrinsic size of its image, or a text field
  // (200 px wide unless full width, `rows` lines high). clearMeasure: a plain box again.
  virtual void setText(std::int32_t node, std::string_view text, const WrapStyle& style, float lineHeight) = 0;
  virtual void setImage(std::int32_t node, float width, float height) = 0;
  virtual void setField(std::int32_t node, std::int32_t rows, float lineHeight, bool fullWidth) = 0;
  virtual void clearMeasure(std::int32_t node) = 0;
  /** A property or the text of the node changed; the engine invalidates it and its ancestors. */
  virtual void markDirty(std::int32_t node) = 0;
  virtual void calculate(std::int32_t root, float width, float height) = 0;
  virtual LayoutBox box(std::int32_t node) const = 0;
  /** The lines of a text node after `calculate`, wrapped at its final width, and their widths; null for other nodes. */
  virtual const std::vector<std::string>* lines(std::int32_t node) const = 0;
  virtual const std::vector<double>* lineWidths(std::int32_t node) const = 0;
  /** Work counters for tests: 0 the leaves measured, 1 the calculate calls (ZN-286: a change re-measures only what it dirtied). */
  virtual std::uint64_t counter(int which) const = 0;
};

/** Yoga 3.2.1 (src/host/layout_yoga.cpp, ZN-283): the `rn` engine, measuring text with `metric`. `webDefaults`: CSS's defaults (flex-shrink 1, column stretch),
 *  React Native's own otherwise. */
std::unique_ptr<Layout> makeYogaLayout(TextMetric metric, bool webDefaults = true);

}  // namespace zn::host
