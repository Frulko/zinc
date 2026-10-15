// zinc:video for webOS 3 (HP TouchPad): the GStreamer backend of player.h. See docs/plugins/video.md and
// docs/reports/hardware/touchpad-video.md.
//
// The device's GStreamer 0.10 decodes with Palm's hardware decoder (`palmvideodecoder`, Qualcomm's: H.264, MPEG-4, H.263, measured 60
// frames a second at 720p and 44 at 1080p); the libraries are opened at run time (the program is built without their headers). The worker
// pulls each picture from an appsink. The decoder gives NV12 in Qualcomm's 64x32 tiles ("NT12"): the picture is read through its tiles,
// scaled to the player's size (a 1080p video becomes the 1024x768 screen's picture in the same pass) and converted to 0x00RRGGBB at once.
#include "zinc_native_video.h"
#include "zrt_raster.h"
#include <dlfcn.h>
#if __has_include("zn/resource_stats.h")
#include "zn/resource_stats.h"
#endif

struct Held {};   // the video plane (palmvideosink) would hold pictures here; every picture is converted for now
// The conversion to the player's size, kept from picture to picture: where each output column and row reads in the tiled picture.
struct Conv {
  int sw, sh, cw, ch, box[4];   // the decoder's buffer (padded), the picture in it, where it lies in the player's image
  int ytiles, ctiles;           // tile rows of the luma and of the chroma
  uint32_t* ytile;              // byte offset of each luma tile [row * cols + col]; the chroma's follow at ctile
  uint32_t* ctile;
  int cols;                     // tile columns (even)
  size_t need;                  // the bytes of the tiled picture: the luma padded to 4 tiles, then the chroma
  uint16_t *lx, *cx;            // per output column: the source column of its luma, of its chroma pair
  uint16_t *ly, *cy;            // per output row: the source row of its luma, of its chroma
};
#include "player.h"

// ---------------------------------------------------------------- GStreamer 0.10, by dlopen
typedef void GstElement;
typedef void GstCaps;
typedef void GstStructure;
struct GstBuffer {   // gst/gstbuffer.h of 0.10 (its public layout): GstMiniObject, then the data
  void* g_class; int refcount; unsigned flags; void* reserved;
  uint8_t* data; unsigned size;
  uint64_t timestamp, duration;
  GstCaps* caps;
};
enum { GST_STATE_NULL = 1, GST_STATE_PAUSED = 3, GST_STATE_PLAYING = 4, GST_STATE_CHANGE_FAILURE = 0, GST_FORMAT_TIME = 3 };
static const uint64_t NONE = ~0ull;   // GST_CLOCK_TIME_NONE
static struct {
  bool ok;
  void (*init)(int*, char***);
  GstElement* (*parse_launch)(const char*, void**);
  GstElement* (*bin_get_by_name)(GstElement*, const char*);
  int (*set_state)(GstElement*, int);
  int (*get_state)(GstElement*, int*, int*, uint64_t);
  void (*object_unref)(void*);
  void (*mini_object_unref)(void*);
  GstStructure* (*caps_get_structure)(const GstCaps*, unsigned);
  int (*structure_get_int)(const GstStructure*, const char*, int*);
  int (*query_duration)(GstElement*, int*, int64_t*);
  GstBuffer* (*pull_buffer)(GstElement*);
  GstBuffer* (*pull_preroll)(GstElement*);
  void (*object_set)(void*, const char*, ...);
} gst;

static void backend_init() {
  void* g = dlopen("libgstreamer-0.10.so.0", RTLD_NOW | RTLD_GLOBAL);
  void* a = dlopen("libgstapp-0.10.so.0", RTLD_NOW | RTLD_GLOBAL);
  void* o = dlopen("libgobject-2.0.so.0", RTLD_NOW | RTLD_GLOBAL);
  if (!g || !a || !o) { fprintf(stderr, "video: no GStreamer 0.10 here: %s\n", dlerror()); return; }
#define SYM(lib, f, n) if (!(*(void**)&gst.f = dlsym(lib, n))) { fprintf(stderr, "video: GStreamer has no %s\n", n); return; }
  SYM(g, init, "gst_init") SYM(g, parse_launch, "gst_parse_launch") SYM(g, bin_get_by_name, "gst_bin_get_by_name")
  SYM(g, set_state, "gst_element_set_state") SYM(g, get_state, "gst_element_get_state") SYM(g, object_unref, "gst_object_unref")
  SYM(g, mini_object_unref, "gst_mini_object_unref") SYM(g, caps_get_structure, "gst_caps_get_structure")
  SYM(g, structure_get_int, "gst_structure_get_int") SYM(g, query_duration, "gst_element_query_duration")
  SYM(a, pull_buffer, "gst_app_sink_pull_buffer") SYM(a, pull_preroll, "gst_app_sink_pull_preroll") SYM(o, object_set, "g_object_set")
#undef SYM
  gst.init(nullptr, nullptr);
  gst.ok = true;
}

