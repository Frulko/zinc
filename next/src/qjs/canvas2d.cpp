// Canvas 2D for the web environment (ZN-570): what a CanvasRenderingContext2D of lib/std/webenv.js draws with. The pixels, paths, strokes,
// gradients, shadows and compositing are canvas_ity's (third_party/canvas_ity, one header modelled on the W3C canvas); the text is the engine's
// own tier (src/text: HarfBuzz shaping, the fonts' metrics), its glyph outlines handed to canvas_ity as a path, so text is kerned, takes
// the transform, strokes, gradients and shadows like any shape. JavaScript keeps the state a program reads back (the strings of fillStyle,
// font...) and parses CSS; this file takes numbers.
#include "qjs/qjs.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <vector>

extern "C" {
#include "../../third_party/quickjs-ng/quickjs.h"
}

#include "gl/webgl_js.h"   // PresentHooks: how pixels reach a zinc:gfx image
#include "text/layout.h"
#include "zn/host.h"
#include "zn/limits.h"

#if defined(__clang__)
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Weverything"
#elif defined(__GNUC__)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wall"
#pragma GCC diagnostic ignored "-Wextra"
#endif
#define CANVAS_ITY_IMPLEMENTATION
#include "../../third_party/canvas_ity/canvas_ity.hpp"
#if defined(__clang__)
#pragma clang diagnostic pop
#elif defined(__GNUC__)
#pragma GCC diagnostic pop
#endif

