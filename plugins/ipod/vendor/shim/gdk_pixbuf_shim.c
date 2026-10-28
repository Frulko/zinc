/* zinc:ipod — gdk-pixbuf for libgpod over stb_image/stb_image_resize2 (see gdk-pixbuf/gdk-pixbuf.h).
   Pixels are RGB or RGBA, 8 bits, rows `rowstride` bytes apart, as in gdk-pixbuf. stb is compiled static here so it
   cannot clash with the engine's own copy. */
#include <math.h>
#include <string.h>
#include "gdk-pixbuf/gdk-pixbuf.h"
#include "gdk-pixbuf/gdk-pixdata.h"

#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_NO_STDIO_FALLBACK
#include "stb_image.h"
#define STB_IMAGE_RESIZE_STATIC
#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb_image_resize2.h"

struct _GdkPixbuf {
  GObject parent;
  int width, height, rowstride, n_channels;
  gboolean has_alpha;
  guchar *pixels;
  GdkPixbufDestroyNotify destroy_fn;
  gpointer destroy_data;
  GdkPixbuf *owner;   /* a subpixbuf keeps its source alive */
};
typedef struct { GObjectClass parent; } GdkPixbufClass;

enum { PROP_0, PROP_WIDTH, PROP_HEIGHT, PROP_ROWSTRIDE, PROP_N_CHANNELS, PROP_HAS_ALPHA, PROP_PIXELS, PROP_BITS };

G_DEFINE_TYPE (GdkPixbuf, gdk_pixbuf, G_TYPE_OBJECT)

static void pixbuf_finalize (GObject *o) {
  GdkPixbuf *p = (GdkPixbuf *)o;
  if (p->owner) g_object_unref (p->owner);
  else if (p->destroy_fn) p->destroy_fn (p->pixels, p->destroy_data);
  G_OBJECT_CLASS (gdk_pixbuf_parent_class)->finalize (o);
}
static void pixbuf_get_property (GObject *o, guint id, GValue *v, GParamSpec *spec) {
  GdkPixbuf *p = (GdkPixbuf *)o;
  switch (id) {
    case PROP_WIDTH: g_value_set_int (v, p->width); break;
    case PROP_HEIGHT: g_value_set_int (v, p->height); break;
    case PROP_ROWSTRIDE: g_value_set_int (v, p->rowstride); break;
    case PROP_N_CHANNELS: g_value_set_int (v, p->n_channels); break;
    case PROP_HAS_ALPHA: g_value_set_boolean (v, p->has_alpha); break;
    case PROP_PIXELS: g_value_set_pointer (v, p->pixels); break;
    case PROP_BITS: g_value_set_int (v, 8); break;
    default: G_OBJECT_WARN_INVALID_PROPERTY_ID (o, id, spec);
  }
}
static void gdk_pixbuf_class_init (GdkPixbufClass *k) {
  GObjectClass *c = G_OBJECT_CLASS (k);
  c->finalize = pixbuf_finalize;
  c->get_property = pixbuf_get_property;
  GParamFlags ro = G_PARAM_READABLE;
  g_object_class_install_property (c, PROP_WIDTH, g_param_spec_int ("width", NULL, NULL, 0, G_MAXINT, 0, ro));
  g_object_class_install_property (c, PROP_HEIGHT, g_param_spec_int ("height", NULL, NULL, 0, G_MAXINT, 0, ro));
  g_object_class_install_property (c, PROP_ROWSTRIDE, g_param_spec_int ("rowstride", NULL, NULL, 0, G_MAXINT, 0, ro));
  g_object_class_install_property (c, PROP_N_CHANNELS, g_param_spec_int ("n-channels", NULL, NULL, 0, 4, 3, ro));
  g_object_class_install_property (c, PROP_HAS_ALPHA, g_param_spec_boolean ("has-alpha", NULL, NULL, FALSE, ro));
  g_object_class_install_property (c, PROP_PIXELS, g_param_spec_pointer ("pixels", NULL, NULL, ro));
  g_object_class_install_property (c, PROP_BITS, g_param_spec_int ("bits-per-sample", NULL, NULL, 8, 8, 8, ro));
}
static void gdk_pixbuf_init (GdkPixbuf *p) { (void)p; }

