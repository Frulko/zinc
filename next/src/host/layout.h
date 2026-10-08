// Layout engines that live in the host (ZN-282, docs/reports/layout-engines.md §5). Two engines exist: `classic`, the measure and place passes of
// lib/std/ui.ts (it reads the UI nodes directly, so it never comes through here), and `rn`, Yoga behind this interface (ZN-283). lib/std/ui.ts calls one
// of them where it computes the layout (`calculate` there); the runtime calls that reach a host engine are added with the Yoga wrapper.
#pragma once
#include <cstdint>

namespace zn::host {

/** The layout properties a host engine is given: the layout class of the PROP table of lib/std/ui.ts, with the same numbers (tests/t0/layout_iface.sh checks them). */
enum class LayoutProp : std::int32_t {
  Width = 17, Height = 18, WidthPercent = 19, HeightPercent = 20,
  FlexDirection = 21, FlexWrap = 22, JustifyContent = 23, AlignItems = 24, Position = 25, Overflow = 26,
  PaddingTop = 36, PaddingRight = 37, PaddingBottom = 38, PaddingLeft = 39,
  MarginTop = 40, MarginRight = 41, MarginBottom = 42, MarginLeft = 43,
  Grow = 44, Gap = 45, Padding = 46, Hidden = 48, Top = 51, Left = 52, Right = 53, Bottom = 54,
};

/** What sizes a leaf: its text (measured natively from the text and font ids, no call back into the program), its image, or the default of a text field. */
enum class MeasureKind : std::int32_t { None, Text, Image, Field };

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
  virtual void setMeasure(std::int32_t node, MeasureKind kind, std::int32_t textId, std::int32_t fontId, std::int32_t sizeX64, float tracking) = 0;
  /** A property or the text of the node changed; the engine invalidates it and its ancestors. */
  virtual void markDirty(std::int32_t node) = 0;
  virtual void calculate(std::int32_t root, float width, float height) = 0;
  virtual LayoutBox box(std::int32_t node) const = 0;
};

}  // namespace zn::host