namespace zn::qjs {
namespace {

namespace ci = canvas_ity;
JSClassID gClass = 0;
struct Canvas { std::unique_ptr<ci::canvas> cv; int w = 1, h = 1; };

// ---- fonts: the bundled ones by name (lib/fonts beside lib/std) and the files a program registers (FontFace). A face keeps its bytes.
// ponytail: faces live as long as the process; a program that registers fonts without end would need a release
struct Font { std::vector<uint8_t> bytes; std::unique_ptr<zn::text::Face> face; std::string name; };
struct Fonts { std::string dir; std::vector<Font> list; };
Fonts& fonts() { static Fonts f; return f; }
// The file is a TrueType or OpenType font whose tables all lie inside it. Not a proof that it is sound (stb_truetype trusts what the tables
// say, which is why only the program's own files come here), but bytes that are no font at all are refused before anything reads them.
bool looksLikeFont(const std::vector<uint8_t>& b) {
  const auto u32 = [&](size_t at) { return static_cast<std::uint32_t>(b[at]) << 24 | static_cast<std::uint32_t>(b[at + 1]) << 16 | static_cast<std::uint32_t>(b[at + 2]) << 8 | b[at + 3]; };
  if (b.size() < 12) return false;
  const std::uint32_t version = u32(0);
  if (version != 0x00010000 && version != 0x74727565 && version != 0x4F54544F) return false;   // 1.0, 'true', 'OTTO'
  const size_t tables = static_cast<size_t>(b[4]) << 8 | b[5];
  if (!tables || b.size() < 12 + tables * 16) return false;
  for (size_t i = 0; i < tables; i++) {
    const std::uint64_t at = u32(12 + i * 16 + 8), n = u32(12 + i * 16 + 12);
    if (at + n > b.size()) return false;
  }
  return true;
}
int addFont(std::vector<uint8_t> bytes, const std::string& name) {
  Fonts& f = fonts();
  if (!looksLikeFont(bytes)) return -1;
  Font font;
  font.bytes = std::move(bytes); font.name = name;
  font.face = zn::text::Face::open(font.bytes.data(), font.bytes.size());
  if (!font.face) return -1;
  f.list.push_back(std::move(font));   // the vector's buffer moves with it: the face's pointer into the bytes holds
  return static_cast<int>(f.list.size()) - 1;
}

void finalize(JSRuntime*, JSValue v) { delete static_cast<Canvas*>(JS_GetOpaque(v, gClass)); }
Canvas* self(JSValueConst v) { return static_cast<Canvas*>(JS_GetOpaque(v, gClass)); }
double num(JSContext* c, JSValueConst v) { double d = 0; JS_ToFloat64(c, &d, v); return d; }
int i32(JSContext* c, JSValueConst v) { int32_t i = 0; JS_ToInt32(c, &i, v); return i; }
// the bytes of an ArrayBuffer or of a typed array's view
const uint8_t* bytesOf(JSContext* c, JSValueConst v, size_t& n) {
  if (const uint8_t* p = JS_GetArrayBuffer(c, &n, v)) return p;
  JS_FreeValue(c, JS_GetException(c));
  size_t at = 0, len = 0, per = 0;
  JSValue buf = JS_GetTypedArrayBuffer(c, v, &at, &len, &per);
  if (JS_IsException(buf)) { JS_FreeValue(c, JS_GetException(c)); n = 0; return nullptr; }
  size_t whole = 0;
  const uint8_t* p = JS_GetArrayBuffer(c, &whole, buf);
  JS_FreeValue(c, buf);
  n = len;
  return p ? p + at : nullptr;
}

// A canvas of w x h transparent pixels in its initial state. A size no bitmap can have (canvas_ity keeps 16 bytes a pixel) gives one pixel
// and says so: a program goes on, as it does in a browser that refuses a huge canvas.
void reset(Canvas* k, int w, int h) {
  if (w < 1 || h < 1 || w > 32768 || h > 32768 || static_cast<std::int64_t>(w) * h > kMaxImagePixels / 4) {
    if (w > 0 && h > 0) std::fprintf(stderr, "zinc: a 2D canvas of %d x %d is larger than the %lld pixels the web environment draws on\n", w, h, static_cast<long long>(kMaxImagePixels / 4));
    w = h = 1;
  }
  k->cv = std::make_unique<ci::canvas>(w, h);
  k->w = w; k->h = h;
}
JSValue js_create(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  JSValue o = JS_NewObjectClass(c, static_cast<int>(gClass));
  if (JS_IsException(o)) return o;
  auto* k = new Canvas;
  reset(k, argc > 0 ? i32(c, argv[0]) : 0, argc > 1 ? i32(c, argv[1]) : 0);
  JS_SetOpaque(o, k);
  return o;
}
JSValue js_resize(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 2 ? self(argv[0]) : nullptr;
  if (k) reset(k, i32(c, argv[1]), i32(c, argv[2]));
  return JS_UNDEFINED;
}

// op(canvas, code, numbers...): the calls that take numbers only. The codes are the order of OPS in lib/std/webenv.js. A call with a number
// that is not finite does nothing, which is the canvas specification's rule (and canvas_ity does not check).
enum Op { Save, Restore, Scale, Rotate, Translate, Transform, SetTransform, GlobalAlpha, Composite, ShadowColor, ShadowBlur, ShadowOffset, LineWidth, LineCap, LineJoin,
          MiterLimit, DashOffset, BeginPath, MoveTo, ClosePath, LineTo, QuadTo, BezierTo, ArcTo, Arc, Rect, Fill, Stroke, Clip, InPath, ClearRect, FillRect, StrokeRect,
          Color, Linear, Radial, Stop };
JSValue js_op(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 1 ? self(argv[0]) : nullptr;
  if (!k) return JS_UNDEFINED;
  float a[7] = {0, 0, 0, 0, 0, 0, 0};
  for (int i = 2; i < argc && i < 9; i++) { const double d = num(c, argv[i]); if (!std::isfinite(d)) return JS_UNDEFINED; a[i - 2] = static_cast<float>(d); }
  ci::canvas& v = *k->cv;
  const ci::brush_type brush = a[0] != 0 ? ci::stroke_style : ci::fill_style;
  switch (i32(c, argv[1])) {
    case Save: v.save(); break;
    case Restore: v.restore(); break;
    case Scale: v.scale(a[0], a[1]); break;
    case Rotate: v.rotate(a[0]); break;
    case Translate: v.translate(a[0], a[1]); break;
    case Transform: v.transform(a[0], a[1], a[2], a[3], a[4], a[5]); break;
    case SetTransform: v.set_transform(a[0], a[1], a[2], a[3], a[4], a[5]); break;
    case GlobalAlpha: v.set_global_alpha(a[0]); break;
    case Composite: v.global_composite_operation = static_cast<ci::composite_operation>(static_cast<int>(a[0])); break;
    case ShadowColor: v.set_shadow_color(a[0], a[1], a[2], a[3]); break;
    case ShadowBlur: v.set_shadow_blur(a[0]); break;
    case ShadowOffset: v.shadow_offset_x = a[0]; v.shadow_offset_y = a[1]; break;
    case LineWidth: v.set_line_width(a[0]); break;
    case LineCap: v.line_cap = static_cast<ci::cap_style>(static_cast<int>(a[0])); break;
    case LineJoin: v.line_join = static_cast<ci::join_style>(static_cast<int>(a[0])); break;
    case MiterLimit: v.set_miter_limit(a[0]); break;
    case DashOffset: v.line_dash_offset = a[0]; break;
    case BeginPath: v.begin_path(); break;
    case MoveTo: v.move_to(a[0], a[1]); break;
    case ClosePath: v.close_path(); break;
    case LineTo: v.line_to(a[0], a[1]); break;
    case QuadTo: v.quadratic_curve_to(a[0], a[1], a[2], a[3]); break;
    case BezierTo: v.bezier_curve_to(a[0], a[1], a[2], a[3], a[4], a[5]); break;
    case ArcTo: v.arc_to(a[0], a[1], a[2], a[3], a[4]); break;
    case Arc: v.arc(a[0], a[1], a[2], a[3], a[4], a[5] != 0); break;
    case Rect: v.rectangle(a[0], a[1], a[2], a[3]); break;
    case Fill: v.fill(); break;
    case Stroke: v.stroke(); break;
    case Clip: v.clip(); break;
    case InPath: return JS_NewBool(c, v.is_point_in_path(a[0], a[1]));
    case ClearRect: v.clear_rectangle(a[0], a[1], a[2], a[3]); break;
    case FillRect: v.fill_rectangle(a[0], a[1], a[2], a[3]); break;
    case StrokeRect: v.stroke_rectangle(a[0], a[1], a[2], a[3]); break;
    case Color: v.set_color(brush, a[1], a[2], a[3], a[4]); break;
    case Linear: v.set_linear_gradient(brush, a[1], a[2], a[3], a[4]); break;
    case Radial: v.set_radial_gradient(brush, a[1], a[2], a[3], a[4], a[5], a[6]); break;
    case Stop: v.add_color_stop(brush, a[1], a[2], a[3], a[4], a[5]); break;
    default: break;
  }
  return JS_UNDEFINED;
}
// dash(canvas, [lengths])
JSValue js_dash(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 1 ? self(argv[0]) : nullptr;
  if (!k) return JS_UNDEFINED;
  JSValue lv = JS_GetPropertyStr(c, argv[1], "length");
  const int n = std::clamp(i32(c, lv), 0, 4096);
  JS_FreeValue(c, lv);
  std::vector<float> d(static_cast<size_t>(n));
  for (int i = 0; i < n; i++) { JSValue e = JS_GetPropertyUint32(c, argv[1], static_cast<uint32_t>(i)); d[static_cast<size_t>(i)] = static_cast<float>(num(c, e)); JS_FreeValue(c, e); }
  k->cv->set_line_dash(d.empty() ? nullptr : d.data(), n);
  return JS_UNDEFINED;
}

// ---- text. shape(text, faces, px, letterSpacing, rtl, align, baseline): one line, shaped, with where it sits around the point it is drawn at.
// align: 0 start, 1 end, 2 left, 3 right, 4 center. baseline: 0 alphabetic, 1 top, 2 hanging, 3 middle, 4 ideographic, 5 bottom.
struct Shaped {
  std::vector<zn::text::Face*> faces;
  std::vector<zn::text::Glyph> glyphs;   // left to right
  float px = 10, spacing = 0, width = 0;
  float dx = 0, dy = 0;                  // from the point given to the pen's start on the alphabetic baseline
  float ascent = 0, descent = 0, emAscent = 0, emDescent = 0, hanging = 0;
};
bool shape(JSContext* c, JSValueConst* argv, Shaped& s) {
  size_t n = 0;
  const char* p = JS_ToCStringLen(c, &n, argv[0]);
  if (!p) return false;
  std::string text(p, n);
  JS_FreeCString(c, p);
  for (char& ch : text) if (ch == '\n' || ch == '\r' || ch == '\t' || ch == '\f' || ch == '\v') ch = ' ';   // the specification: every white space is a space
  JSValue lv = JS_GetPropertyStr(c, argv[1], "length");
  const int count = i32(c, lv);
  JS_FreeValue(c, lv);
  for (int i = 0; i < count && i < 16; i++) {
    JSValue e = JS_GetPropertyUint32(c, argv[1], static_cast<uint32_t>(i));
    const int id = i32(c, e);
    JS_FreeValue(c, e);
    if (id >= 0 && id < static_cast<int>(fonts().list.size())) s.faces.push_back(fonts().list[static_cast<size_t>(id)].face.get());
  }
  if (s.faces.empty()) return false;
  const double px = num(c, argv[2]), spacing = num(c, argv[3]);
  s.px = std::isfinite(px) && px > 0 ? static_cast<float>(std::min(px, 4096.0)) : 10;
  s.spacing = std::isfinite(spacing) ? static_cast<float>(spacing) : 0;
  const bool rtl = i32(c, argv[4]) != 0;
  zn::text::Options o;
  o.size = s.px; o.dir = rtl ? zn::text::Direction::Rtl : zn::text::Direction::Ltr;
  for (zn::text::Line& line : zn::text::layout(s.faces, text, o))
    for (zn::text::Run& run : line.runs) for (zn::text::Glyph& g : run.glyphs) { g.face = run.face; s.glyphs.push_back(g); s.width += g.advance + s.spacing; }
  const zn::text::Face& f = *s.faces[0];
  const float asc = f.ascent(s.px), desc = f.descent(s.px), em = asc + desc > 0 ? s.px / (asc + desc) : 1;
  s.ascent = std::round(asc); s.descent = std::round(desc);   // a browser's font box is in whole pixels
  s.emAscent = asc * em; s.emDescent = desc * em; s.hanging = asc * 0.8f;   // Chromium: the em box is the font's box scaled to the size; no font table read for hanging
  int align = i32(c, argv[5]);
  if (align < 2) align = (align == 0) != rtl ? 2 : 3;
  s.dx = align == 3 ? -s.width : align == 4 ? -s.width / 2 : 0;
  switch (i32(c, argv[6])) {
    case 1: s.dy = s.emAscent; break;
    case 2: s.dy = s.hanging; break;
    case 3: s.dy = (s.emAscent - s.emDescent) / 2; break;
    case 4: s.dy = -s.descent; break;
    case 5: s.dy = -s.emDescent; break;
    default: break;
  }
  return true;
}
// text(canvas, stroke, x, y, maxWidth, text, faces, px, letterSpacing, rtl, align, baseline): fillText or strokeText. A text wider than
// maxWidth (0: none) is condensed to it.
JSValue js_text(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 11 ? self(argv[0]) : nullptr;
  if (!k) return JS_UNDEFINED;
  const double x = num(c, argv[2]), y = num(c, argv[3]), maxWidth = num(c, argv[4]);
  Shaped s;
  if (!std::isfinite(x) || !std::isfinite(y) || !shape(c, argv + 5, s)) return JS_UNDEFINED;
  const float squeeze = maxWidth > 0 && s.width > maxWidth ? static_cast<float>(maxWidth) / s.width : 1;
  const float ox = static_cast<float>(x) + s.dx * squeeze, oy = static_cast<float>(y) + s.dy;
  ci::canvas& v = *k->cv;
  v.exchange_path();
  v.begin_path();
  zn::text::Outline o;
  float pen = 0;
  for (const zn::text::Glyph& g : s.glyphs) {
    if (zn::text::outline(*s.faces[static_cast<size_t>(g.face)], g.gid, s.px, o)) {
      const float gx = ox + (pen + g.x) * squeeze, gy = oy + g.y;
      const float* p = o.pts.data();
      for (char op : o.ops) {
        const auto X = [&](int i) { return gx + p[i] * squeeze; };
        const auto Y = [&](int i) { return gy + p[i]; };
        if (op == 'M') { v.move_to(X(0), Y(1)); p += 2; }
        else if (op == 'L') { v.line_to(X(0), Y(1)); p += 2; }
        else if (op == 'Q') { v.quadratic_curve_to(X(0), Y(1), X(2), Y(3)); p += 4; }
        else { v.bezier_curve_to(X(0), Y(1), X(2), Y(3), X(4), Y(5)); p += 6; }
      }
    }
    pen += g.advance + s.spacing;
  }
  if (JS_ToBool(c, argv[1])) v.stroke(); else v.fill();
  v.exchange_path();
  return JS_UNDEFINED;
}
// measure(text, faces, px, letterSpacing, rtl, align, baseline): [width, the ink's left, right, ascent and descent from the point the text
// would be drawn at (a TextMetrics' actualBoundingBox*), the font's ascent and descent, the em box's, the hanging, alphabetic and ideographic
// baselines], undefined without a font
JSValue js_measure(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Shaped s;
  if (argc < 7 || !shape(c, argv, s)) return JS_UNDEFINED;
  float x0 = 0, x1 = 0, y0 = 0, y1 = 0, pen = 0;
  bool ink = false;
  zn::text::Outline o;
  for (const zn::text::Glyph& g : s.glyphs) {
    if (zn::text::outline(*s.faces[static_cast<size_t>(g.face)], g.gid, s.px, o)) {
      const float gx = pen + g.x, gy = g.y;
      if (!ink) { x0 = gx + o.x0; x1 = gx + o.x1; y0 = gy + o.y0; y1 = gy + o.y1; ink = true; }
      else { x0 = std::min(x0, gx + o.x0); x1 = std::max(x1, gx + o.x1); y0 = std::min(y0, gy + o.y0); y1 = std::max(y1, gy + o.y1); }
    }
    pen += g.advance + s.spacing;
  }
  const double out[] = {s.width, -(s.dx + x0), s.dx + x1, -(s.dy + y0), s.dy + y1, s.ascent - s.dy, s.descent + s.dy, s.emAscent - s.dy, s.emDescent + s.dy,
                        s.hanging - s.dy, -s.dy, -s.descent - s.dy};
  JSValue a = JS_NewArray(c);
  for (uint32_t i = 0; i < std::size(out); i++) JS_SetPropertyUint32(c, a, i, JS_NewFloat64(c, out[i]));
  return a;
}
// font(name | bytes): the id of a face, -1 when the file is not a font the text tier opens. A name is a file of lib/fonts, opened once.
// A FontFace takes the project's own files only: stb_truetype, which reads the outlines, is not made for hostile fonts.
JSValue js_font(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  if (argc < 1) return JS_NewInt32(c, -1);
  if (JS_IsString(argv[0])) {
    const char* p = JS_ToCString(c, argv[0]);
    const std::string name = p ? p : "";
    if (p) JS_FreeCString(c, p);
    Fonts& f = fonts();
    for (size_t i = 0; i < f.list.size(); i++) if (f.list[i].name == name) return JS_NewInt32(c, static_cast<int>(i));
    if (name.empty() || name.find('/') != std::string::npos || name.find('\\') != std::string::npos) return JS_NewInt32(c, -1);
    std::ifstream in(f.dir + "/" + name, std::ios::binary);
    if (!in) return JS_NewInt32(c, -1);
    return JS_NewInt32(c, addFont(std::vector<uint8_t>(std::istreambuf_iterator<char>(in), std::istreambuf_iterator<char>()), name));
  }
  size_t n = 0;
  const uint8_t* p = bytesOf(c, argv[0], n);
  if (!p || n < 12) return JS_NewInt32(c, -1);
  return JS_NewInt32(c, addFont(std::vector<uint8_t>(p, p + n), ""));
}

// ---- pixels. Outside this file they are RGBA8 rows from the top with alpha not premultiplied: an ImageData, a decoded image, a texture source.
// read(canvas, x, y, w, h): an ArrayBuffer of them (transparent outside the canvas)
JSValue js_read(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 4 ? self(argv[0]) : nullptr;
  if (!k) return JS_UNDEFINED;
  const int x = i32(c, argv[1]), y = i32(c, argv[2]), w = i32(c, argv[3]), h = i32(c, argv[4]);
  if (w < 1 || h < 1 || static_cast<std::int64_t>(w) * h > kMaxImagePixels) return JS_ThrowRangeError(c, "getImageData: %d x %d pixels cannot be read", w, h);
  std::vector<uint8_t> px(static_cast<size_t>(w) * static_cast<size_t>(h) * 4);
  k->cv->get_image_data(px.data(), w, h, w * 4, x, y);
  return JS_NewArrayBufferCopy(c, px.data(), px.size());
}
// write(canvas, pixels, width, height, x, y, dirtyX, dirtyY, dirtyW, dirtyH): putImageData, the dirty rectangle already inside the pixels
JSValue js_write(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 9 ? self(argv[0]) : nullptr;
  size_t n = 0;
  const uint8_t* p = k ? bytesOf(c, argv[1], n) : nullptr;
  const int w = argc > 9 ? i32(c, argv[2]) : 0, h = argc > 9 ? i32(c, argv[3]) : 0;
  if (!p || w < 1 || h < 1 || n < static_cast<size_t>(w) * static_cast<size_t>(h) * 4) return JS_UNDEFINED;
  const int x = i32(c, argv[4]), y = i32(c, argv[5]), dx = i32(c, argv[6]), dy = i32(c, argv[7]), dw = i32(c, argv[8]), dh = i32(c, argv[9]);
  if (dx < 0 || dy < 0 || dw < 1 || dh < 1 || dx > w - dw || dy > h - dh) return JS_UNDEFINED;
  k->cv->put_image_data(p + (static_cast<size_t>(dy) * static_cast<size_t>(w) + static_cast<size_t>(dx)) * 4, dw, dh, w * 4, x + dx, y + dy);
  return JS_UNDEFINED;
}
// image(canvas, pixels, width, height, sx, sy, sw, sh, dx, dy, dw, dh): drawImage of the source rectangle (whole pixels, inside the
// picture) into the destination rectangle, under the transform, the alpha, the compositing and the shadow
JSValue js_image(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 11 ? self(argv[0]) : nullptr;
  size_t n = 0;
  const uint8_t* p = k ? bytesOf(c, argv[1], n) : nullptr;
  const int w = argc > 11 ? i32(c, argv[2]) : 0, h = argc > 11 ? i32(c, argv[3]) : 0;
  if (!p || w < 1 || h < 1 || n < static_cast<size_t>(w) * static_cast<size_t>(h) * 4) return JS_UNDEFINED;
  const int sx = i32(c, argv[4]), sy = i32(c, argv[5]), sw = i32(c, argv[6]), sh = i32(c, argv[7]);
  double d[4];
  for (int i = 0; i < 4; i++) { d[i] = num(c, argv[8 + i]); if (!std::isfinite(d[i])) return JS_UNDEFINED; }
  if (sx < 0 || sy < 0 || sw < 1 || sh < 1 || sx > w - sw || sy > h - sh) return JS_UNDEFINED;
  k->cv->draw_image(p + (static_cast<size_t>(sy) * static_cast<size_t>(w) + static_cast<size_t>(sx)) * 4, sw, sh, w * 4,
                    static_cast<float>(d[0]), static_cast<float>(d[1]), static_cast<float>(d[2]), static_cast<float>(d[3]));
  return JS_UNDEFINED;
}
// present(canvas, image): the canvas over black into a zinc:gfx image, which the window then shows; false without a surface to show on
JSValue js_present(JSContext* c, JSValueConst, int argc, JSValueConst* argv) {
  Canvas* k = argc > 1 ? self(argv[0]) : nullptr;
  const auto* hooks = static_cast<const zn::gl::PresentHooks*>(zn::host::glPresentHooks());
  if (!k || !hooks) return JS_FALSE;
  unsigned* dst = hooks->pixels(i32(c, argv[1]), k->w, k->h);
  if (!dst) return JS_FALSE;
  std::vector<uint8_t> px(static_cast<size_t>(k->w) * static_cast<size_t>(k->h) * 4);
  k->cv->get_image_data(px.data(), k->w, k->h, k->w * 4, 0, 0);
  for (size_t i = 0, count = px.size() / 4; i < count; i++) {
    const unsigned a = px[i * 4 + 3];
    dst[i] = (px[i * 4] * a / 255) << 16 | (px[i * 4 + 1] * a / 255) << 8 | (px[i * 4 + 2] * a / 255);
  }
  hooks->done(i32(c, argv[1]));
  return JS_TRUE;
}

}  // namespace

void installCanvas2d(JSContext* ctx, JSValueConst native, const std::string& stdRoot) {
  JSRuntime* rt = JS_GetRuntime(ctx);
  if (!gClass) JS_NewClassID(rt, &gClass);
  if (!JS_IsRegisteredClass(rt, gClass)) { JSClassDef def{}; def.class_name = "Canvas2DBitmap"; def.finalizer = finalize; JS_NewClass(rt, gClass, &def); }
  fonts().dir = stdRoot + "/../fonts";
  JSValue o = JS_NewObject(ctx);
  const struct { const char* name; JSCFunction* fn; int args; } table[] = {
      {"create", js_create, 2}, {"resize", js_resize, 3}, {"op", js_op, 9}, {"dash", js_dash, 2}, {"text", js_text, 12}, {"measure", js_measure, 7},
      {"font", js_font, 1}, {"read", js_read, 5}, {"write", js_write, 10}, {"image", js_image, 12}, {"present", js_present, 2}};
  for (const auto& e : table) JS_SetPropertyStr(ctx, o, e.name, JS_NewCFunction(ctx, e.fn, e.name, e.args));
  JS_SetPropertyStr(ctx, native, "c2d", o);
}

}  // namespace zn::qjs
