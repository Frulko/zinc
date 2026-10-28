/* zinc:ipod — the part of gdk-pixbuf that libgpod uses (artwork and photo thumbnails), over stb_image and
   stb_image_resize2 (third_party/stb), so the plugin needs no GTK stack. Same names, same semantics, GObject
   based so g_object_ref/unref/get work as libgpod expects. Implemented in ../gdk_pixbuf_shim.c. */
#pragma once
#include <glib-object.h>

G_BEGIN_DECLS

typedef enum { GDK_COLORSPACE_RGB } GdkColorspace;
typedef enum { GDK_INTERP_NEAREST, GDK_INTERP_TILES, GDK_INTERP_BILINEAR, GDK_INTERP_HYPER } GdkInterpType;
typedef enum {
  GDK_PIXBUF_ROTATE_NONE = 0, GDK_PIXBUF_ROTATE_COUNTERCLOCKWISE = 90,
  GDK_PIXBUF_ROTATE_UPSIDEDOWN = 180, GDK_PIXBUF_ROTATE_CLOCKWISE = 270
} GdkPixbufRotation;
typedef void (*GdkPixbufDestroyNotify)(guchar *pixels, gpointer data);

typedef struct _GdkPixbuf GdkPixbuf;
typedef struct _GdkPixbufLoader GdkPixbufLoader;

GType gdk_pixbuf_get_type (void);
GType gdk_pixbuf_loader_get_type (void);
#define GDK_TYPE_PIXBUF (gdk_pixbuf_get_type ())
#define GDK_PIXBUF(o) (G_TYPE_CHECK_INSTANCE_CAST ((o), GDK_TYPE_PIXBUF, GdkPixbuf))
#define GDK_IS_PIXBUF(o) (G_TYPE_CHECK_INSTANCE_TYPE ((o), GDK_TYPE_PIXBUF))

GdkPixbuf *gdk_pixbuf_new (GdkColorspace cs, gboolean has_alpha, int bits, int width, int height);
GdkPixbuf *gdk_pixbuf_new_from_data (const guchar *data, GdkColorspace cs, gboolean has_alpha, int bits, int width, int height,
                                     int rowstride, GdkPixbufDestroyNotify destroy_fn, gpointer destroy_fn_data);
GdkPixbuf *gdk_pixbuf_new_from_file (const char *filename, GError **error);
GdkPixbuf *gdk_pixbuf_new_from_file_at_size (const char *filename, int width, int height, GError **error);
GdkPixbuf *gdk_pixbuf_new_subpixbuf (GdkPixbuf *src, int x, int y, int width, int height);
GdkPixbuf *gdk_pixbuf_copy (const GdkPixbuf *src);
GdkPixbuf *gdk_pixbuf_scale_simple (const GdkPixbuf *src, int width, int height, GdkInterpType interp);
GdkPixbuf *gdk_pixbuf_rotate_simple (const GdkPixbuf *src, GdkPixbufRotation angle);
void gdk_pixbuf_scale (const GdkPixbuf *src, GdkPixbuf *dest, int dest_x, int dest_y, int dest_width, int dest_height,
                       double offset_x, double offset_y, double scale_x, double scale_y, GdkInterpType interp);
void gdk_pixbuf_copy_area (const GdkPixbuf *src, int src_x, int src_y, int width, int height, GdkPixbuf *dest, int dest_x, int dest_y);
void gdk_pixbuf_fill (GdkPixbuf *pixbuf, guint32 rgba);

int gdk_pixbuf_get_width (const GdkPixbuf *p);
int gdk_pixbuf_get_height (const GdkPixbuf *p);
int gdk_pixbuf_get_rowstride (const GdkPixbuf *p);
int gdk_pixbuf_get_n_channels (const GdkPixbuf *p);
gboolean gdk_pixbuf_get_has_alpha (const GdkPixbuf *p);
guchar *gdk_pixbuf_get_pixels (const GdkPixbuf *p);
const gchar *gdk_pixbuf_get_option (GdkPixbuf *p, const gchar *key);

GdkPixbufLoader *gdk_pixbuf_loader_new (void);
void gdk_pixbuf_loader_set_size (GdkPixbufLoader *loader, int width, int height);
gboolean gdk_pixbuf_loader_write (GdkPixbufLoader *loader, const guchar *buf, gsize count, GError **error);
gboolean gdk_pixbuf_loader_close (GdkPixbufLoader *loader, GError **error);
GdkPixbuf *gdk_pixbuf_loader_get_pixbuf (GdkPixbufLoader *loader);

G_END_DECLS