static void free_pixels (guchar *px, gpointer data) { (void)data; g_free (px); }

static GdkPixbuf *wrap (guchar *px, gboolean alpha, int w, int h, int stride, GdkPixbufDestroyNotify fn, gpointer data) {
  GdkPixbuf *p = g_object_new (GDK_TYPE_PIXBUF, NULL);
  p->width = w; p->height = h; p->rowstride = stride;
  p->has_alpha = alpha; p->n_channels = alpha ? 4 : 3;
  p->pixels = px; p->destroy_fn = fn; p->destroy_data = data;
  return p;
}

GdkPixbuf *gdk_pixbuf_new (GdkColorspace cs, gboolean has_alpha, int bits, int width, int height) {
  (void)cs;
  if (bits != 8 || width <= 0 || height <= 0) return NULL;
  int stride = (width * (has_alpha ? 4 : 3) + 3) & ~3;   /* gdk-pixbuf aligns rows to 4 bytes */
  guchar *px = g_try_malloc0 ((gsize)stride * height);
  return px ? wrap (px, has_alpha, width, height, stride, free_pixels, NULL) : NULL;
}

GdkPixbuf *gdk_pixbuf_new_from_data (const guchar *data, GdkColorspace cs, gboolean has_alpha, int bits, int width, int height,
                                     int rowstride, GdkPixbufDestroyNotify destroy_fn, gpointer destroy_fn_data) {
  (void)cs; (void)bits;
  return wrap ((guchar *)data, has_alpha, width, height, rowstride, destroy_fn, destroy_fn_data);
}

/* stb's tightly packed result becomes a pixbuf (3 or 4 channels, as the image has alpha or not) */
static GdkPixbuf *from_stb (stbi_uc *px, int w, int h, int comp, GError **error, const char *what) {
  if (!px) { g_set_error (error, g_quark_from_static_string ("gdk-pixbuf-error-quark"), 0, "%s: %s", what, stbi_failure_reason ()); return NULL; }
  int ch = comp == 2 || comp == 4 ? 4 : 3;
  /* stbi_load was asked for `ch` channels, so the buffer already has that layout; stbi_image_free is free() */
  guchar *copy = g_malloc ((gsize)w * h * ch);
  memcpy (copy, px, (size_t)w * h * ch);
  stbi_image_free (px);
  return wrap (copy, ch == 4, w, h, w * ch, free_pixels, NULL);
}
static GdkPixbuf *load_memory (const guchar *buf, gsize n, GError **error, const char *what) {
  int w, h, comp;
  if (!stbi_info_from_memory (buf, (int)n, &w, &h, &comp)) return from_stb (NULL, 0, 0, 0, error, what);
  int ch = comp == 2 || comp == 4 ? 4 : 3;
  stbi_uc *px = stbi_load_from_memory (buf, (int)n, &w, &h, &comp, ch);
  return from_stb (px, w, h, ch, error, what);
}

GdkPixbuf *gdk_pixbuf_new_from_file (const char *filename, GError **error) {
  gchar *buf; gsize n;
  if (!g_file_get_contents (filename, &buf, &n, error)) return NULL;
  GdkPixbuf *p = load_memory ((guchar *)buf, n, error, filename);
  g_free (buf);
  return p;
}

