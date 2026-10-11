// zrt raster: software renderer shared by every target (UI-09, UI-15, UI-16).
// The frame is a list of commands; each frame is diffed against the previous one and only the damaged
// rectangle is re-rasterized, band by band (HALs choose the band height: full frame on hosts, 16 lines on SPI panels).
#pragma once
#include <stdint.h>
#include <stddef.h>

namespace zrt { namespace raster {

struct Glyph { uint32_t cp; int16_t x0, y0; uint16_t w, h; int32_t adv; uint32_t off; };
struct Font { const char* name; int32_t px, ascent, descent, lineGap, count; const Glyph* glyphs; const uint8_t* bitmap; };
struct Image { const char* name; int32_t w, h; const uint8_t* rgba; int32_t scale; };  // scale: pixels per logical pixel
extern const Font fonts[];
extern const int font_count;
extern const Image images[];
extern const int image_count;
// TTF files embedded on host targets (runtime/ttf.cpp rasterizes them at any size; count 0 elsewhere)
struct TtfFile { const char* name; const uint8_t* data; uint32_t len; };
extern const TtfFile ttf_files[];
extern const int ttf_count;
static const int32_t RUNTIME_FONT_BASE = 1 << 16;
/** Optional text shaping (ZN-224): a host that links a shaping tier installs these; text that needs it (any code point from U+0300) goes through them, Latin text keeps the
 *  glyph tables. `run` lays out `n` bytes of UTF-8 in `font` and calls `emit` once per glyph with its 8-bit coverage bitmap placed relative to the pen origin on the baseline
 *  (x right, y down); it returns the advance in 26.6 pixels, or a negative number when it declines the text (the caller falls back to the glyph tables). */
struct ShapedGlyph { int32_t x, y, w, h; const uint8_t* a; const uint32_t* rgba; };   // a: coverage drawn in the text colour; rgba (0xAABBGGRR, straight alpha): a colour glyph, `a` is null
struct ShapeHooks { int32_t (*run)(int32_t font, const char* s, uint32_t n, float tracking, void (*emit)(void* user, const ShapedGlyph& g), void* user); };
extern const ShapeHooks* shape_hooks;
/** The embedded TrueType file (index in ttf_files) a runtime font was made from, -1 for a baked font. */
int32_t font_file(int32_t id);
/** Baked or runtime font by id (null when unknown). */
const Font* font_at(int32_t id);
bool runtime_font(int32_t id);
const Glyph* runtime_glyph(int32_t id, uint32_t cp);
/** Font `name` at exactly `px` for drawing (runtime rasterization when not baked). */
int32_t render_font(const char* name, uint32_t name_len, int32_t px);
/** A TrueType file read at run time (a font file of the assets the program names, ZN-669), under `name`: its index, -1 when it is not one. */
int32_t add_font_file(const char* name, uint32_t name_len, const uint8_t* data, uint32_t len);
/** Font `name` at exactly `px`: baked, else rasterized from its TrueType file; -1 when it has no file and no baked font of that size. */
int32_t exact_font(const char* name, uint32_t name_len, int32_t px);
/** `font`, or its twin rasterized from the TrueType file when it is baked and lacks a character of `s` (same pixels for the others). */
int32_t text_font(int32_t font, const char* s, uint32_t n);
bool has_glyph(int32_t font, uint32_t cp);

// Runtime images (video frames, camera preview, cached map tiles, render-to-image): opaque 0x00RRGGBB pixels, or
// 0xAARRGGBB with straight alpha once dyn_set_alpha says so (decoded sprites; a render target is opaque again).
// Ids start at DYN_BASE so they never collide with baked images. Buffers are read on the main thread during
// hal_present: a producer thread must hand over a finished buffer with dyn_update, never write the shown one.
static const int32_t DYN_BASE = 1 << 20;
int32_t dyn_create(int32_t w, int32_t h);                                      // runtime-owned buffer
int32_t dyn_wrap(int32_t w, int32_t h, const uint32_t* px, int32_t stride);    // caller-owned buffer
void dyn_update(int32_t id, const uint32_t* px, int32_t stride);                // new pixels (null: same buffer), marks damage
uint32_t* dyn_pixels(int32_t id);
void dyn_resize(int32_t id, int32_t w, int32_t h);                             // runtime-owned buffers only
void dyn_destroy(int32_t id);
void dyn_set_alpha(int32_t id, bool on);                                       // the top byte of each pixel is its alpha
bool dyn_alpha(int32_t id);
bool image_size(int32_t id, int32_t* w, int32_t* h);
uint32_t image_version(int32_t id);
/** Current pixels of a runtime image (GPU compositors upload them when the version changes). */
bool dyn_view(int32_t id, const uint32_t** px, int32_t* w, int32_t* h, int32_t* stride);
/** GPU blocks of the same texels (ZN-439: a compressed texture of a pack): `gl` its OpenGL internal format, `premultiplied` its alpha. A GPU
 *  compositor uploads them instead of the pixels when its driver takes the format; the software raster keeps the pixels. The runtime copies
 *  them; new pixels (dyn_update, dyn_resize) drop them. */
void dyn_set_blocks(int32_t id, uint32_t gl, const void* data, uint32_t bytes, bool premultiplied);
bool dyn_blocks(int32_t id, uint32_t* gl, const void** data, uint32_t* bytes, bool* premultiplied);

enum Kind : uint8_t { CLEAR, RECT, BORDER, SHADOW, LINE, TEXT, IMAGE, POLY, CLIP, UNCLIP,
  STROKE,   // STROKE (ZN-590.01): a polyline of n points at off, width s, pad bit 1 = closed; recorded only for displays that draw it on the GPU (gfx::gpu_strokes)
  XFORM };  // XFORM (ZN-263.01): a RECT, BORDER, SHADOW, IMAGE or TEXT drawn through a 2D matrix (gfx.setTransform). x, y, w, h: its screen bounding
            // box; the n = kXformLen floats at off: [kind, a, b, c, d, e, f, x, y, w, h, r, s, off, n (bits: a TEXT's text, an IMAGE's box)], the command in its
            // own coordinates and the matrix to the screen (x' = a x + c y + e, y' = b x + d y + f); colours, alpha, grad and res stay in the Cmd.
constexpr uint32_t kXformLen = 15;

struct Cmd {
  uint8_t kind, alpha, grad;   // grad: 0 none, 1 vertical (c1 top -> c2 bottom), 2 horizontal, 3 radial, 4 POLY paint record after the contours, 5 RECT paint record of n floats at off (raster.cpp paint_at); IMAGE: 1 = nearest filter
  uint8_t pad;                 // POLY: bit 0 = even-odd fill rule (default nonzero); IMAGE: kImageBox, kImageTint, the blend mode
  int32_t res;                 // font or image index
  float x, y, w, h;            // LINE: x,y -> w,h ; POLY: bbox
  float r, s;                  // radius; border width / shadow blur / line width / tracking
  uint32_t c1, c2;             // 0xRRGGBB; IMAGE: c2 = image version (frame diff sees new video frames)
  uint32_t off, n;             // payload (text bytes or points) in the frame pools
};

struct Rect { int32_t x0, y0, x1, y1; };

/** An IMAGE with pad bit kImageBox draws part of its image (gfx::drawImageRect): x, y, w, h is the rectangle painted, and the box the
 *  whole image would cover is kept as four floats in s, c1, off and n, which an IMAGE has no other use for. The source rectangle is
 *  what of that box lies over the painted rectangle (nothing is painted outside the box); a negative size mirrors the image. Under a
 *  matrix the four travel with the command: s, off and n in the XFORM's payload, c1 in the Cmd. */
constexpr uint8_t kImageBox = 4;
struct Box { float x, y, w, h; };
inline Box image_box(const Cmd& c) {
  Box b = {c.x, c.y, c.w, c.h};
  if (c.pad & kImageBox) { b.x = c.s; __builtin_memcpy(&b.y, &c.c1, 4); __builtin_memcpy(&b.w, &c.off, 4); __builtin_memcpy(&b.h, &c.n, 4); }
  return b;
}
inline void set_image_box(Cmd& c, Box b) {
  c.pad |= kImageBox; c.s = b.x; __builtin_memcpy(&c.c1, &b.y, 4); __builtin_memcpy(&c.off, &b.w, 4); __builtin_memcpy(&c.n, &b.h, 4);
}
/** A sprite's tint and blend mode (gfx::drawImageRect, ZN-581). Pad bit kImageTint: r holds the tint 0xRRGGBB as a float (24 bits, exact),
 *  which multiplies the texels' colour, and the image has no radius. Pad bits 4-5: the blend mode. Under a matrix both travel as the box
 *  does: r in the XFORM's payload, pad in the Cmd. */
constexpr uint8_t kImageTint = 8, kBlendShift = 4;
enum Blend : uint8_t { BLEND_NORMAL, BLEND_ADD, BLEND_MULTIPLY, BLEND_SCREEN };
inline uint32_t image_tint(const Cmd& c) { return c.pad & kImageTint ? (uint32_t)c.r & 0xFFFFFF : 0xFFFFFF; }
inline float image_radius(const Cmd& c) { return c.pad & kImageTint ? 0.0f : c.r; }
inline uint32_t image_blend(const Cmd& c) { return (uint32_t)(c.pad >> kBlendShift) & 3; }

/** Returns the index of the font `name` whose pixel size is closest to `px`. */
int32_t find_font(const char* name, uint32_t name_len, int32_t px);
int32_t find_image(const char* name, uint32_t name_len);
/** Advance of UTF-8 text in 26.6 fixed point, tracking in px added between glyphs. */
int32_t text_advance(int32_t font, const char* s, uint32_t n, float tracking);

/** Stroke outline as nonzero contours into `out` ([count, x, y, ...]*). Returns contours | (floats used << 16). */
uint32_t stroke_contours(const float* pts, uint32_t n, float width, bool closed, float* out, uint32_t cap);
extern uint32_t strokes_built;   // stroke_contours calls since the start (ZINC_GL_STATS: strokes tessellated on the CPU per frame)

struct Frame {
  const Cmd* cmds; uint32_t count;
  const char* text; const float* pts;
};
/** Rasterizes `f` into rows [y0, y1) of a `w`-wide buffer (0x00RRGGBB), limited to `damage`. */
void render(const Frame& f, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage);
/** A hash of what the frame draws (the commands and their payloads, not their pool offsets): equal frames draw the same pixels. */
uint32_t frame_hash(const Frame& f);
/** A frame binned into 16 x 16 tiles (ZN-410): per tile, the commands that touch it in paint order, from the last opaque one that covers it whole
 *  outside any clip. The buffers are kept and grown from frame to frame (free_tiles releases them). */
struct Tiles {
  int32_t w, h, tw, th;
  uint32_t *start, *idx;              // tile t lists idx[start[t] .. start[t + 1])
  uint32_t *rng, *head, *closed, *chunks;   // scratch of bin()
  uint32_t cap_start, cap_idx, cap_rng, cap_head, cap_closed, cap_chunks;
  uint32_t cooldown;          // frames to paint without binning after the tiles did not pay off
  bool ok;
};
/** Frames with fewer commands are painted by render() directly: binning would cost more than it saves. */
constexpr uint32_t kTilesMin = 2048;
/** Bins `f` for a w x h surface; false (tiles not usable) under kTilesMin commands, past 16 nested clips, out of memory, or when the tiles
 *  would repeat more set-up work than they hide (little occlusion). */
bool bin(const Frame& f, int32_t w, int32_t h, Tiles& out);
/** render() through the tiles of `f` binned by bin(): the same pixels; falls back to render() when the tiles are not usable. */
void render_tiles(const Frame& f, const Tiles& tiles, uint32_t* band, int32_t w, int32_t y0, int32_t y1, Rect damage);
void free_tiles(Tiles& t);
/** The commands of `f` that opaque square RECTs and CLEARs drawn after them, outside any clip, do not cover whole (`tile` px tiles, 0: a
 *  size from the frame's opaque rectangles; the commands' own bounds), from the last to the first into `out` (room for f.count): index | kCullOpaque when the command is itself such an
 *  opaque rectangle outside clips. CLIP and UNCLIP are listed, except whole clip scopes under a covered screen. Returns how many; 0: not
 *  culled (clips left open), draw every command. For renderers that draw every command, the GL replay (ZN-412.01): they skip what nobody
 *  sees, and draw the opaque ones front to back in this order. `scratch` keeps its buffer from frame to frame. */
constexpr uint32_t kCullOpaque = 0x80000000u;
uint32_t cull_list(const Frame& f, int32_t w, int32_t h, int32_t tile, Tiles& scratch, uint32_t* out);
/** cull_list in two phases, so the first can run on several threads: cull_pack writes packed[begin .. end) (each command's tile range and
 *  kind, from the Cmd array), cull_walk then walks the packed array alone (it reads a Cmd only for the visible opaque rectangles).
 *  cull_tile is the size cull_list picks for 0. */
int32_t cull_tile(const Frame& f);
void cull_pack(const Frame& f, uint32_t begin, uint32_t end, int32_t w, int32_t h, int32_t tile, uint64_t* packed);
uint32_t cull_walk(const Frame& f, const uint64_t* packed, int32_t w, int32_t h, int32_t tile, Tiles& scratch, uint32_t* out);
/** Damage between two frames (empty rect when identical). */
Rect diff(const Frame& a, const Frame& b, int32_t w, int32_t h);
/** Damage as up to `max` disjoint rectangles; returns the count (0 when identical). */
/** Past this many changed commands diff_rects returns one rectangle, the union of their bounds (ZN-402: a frame where most things move). */
constexpr uint32_t kBulkChanged = 4096;
int32_t diff_rects(const Frame& a, const Frame& b, int32_t w, int32_t h, Rect* out, int32_t max, uint32_t* changed = nullptr, uint32_t bulk_after = kBulkChanged);
/** The union of the bounds of every command of a frame, within the screen (empty when it has none). */
Rect bounds_all(const Frame& f, int32_t w, int32_t h);
/** Compact record of a command of the previous frame (T0): content hash and damage bounds, 12 bytes. */
struct CmdSig { uint32_t hash; int16_t x0, y0, x1, y1; };
/** Fills `out[0 .. f.count)`. */
void sign_frame(const Frame& f, int32_t w, int32_t h, CmdSig* out);
/** Same damage as diff_rects(previous, now) (up to 32-bit hash collisions) with only the signatures of the previous frame. */
int32_t diff_rects_sig(const CmdSig* before, uint32_t nbefore, const Frame& now, int32_t w, int32_t h, Rect* out, int32_t max);

}  // namespace raster

namespace gfx {
/** For C++ plugins: appends a raw command to the current frame, copying `len` floats of payload into the point pool
 *  (POLY: [count, x, y, ...]*, contour count is filled in). The caller sets the box, colors and flags. Null when full. */
raster::Cmd* emit(uint8_t kind, const float* pts, uint32_t len);
/** Set by a display that replays the command lists on the GPU and draws STROKE itself (the GL window, display-gl): stroke() then records
 *  the polyline instead of tessellating it. The software raster draws a STROKE too (it tessellates it), so a fallback stays correct. */
extern bool gpu_strokes;
}
}  // namespace zrt