// ---------------------------------------------------------------- one opened file
struct Source : SourceBase {
  GstElement *pipe, *sink;
  uint64_t start;   // the first picture's timestamp (ns)
  Conv cv;
  uint8_t* line;   // a luma and a chroma row, untiled, for each half of the picture (convert)
};
// ponytail: MP4 and MOV (qtdemux); another container, the bus's errors and audio come with a demand
static GstElement* pipeline(const char* path, GstElement** sink) {
  if (!gst.ok) return nullptr;
  GstElement* p = gst.parse_launch("filesrc name=in ! qtdemux ! palmvideodecoder ! appsink name=out sync=false max-buffers=2", nullptr);
  if (!p) return nullptr;
  GstElement* in = gst.bin_get_by_name(p, "in");
  *sink = gst.bin_get_by_name(p, "out");
  if (!in || !*sink) { if (in) gst.object_unref(in); if (*sink) gst.object_unref(*sink); gst.object_unref(p); return nullptr; }
  gst.object_set(in, "location", path, nullptr);
  gst.object_unref(in);
  return p;
}
static void drop(GstElement* p, GstElement* sink) {
  if (!p) return;
  gst.set_state(p, GST_STATE_NULL);
  gst.object_unref(sink);
  gst.object_unref(p);
}
/** The picture's size in a buffer's caps: the decoder's (padded to 16) and the visible part. */
static bool sizes(const GstBuffer* b, int* w, int* h, int* cw, int* ch) {
  if (!b || !b->caps) return false;
  const GstStructure* s = gst.caps_get_structure(b->caps, 0);
  if (!s || !gst.structure_get_int(s, "width", w) || !gst.structure_get_int(s, "height", h)) return false;
  if (!gst.structure_get_int(s, "cropwidth", cw)) *cw = *w;
  if (!gst.structure_get_int(s, "cropheight", ch)) *ch = *h;
  return *w > 0 && *h > 0 && *cw > 0 && *ch > 0 && *cw <= *w && *ch <= *h;
}
static bool src_probe(const char* path, int* w, int* h) {
  if (FILE* f = fopen(path, "rb")) fclose(f); else return false;
  if (!w) return true;   // the player has its size: the first picture says the rest
  GstElement* sink = nullptr;
  GstElement* p = pipeline(path, &sink);
  if (!p) return false;
  int st = 0;
  bool ok = gst.set_state(p, GST_STATE_PAUSED) != GST_STATE_CHANGE_FAILURE && gst.get_state(p, &st, nullptr, 5000000000ull) != GST_STATE_CHANGE_FAILURE;
  GstBuffer* b = ok ? gst.pull_preroll(sink) : nullptr;
  int bw, bh;
  ok = sizes(b, &bw, &bh, w, h);
  if (b) gst.mini_object_unref(b);
  drop(p, sink);
  return ok;
}
static void conv_free(Conv* c) {
  free(c->ytile); free(c->lx); free(c->ly);   // one allocation each for the luma and chroma tables
  *c = Conv{};
}
static void src_close(SourceBase* b) {
  Source* s = static_cast<Source*>(b);
  if (!s) return;
  drop(s->pipe, s->sink);
  conv_free(&s->cv);
  free(s->line);
  free(s);
}
static SourceBase* src_open(const char* path, int item) {
  GstElement* sink = nullptr;
  GstElement* p = pipeline(path, &sink);
  if (!p) return nullptr;
  int st = 0;
  if (gst.set_state(p, GST_STATE_PLAYING) == GST_STATE_CHANGE_FAILURE || gst.get_state(p, &st, nullptr, 5000000000ull) == GST_STATE_CHANGE_FAILURE) { drop(p, sink); return nullptr; }
  Source* s = (Source*)calloc(1, sizeof(Source));
  s->pipe = p; s->sink = sink; s->item = item; s->start = NONE;
  int fmt = GST_FORMAT_TIME;
  int64_t d = 0;
  if (gst.query_duration(p, &fmt, &d) && d > 0) s->dur = d / 1e9;
  snprintf(s->name, sizeof s->name, "palmvideodecoder (hardware)");
  return s;
}