/* Fits inside width x height keeping the aspect (-1: that side is free), as gdk-pixbuf does. */
static void fit (int w, int h, int *tw, int *th) {
  if (*tw <= 0 && *th <= 0) { *tw = w; *th = h; return; }
  if (*tw <= 0) *tw = G_MAXINT;
  if (*th <= 0) *th = G_MAXINT;
  if ((gint64)w * *th > (gint64)h * *tw) *th = MAX (1, (int)((gint64)h * *tw / w));
  else *tw = MAX (1, (int)((gint64)w * *th / h));
}
GdkPixbuf *gdk_pixbuf_new_from_file_at_size (const char *filename, int width, int height, GError **error) {
  GdkPixbuf *p = gdk_pixbuf_new_from_file (filename, error);
  if (!p) return NULL;
  fit (p->width, p->height, &width, &height);
  if (width == p->width && height == p->height) return p;
  GdkPixbuf *s = gdk_pixbuf_scale_simple (p, width, height, GDK_INTERP_BILINEAR);
  g_object_unref (p);
  return s;
}

GdkPixbuf *gdk_pixbuf_new_subpixbuf (GdkPixbuf *src, int x, int y, int width, int height) {
  GdkPixbuf *p = wrap (src->pixels + (gsize)y * src->rowstride + (gsize)x * src->n_channels, src->has_alpha, width, height, src->rowstride, NULL, NULL);
  p->owner = g_object_ref (src);
  return p;
}

GdkPixbuf *gdk_pixbuf_copy (const GdkPixbuf *src) {
  GdkPixbuf *p = gdk_pixbuf_new (GDK_COLORSPACE_RGB, src->has_alpha, 8, src->width, src->height);
  if (p) gdk_pixbuf_copy_area (src, 0, 0, src->width, src->height, p, 0, 0);
  return p;
}

GdkPixbuf *gdk_pixbuf_scale_simple (const GdkPixbuf *src, int width, int height, GdkInterpType interp) {
  (void)interp;
  GdkPixbuf *p = gdk_pixbuf_new (GDK_COLORSPACE_RGB, src->has_alpha, 8, width, height);
  if (!p) return NULL;
  stbir_resize_uint8_srgb (src->pixels, src->width, src->height, src->rowstride, p->pixels, width, height, p->rowstride,
                           src->has_alpha ? STBIR_RGBA : STBIR_RGB);
  return p;
}

/* dest(x, y) = src((x - offset_x) / scale_x, (y - offset_y) / scale_y) over the destination rectangle, bilinear;
   alpha is composited onto dest the way gdk_pixbuf_scale replaces it (a straight copy, not a blend). */
void gdk_pixbuf_scale (const GdkPixbuf *src, GdkPixbuf *dest, int dest_x, int dest_y, int dest_width, int dest_height,
                       double offset_x, double offset_y, double scale_x, double scale_y, GdkInterpType interp) {
  (void)interp;
  int sc = src->n_channels, dc = dest->n_channels;
  for (int y = dest_y; y < dest_y + dest_height; y++) {
    double sy = (y + 0.5 - offset_y) / scale_y - 0.5;
    int y0 = (int)floor (sy); double fy = sy - y0;
    int ya = CLAMP (y0, 0, src->height - 1), yb = CLAMP (y0 + 1, 0, src->height - 1);
    guchar *o = dest->pixels + (gsize)y * dest->rowstride + (gsize)dest_x * dc;
    for (int x = dest_x; x < dest_x + dest_width; x++, o += dc) {
      double sx = (x + 0.5 - offset_x) / scale_x - 0.5;
      int x0 = (int)floor (sx); double fx = sx - x0;
      int xa = CLAMP (x0, 0, src->width - 1), xb = CLAMP (x0 + 1, 0, src->width - 1);
      const guchar *p00 = src->pixels + (gsize)ya * src->rowstride + (gsize)xa * sc, *p01 = src->pixels + (gsize)ya * src->rowstride + (gsize)xb * sc;
      const guchar *p10 = src->pixels + (gsize)yb * src->rowstride + (gsize)xa * sc, *p11 = src->pixels + (gsize)yb * src->rowstride + (gsize)xb * sc;
      for (int c = 0; c < dc; c++) {
        if (c >= sc) { o[c] = 255; continue; }
        double v = (p00[c] * (1 - fx) + p01[c] * fx) * (1 - fy) + (p10[c] * (1 - fx) + p11[c] * fx) * fy;
        o[c] = (guchar)CLAMP ((int)(v + 0.5), 0, 255);
      }
    }
  }
}

