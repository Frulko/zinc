/* libgpod 0.8.3 configuration for zinc:ipod: written by hand, no autoconf. glib, libxml2, libplist,
   sqlite3 and zlib come from pkg-config; gdk-pixbuf is the stb shim of ../shim; no libimobiledevice
   (iPhone/iPod touch sync is out of scope), no gettext. */
#define GETTEXT_PACKAGE "libgpod"
#define VERSION "0.8.3"
#define PACKAGE "libgpod"
#define HAVE_GDKPIXBUF 1
#define HAVE_LIBXML 1
#define HAVE_ZLIB 1
#define HAVE_LOCALTIME_R 1
#define HAVE_STRUCT_TM_TM_GMTOFF 1
#define HAVE_G_CHECKSUM_RESET 1
#define HAVE_G_INT64_EQUAL 1
#define HAVE_G_INT64_HASH 1
#define HAVE_G_MAPPED_FILE_UNREF 1
#define TMPMOUNTDIR "/tmp/"
#define HAVE_UNISTD_H 1
#define HAVE_STDINT_H 1
#define HAVE_SYS_STAT_H 1
#define HAVE_SYS_TYPES_H 1
#define HAVE_STRING_H 1
#define HAVE_STDLIB_H 1