// ---------------------------------------------------------------- Qualcomm's tiles
// NV12 in 64x32 tiles, tile rows in a "Z" order by pairs, the chroma after the luma, which is padded to a group of 4 tiles (the layout of
// the MSM7x30/8x60 decoders; the same arithmetic as VLC's modules/codec/omxil/qcom.c and Android's ColorConverter).
static const int TW = 64, TH = 32, TS = TW * TH;
static size_t tile_pos(size_t x, size_t y, size_t w, size_t h) {
  size_t pos = x + (y & ~1u) * w;
  if (y & 1) pos += (x & ~3u) + 2;
  else if ((h & 1) == 0 || y != h - 1) pos += (x + 2) & ~3u;
  return pos;
}
/** The tables for a picture of sw x sh (cw x ch visible) into the player's box. */
static bool prepare(Player* p, Conv* c, int sw, int sh, int cw, int ch) {
  conv_free(c);
  c->sw = sw; c->sh = sh; c->cw = cw; c->ch = ch;
  fit(p, cw, ch, c->box);
  const int cols = ((sw + TW - 1) / TW + 1) & ~1;
  c->cols = cols; c->ytiles = (sh + TH - 1) / TH; c->ctiles = (sh / 2 + TH - 1) / TH;
  size_t luma = (size_t)cols * c->ytiles * TS;
  luma = (luma + 4 * TS - 1) / (4 * TS) * (4 * TS);
  c->need = luma + (size_t)cols * c->ctiles * TS;
  c->ytile = (uint32_t*)malloc(sizeof(uint32_t) * cols * (c->ytiles + c->ctiles));
  c->lx = (uint16_t*)malloc(sizeof(uint16_t) * 2 * c->box[2]);
  c->ly = (uint16_t*)malloc(sizeof(uint16_t) * 2 * c->box[3]);
  if (!c->ytile || !c->lx || !c->ly) { conv_free(c); return false; }
  c->ctile = c->ytile + cols * c->ytiles; c->cx = c->lx + c->box[2]; c->cy = c->ly + c->box[3];
  for (int y = 0; y < c->ytiles; y++) for (int x = 0; x < cols; x++) c->ytile[y * cols + x] = (uint32_t)(tile_pos(x, y, cols, c->ytiles) * TS);
  for (int y = 0; y < c->ctiles; y++) for (int x = 0; x < cols; x++) c->ctile[y * cols + x] = (uint32_t)(luma + tile_pos(x, y, cols, c->ctiles) * TS);
  // ponytail: the nearest sample; a box filter when a downscale shows its aliasing
  for (int i = 0; i < c->box[2]; i++) { int x = (int)(((int64_t)i * 2 + 1) * cw / (2 * c->box[2])); c->lx[i] = (uint16_t)x; c->cx[i] = (uint16_t)(x & ~1); }
  for (int j = 0; j < c->box[3]; j++) { int y = (int)(((int64_t)j * 2 + 1) * ch / (2 * c->box[3])); c->ly[j] = (uint16_t)y; c->cy[j] = (uint16_t)(y / 2); }
  return true;
}
static inline uint32_t clamp8(int v) { return v < 0 ? 0 : v > 255 ? 255 : (uint32_t)v; }
/** One row of the tiled plane at `base` (its tiles at `row`, `cols` of them) into `out`, in order: 64 bytes a tile, read in a row each. */
static void untile(const uint8_t* base, const uint32_t* row, int cols, uint8_t* out) {
  for (int t = 0; t < cols; t++) memcpy(out + t * TW, base + row[t], TW);
}
/** The tiled picture at `src` into the player's image: scaled, converted (BT.601, or BT.709 from 720 lines up, limited range). Only the
 *  rows the scale samples are read, each untiled once into `line` (2 x cols x 64 bytes): the decoder's memory has no cache, a 1080p
 *  picture copied whole took 28 ms and read in place 400. */