void gdk_pixbuf_copy_area (const GdkPixbuf *src, int src_x, int src_y, int width, int height, GdkPixbuf *dest, int dest_x, int dest_y) {
  for (int y = 0; y < height; y++) {
    const guchar *s = src->pixels + (gsize)(src_y + y) * src->rowstride + (gsize)src_x * src->n_channels;
    guchar *d = dest->pixels + (gsize)(dest_y + y) * dest->rowstride + (gsize)dest_x * dest->n_channels;
    if (src->n_channels == dest->n_channels) { memcpy (d, s, (size_t)width * src->n_channels); continue; }
    for (int x = 0; x < width; x++) {
      for (int c = 0; c < 3; c++) d[x * dest->n_channels + c] = s[x * src->n_channels + c];
      if (dest->n_channels == 4) d[x * 4 + 3] = 255;
    }
  }
}

void gdk_pixbuf_fill (GdkPixbuf *p, guint32 rgba) {
  guchar px[4] = { rgba >> 24, (rgba >> 16) & 0xff, (rgba >> 8) & 0xff, rgba & 0xff };
  for (int y = 0; y < p->height; y++) {
    guchar *d = p->pixels + (gsize)y * p->rowstride;
    for (int x = 0; x < p->width; x++) memcpy (d + x * p->n_channels, px, p->n_channels);
  }
}

GdkPixbuf *gdk_pixbuf_rotate_simple (const GdkPixbuf *src, GdkPixbufRotation angle) {
  gboolean turn = angle == GDK_PIXBUF_ROTATE_CLOCKWISE || angle == GDK_PIXBUF_ROTATE_COUNTERCLOCKWISE;
  int w = turn ? src->height : src->width, h = turn ? src->width : src->height, n = src->n_channels;
  GdkPixbuf *p = gdk_pixbuf_new (GDK_COLORSPACE_RGB, src->has_alpha, 8, w, h);
  if (!p) return NULL;
  for (int y = 0; y < src->height; y++)
    for (int x = 0; x < src->width; x++) {
      int dx, dy;
      switch (angle) {
        case GDK_PIXBUF_ROTATE_COUNTERCLOCKWISE: dx = y; dy = src->width - 1 - x; break;
        case GDK_PIXBUF_ROTATE_UPSIDEDOWN: dx = src->width - 1 - x; dy = src->height - 1 - y; break;
        case GDK_PIXBUF_ROTATE_CLOCKWISE: dx = src->height - 1 - y; dy = x; break;
        default: dx = x; dy = y;
      }
      memcpy (p->pixels + (gsize)dy * p->rowstride + (gsize)dx * n, src->pixels + (gsize)y * src->rowstride + (gsize)x * n, n);
    }
  return p;
}

int gdk_pixbuf_get_width (const GdkPixbuf *p) { return p->width; }
int gdk_pixbuf_get_height (const GdkPixbuf *p) { return p->height; }
int gdk_pixbuf_get_rowstride (const GdkPixbuf *p) { return p->rowstride; }
int gdk_pixbuf_get_n_channels (const GdkPixbuf *p) { return p->n_channels; }
gboolean gdk_pixbuf_get_has_alpha (const GdkPixbuf *p) { return p->has_alpha; }
guchar *gdk_pixbuf_get_pixels (const GdkPixbuf *p) { return p->pixels; }
/* ponytail: no EXIF "orientation" option (libgpod only rotates photos by it); read the EXIF tag if photo sync needs it */
const gchar *gdk_pixbuf_get_option (GdkPixbuf *p, const gchar *key) { (void)p; (void)key; return NULL; }

