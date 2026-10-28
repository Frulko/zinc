/* zinc:ipod — GdkPixdata, for the one built-in image of libgpod (pixmaps.c). See gdk-pixbuf.h. */
#pragma once
#include "gdk-pixbuf.h"

G_BEGIN_DECLS

typedef struct {
  guint32 magic, length, pixdata_type, rowstride, width, height;
  guint8 *pixel_data;
} GdkPixdata;

/* RGB or RGBA, 8 bits, raw or 1-byte run-length encoded: what gdk-pixbuf-csource writes. */
GdkPixbuf *gdk_pixbuf_from_pixdata (const GdkPixdata *pixdata, gboolean copy_pixels, GError **error);

G_END_DECLS
