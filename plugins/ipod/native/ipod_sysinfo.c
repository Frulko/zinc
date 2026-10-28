/* zinc:ipod: the artwork part of a synthesised SysInfoExtended. Once that file exists libgpod takes the cover, photo
   and chapter formats from it instead of its own table for the model, so a file without them silently turns
   artwork off. This writes libgpod's table for the model (read before the file exists) as the plist keys Apple uses.
   C, because the format struct lives in libgpod's C-only itdb_device.h. */
#include <glib.h>
#include "itdb_device.h"
#include "itdb_thumb.h"

/* The PixelFormat code of a format, NULL when the plist has none (JPEG: iPhone; the rotated ROKR format). */
static const char *pixel_format (ItdbThumbFormat f, gboolean *order) {
  *order = FALSE;
  switch (f) {
    case THUMB_FORMAT_UYVY_BE: return "32767579";
    case THUMB_FORMAT_RGB565_BE: return "42353635";
    case THUMB_FORMAT_RGB565_LE: return "4C353635";
    case THUMB_FORMAT_I420_LE: return "79343230";
    case THUMB_FORMAT_RGB555_LE: return "4C353535";
    case THUMB_FORMAT_REC_RGB555_LE: *order = TRUE; return "4C353535";
    default: return NULL;
  }
}

static void formats (GString *x, const char *key, GList *list) {
  if (!list) return;
  g_string_append_printf (x, "\t<key>%s</key>\n\t<array>\n", key);
  for (GList *l = list; l; l = l->next) {
    const Itdb_ArtworkFormat *f = l->data;
    gboolean order;
    const char *pf = pixel_format (f->format, &order);
    if (!pf) continue;
    g_string_append_printf (x, "\t\t<dict>\n"
        "\t\t\t<key>FormatId</key><integer>%d</integer>\n"
        "\t\t\t<key>RenderWidth</key><integer>%d</integer>\n"
        "\t\t\t<key>RenderHeight</key><integer>%d</integer>\n"
        "\t\t\t<key>DisplayWidth</key><integer>%d</integer>\n"
        "\t\t\t<key>PixelFormat</key><string>%s</string>\n",
        f->format_id, f->width, f->height, f->display_width ? f->display_width : f->width, pf);
    if (order) g_string_append (x, "\t\t\t<key>PixelOrder</key><string>1</string>\n");
    g_string_append_printf (x,
        "\t\t\t<key>Interlaced</key><%s/>\n"
        "\t\t\t<key>Crop</key><%s/>\n"
        "\t\t\t<key>Rotation</key><integer>%d</integer>\n"
        "\t\t\t<key>BackColor</key><string>%02X%02X%02X%02X</string>\n"
        "\t\t\t<key>ColorAdjustment</key><integer>%d</integer>\n"
        "\t\t\t<key>AssociatedFormat</key><integer>%d</integer>\n"
        "\t\t\t<key>RowBytesAlignment</key><integer>%d</integer>\n",
        f->interlaced ? "true" : "false", f->crop ? "true" : "false", f->rotation,
        f->back_color[0], f->back_color[1], f->back_color[2], f->back_color[3],
        f->color_adjustment, f->associated_format, f->row_bytes_alignment);
    if (f->gamma != 0) g_string_append_printf (x, "\t\t\t<key>GammaAdjustment</key><real>%g</real>\n", f->gamma);
    g_string_append (x, "\t\t</dict>\n");
  }
  g_string_append (x, "\t</array>\n");
}

/* The AlbumArt, ImageSpecifications and ChapterImageSpecs keys for the iPod at `mountpoint` (call it while it has no
   SysInfoExtended); g_free the result. */
char *zn_ipod_artwork_plist (const char *mountpoint) {
  Itdb_Device *dev = itdb_device_new ();
  itdb_device_set_mountpoint (dev, mountpoint);
  GString *x = g_string_new ("");
  GList *l;
  formats (x, "AlbumArt", l = itdb_device_get_cover_art_formats (dev)); g_list_free (l);
  formats (x, "ImageSpecifications", l = itdb_device_get_photo_formats (dev)); g_list_free (l);
  formats (x, "ChapterImageSpecs", l = itdb_device_get_chapter_image_formats (dev)); g_list_free (l);
  itdb_device_free (dev);
  return g_string_free (x, FALSE);
}

static const char *format_name (ItdbThumbFormat f) {
  switch (f) {
    case THUMB_FORMAT_UYVY_BE: case THUMB_FORMAT_UYVY_LE: return "UYVY";
    case THUMB_FORMAT_RGB565_BE: case THUMB_FORMAT_RGB565_BE_90: return "RGB565 big-endian";
    case THUMB_FORMAT_RGB565_LE: case THUMB_FORMAT_RGB565_LE_90: return "RGB565 little-endian";
    case THUMB_FORMAT_I420_LE: case THUMB_FORMAT_I420_BE: return "I420";
    case THUMB_FORMAT_RGB555_LE: case THUMB_FORMAT_RGB555_LE_90: case THUMB_FORMAT_RGB555_BE: case THUMB_FORMAT_RGB555_BE_90: return "RGB555";
    case THUMB_FORMAT_REC_RGB555_LE: case THUMB_FORMAT_REC_RGB555_LE_90: case THUMB_FORMAT_REC_RGB555_BE: case THUMB_FORMAT_REC_RGB555_BE_90: return "RGB555 rectangular";
    default: return "other";
  }
}

/* The cover, photo and chapter formats libgpod uses for the iPod at `mountpoint`, one per line: kind, id, width, height, pixel format
   (tab-separated); g_free the result. */
char *zn_ipod_art_formats (const char *mountpoint) {
  Itdb_Device *dev = itdb_device_new ();
  itdb_device_set_mountpoint (dev, mountpoint);
  GString *x = g_string_new ("");
  const char *kinds[] = {"cover", "photo", "chapter"};
  for (int k = 0; k < 3; k++) {
    GList *list = k == 0 ? itdb_device_get_cover_art_formats (dev) : k == 1 ? itdb_device_get_photo_formats (dev) : itdb_device_get_chapter_image_formats (dev);
    for (GList *l = list; l; l = l->next) {
      const Itdb_ArtworkFormat *f = l->data;
      g_string_append_printf (x, "%s\t%d\t%d\t%d\t%s\n", kinds[k], f->format_id, f->width, f->height, format_name (f->format));
    }
    g_list_free (list);
  }
  itdb_device_free (dev);
  return g_string_free (x, FALSE);
}