/* ---- loader: buffers the bytes, decodes on close */
struct _GdkPixbufLoader { GObject parent; GByteArray *bytes; int w, h; GdkPixbuf *pixbuf; };
typedef struct { GObjectClass parent; } GdkPixbufLoaderClass;
G_DEFINE_TYPE (GdkPixbufLoader, gdk_pixbuf_loader, G_TYPE_OBJECT)
static void loader_finalize (GObject *o) {
  GdkPixbufLoader *l = (GdkPixbufLoader *)o;
  if (l->bytes) g_byte_array_unref (l->bytes);
  if (l->pixbuf) g_object_unref (l->pixbuf);
  G_OBJECT_CLASS (gdk_pixbuf_loader_parent_class)->finalize (o);
}
static void gdk_pixbuf_loader_class_init (GdkPixbufLoaderClass *k) { G_OBJECT_CLASS (k)->finalize = loader_finalize; }
static void gdk_pixbuf_loader_init (GdkPixbufLoader *l) { l->bytes = g_byte_array_new (); }

GdkPixbufLoader *gdk_pixbuf_loader_new (void) { return g_object_new (gdk_pixbuf_loader_get_type (), NULL); }
void gdk_pixbuf_loader_set_size (GdkPixbufLoader *l, int width, int height) { l->w = width; l->h = height; }
gboolean gdk_pixbuf_loader_write (GdkPixbufLoader *l, const guchar *buf, gsize count, GError **error) {
  (void)error;
  g_byte_array_append (l->bytes, buf, (guint)count);
  return TRUE;
}
gboolean gdk_pixbuf_loader_close (GdkPixbufLoader *l, GError **error) {
  if (l->pixbuf) return TRUE;
  GdkPixbuf *p = load_memory (l->bytes->data, l->bytes->len, error, "image data");
  if (p && l->w > 0 && l->h > 0 && (l->w != p->width || l->h != p->height)) {
    GdkPixbuf *s = gdk_pixbuf_scale_simple (p, l->w, l->h, GDK_INTERP_BILINEAR);
    g_object_unref (p);
    p = s;
  }
  l->pixbuf = p;
  return p != NULL;
}
GdkPixbuf *gdk_pixbuf_loader_get_pixbuf (GdkPixbufLoader *l) { return l->pixbuf; }

/* ---- GdkPixdata: 'GdkP', type 0x01 RGB / 0x02 RGBA, 0x01 << 16 8 bits, 0x01 << 24 raw / 0x02 << 24 run-length */
GdkPixbuf *gdk_pixbuf_from_pixdata (const GdkPixdata *pd, gboolean copy_pixels, GError **error) {
  (void)copy_pixels;
  gboolean alpha = (pd->pixdata_type & 0xff) == 0x02, rle = (pd->pixdata_type >> 24) == 0x02;
  int bpp = alpha ? 4 : 3;
  GdkPixbuf *p = gdk_pixbuf_new (GDK_COLORSPACE_RGB, alpha, 8, (int)pd->width, (int)pd->height);
  if (!p) { g_set_error (error, g_quark_from_static_string ("gdk-pixbuf-error-quark"), 0, "pixdata: no memory"); return NULL; }
  const guint8 *s = pd->pixel_data;
  gsize total = (gsize)pd->width * pd->height, i = 0;
  while (i < total) {
    guint n = 1; gboolean run = FALSE;
    if (rle) { run = (*s & 0x80) != 0; n = *s++ & 0x7f; }
    else n = (guint)total;
    for (guint k = 0; k < n && i < total; k++, i++) {
      guchar *d = p->pixels + (i / pd->width) * p->rowstride + (i % pd->width) * bpp;
      memcpy (d, s, bpp);
      if (!run) s += bpp;
    }
    if (run) s += bpp;
  }
  return p;
}