static void convert_rows(Player* p, const Conv* c, const uint8_t* src, uint8_t* line, uint32_t* px, int j0, int j1) {
  const bool hd = c->ch >= 720;
  const int rv = hd ? 117489 : 104597, gu = hd ? 13975 : 25675, gv = hd ? 34925 : 53279, bu = hd ? 138438 : 132201;
  const int cols = c->cols;
  uint8_t *yl = line, *cl = line + cols * TW;
  int lastY = -1, lastC = -1;
  for (int j = j0; j < j1; j++) {
    const int y = c->ly[j], cy = c->cy[j];
    if (y != lastY) { untile(src + (y % TH) * TW, c->ytile + (y / TH) * cols, cols, yl); lastY = y; }
    if (cy != lastC) { untile(src + (cy % TH) * TW, c->ctile + (cy / TH) * cols, cols, cl); lastC = cy; }
    uint32_t* out = px + (size_t)(c->box[1] + j) * p->w + c->box[0];
    for (int i = 0; i < c->box[2]; i++) {
      const int Y = (yl[c->lx[i]] - 16) * 76309;
      const uint8_t* uv = cl + c->cx[i];
      const int U = uv[0] - 128, V = uv[1] - 128;
      out[i] = clamp8((Y + rv * V + 32768) >> 16) << 16 | clamp8((Y - gu * U - gv * V + 32768) >> 16) << 8 | clamp8((Y + bu * U + 32768) >> 16);
    }
  }
}

struct Half { Player* p; const Conv* c; const uint8_t* src; uint8_t* line; uint32_t* px; };
static void* lower_half(void* a) {
  Half* h = (Half*)a;
  convert_rows(h->p, h->c, h->src, h->line, h->px, h->c->box[3] / 2, h->c->box[3]);
  return nullptr;
}
/** The whole picture: the TouchPad has two cores, a thread converts the lower half (37 ms a 1080p picture on one, at full speed).
 *  ponytail: a thread started per picture (a fraction of a millisecond); a resident one if that shows in the measurements. */
static void convert(Player* p, const Conv* c, const uint8_t* src, uint8_t* lines, uint32_t* px) {
  bars(p, px, c->box);
  const size_t two = (size_t)2 * c->cols * TW;
  Half h{p, c, src, lines + two, px};
  pthread_t t;
  const bool split = c->box[3] >= 64 && pthread_create(&t, nullptr, lower_half, &h) == 0;
  convert_rows(p, c, src, lines, px, 0, split ? c->box[3] / 2 : c->box[3]);
  if (split) pthread_join(t, nullptr);
}

static Held* held_new() { return nullptr; }
static void held_free(Held*&) {}
static void held_unref(Held*) {}
static bool held_any(const Held*) { return false; }
static bool held_picture(const Held*, int, HalPicture*) { return false; }
static bool held_convert(Player*, Held*, int, uint32_t*) { return false; }

static int src_step(Player* p, SourceBase* b, uint32_t gen, double base, int loop) {
  Source* s = static_cast<Source*>(b);
  GstBuffer* buf = gst.pull_buffer(s->sink);   // null at the end of the stream
  if (!buf) return 0;
  int sw, sh, cw, ch;
  bool ok = sizes(buf, &sw, &sh, &cw, &ch);
  if (ok && (sw != s->cv.sw || sh != s->cv.sh || cw != s->cv.cw || ch != s->cv.ch)) ok = prepare(p, &s->cv, sw, sh, cw, ch);
  ok = ok && s->cv.need <= buf->size;   // a buffer shorter than its tiles is not read
  const uint64_t ts = buf->timestamp;
  if (s->start == NONE && ts != NONE) s->start = ts;
  double pos = ts != NONE && s->start != NONE && ts >= s->start ? (ts - s->start) / 1e9 : s->frames / 30.0;
  const double fd = buf->duration != NONE && buf->duration > 0 ? buf->duration / 1e9 : 1 / 30.0;
  if (pos + fd > s->end) s->end = pos + fd;
  const int k = ok ? slot_take(p, gen) : -1;
  if (k >= 0) {
    const uint64_t c0 = vlog ? hal_time_us() : 0;
    Slot& sl = p->slot[k];
    sl.has_px = true;
    if (!s->line) s->line = (uint8_t*)malloc((size_t)4 * 8192);   // a luma and a chroma row of the widest picture, for each half
    if (s->line && s->cv.cols * TW <= 8192) convert(p, &s->cv, buf->data, s->line, sl.px);
    if (vlog) fprintf(stderr, "video: p%d converted pos %.4f (%dx%d to %dx%d) in %.2f ms\n", (int)(p - players), pos, cw, ch, s->cv.box[2], s->cv.box[3], (hal_time_us() - c0) / 1e3);
    slot_commit(p, s, k, s->line != nullptr && s->cv.cols * TW <= 8192, gen, base, pos, fd, loop);
  }
  gst.mini_object_unref(buf);
  return 1;
}
