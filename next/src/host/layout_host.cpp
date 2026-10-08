// The Rt::HostLayout* rows (ZN-284.01): a program (lib/std/ui.ts in `rn` mode) drives the host layout engine of src/host/layout.h through the runtime table, so
// the interpreter, the AOT and QuickJS reach the same C++ engine and text is measured with the baked fonts (raster::text_advance) without a call back into
// the program. One engine per process, made by `host.layoutNew`.
#include <memory>
#include <string>

#include "host/layout.h"
#include "zn/host.h"
#include "zn/runtime.h"
#include "zrt_raster.h"

namespace zn::host {
namespace {

std::unique_ptr<Layout> engine;
std::string lineOut;   // the string a call returns lives here until the next call

double fontWidth(void*, std::int32_t font, std::string_view s, double tracking) {
  return zrt::raster::text_advance(font, s.data(), static_cast<std::uint32_t>(s.size()), static_cast<float>(tracking)) / 64.0;
}

void call(int id, const HostArg* a, HostArg* r) {
  auto n = [&](int k) { return static_cast<std::int32_t>(a[k].i); };
  const Rt row = static_cast<Rt>(id);
  if (row == Rt::HostLayoutNew) {
    engine = makeYogaLayout(TextMetric{fontWidth, nullptr}, a[0].i != 0);
    r->i = 1;
    return;
  }
  if (!engine) { r->i = 0; r->d = 0; return; }
  switch (row) {
    case Rt::HostLayoutCreate: engine->create(n(0)); break;
    case Rt::HostLayoutDestroy: engine->destroy(n(0)); break;
    case Rt::HostLayoutStyle: engine->setStyle(n(0), static_cast<LayoutProp>(n(1)), static_cast<float>(a[2].d)); break;
    case Rt::HostLayoutInsert: engine->insert(n(0), n(1), n(2)); break;
    case Rt::HostLayoutRemove: engine->remove(n(0), n(1)); break;
    case Rt::HostLayoutText: {   // node, text, font, size, tracking, word spacing, white-space, word-break, clamp, flags (1 ellipsis, 2 balance), line height
      WrapStyle st;
      st.font = n(2); st.size = n(3); st.tracking = a[4].d; st.wordSpacing = a[5].d;
      st.whiteSpace = n(6); st.wordBreak = n(7); st.clamp = n(8); st.ellipsis = (n(9) & 1) != 0; st.balance = (n(9) & 2) != 0;
      engine->setText(n(0), std::string_view(static_cast<const char*>(a[1].p), a[1].n), st, static_cast<float>(a[10].d));
      break;
    }
    case Rt::HostLayoutImage: engine->setImage(n(0), static_cast<float>(a[1].d), static_cast<float>(a[2].d)); break;
    case Rt::HostLayoutField: engine->setField(n(0), n(1), static_cast<float>(a[2].d), a[3].i != 0); break;
    case Rt::HostLayoutClear: engine->clearMeasure(n(0)); break;
    case Rt::HostLayoutDirty: engine->markDirty(n(0)); break;
    case Rt::HostLayoutCalc: engine->calculate(n(0), static_cast<float>(a[1].d), static_cast<float>(a[2].d)); break;
    case Rt::HostLayoutBox: {   // 0 x, 1 y, 2 width, 3 height: relative to the parent
      const LayoutBox b = engine->box(n(0));
      r->d = n(1) == 0 ? b.x : n(1) == 1 ? b.y : n(1) == 2 ? b.w : b.h;
      break;
    }
    case Rt::HostLayoutLines: { const auto* l = engine->lines(n(0)); r->i = l ? static_cast<std::int64_t>(l->size()) : 0; break; }
    case Rt::HostLayoutLine: {
      const auto* l = engine->lines(n(0));
      lineOut = l && n(1) >= 0 && static_cast<std::size_t>(n(1)) < l->size() ? (*l)[static_cast<std::size_t>(n(1))] : std::string();
      r->p = lineOut.c_str();
      r->n = static_cast<std::uint32_t>(lineOut.size());
      break;
    }
    case Rt::HostLayoutLineWidth: { const auto* w = engine->lineWidths(n(0)); r->d = w && n(1) >= 0 && static_cast<std::size_t>(n(1)) < w->size() ? (*w)[static_cast<std::size_t>(n(1))] : 0; break; }
    default: break;
  }
}

}  // namespace

void installLayout() { hostLayout = call; }

}  // namespace zn::host
