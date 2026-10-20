#pragma once
// Shaped text for zinc:gfx and zinc:ui (ZN-224): installs the hooks of runtime/zrt_raster.h so text from U+0300 on (combining marks, Hebrew, Arabic, Indic scripts, ZWJ
// emoji) is laid out by src/text/layout.h over the embedded TrueType files instead of the codepoint tables. Linked only by programs that ask for it (zinc.json "text": "shaped").
namespace zn::text {
void installShapedGfx();
}
