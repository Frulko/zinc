// zinc:imageio: image files on disk (docs/plugins/imageio.md). info() reads a file's header on the program's thread; thumbnail() and load()
// are jobs a few worker threads take newest first: decode, downscale, turn upright (EXIF orientation), and for a thumbnail keep a copy in the
// cache folder the program names (keyed by path, size and modification time). The program polls finished() (index.ts); no worker touches the
// Zinc heap.
// Two readers: ImageIO on Apple systems (JPEG, PNG, HEIC, WebP, GIF, TIFF, camera RAW; subsampled decoding, so a 50 MP picture costs what
// its thumbnail does), and the portable one: stb_image (PNG, JPEG, GIF, BMP), libwebp (the one zinc links, found at run time) and TinyEXIF
// (vendor/, MIT) for the metadata. A deterministic run (ZINC_DETERMINISTIC) reads with the portable one first, so its pixels are the same on
// every machine; ImageIO then only reads what the portable one cannot (HEIC, RAW). ZINC_IMAGEIO=system|portable picks the first one.
#define ZRT_HOSTED_CPP
#include "zinc_native_imageio.h"
#include "zrt_raster.h"
#include <dlfcn.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <deque>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
#define STB_IMAGE_STATIC
#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_PNG
#define STBI_ONLY_JPEG
#define STBI_ONLY_GIF
#define STBI_ONLY_BMP
#define STBI_NO_STDIO
#include "stb/stb_image.h"
#define STB_IMAGE_WRITE_STATIC
#define STB_IMAGE_WRITE_IMPLEMENTATION
#define STBI_WRITE_NO_STDIO
#include "stb/stb_image_write.h"
#define STB_IMAGE_RESIZE_STATIC
#define STB_IMAGE_RESIZE_IMPLEMENTATION
#include "stb/stb_image_resize2.h"
#define TINYEXIF_NO_XMP_SUPPORT
#include "../vendor/TinyEXIF.cpp"
#ifdef __APPLE__
#include <CoreFoundation/CoreFoundation.h>
#include <CoreGraphics/CoreGraphics.h>
#include <ImageIO/ImageIO.h>
#endif

// The rasterizer's runtime images: a headless program without zinc:gfx does not link it, and loaded by zinc each fallback asks the process
// for the real function first (as plugins/photos does).
template <class F> static F host_fn(const char* name, F self) { F f = reinterpret_cast<F>(dlsym(RTLD_DEFAULT, name)); return f != self ? f : nullptr; }
namespace zrt { namespace raster {
__attribute__((weak)) void dyn_update(int32_t id, const uint32_t* px, int32_t s) { static auto f = host_fn("_ZN3zrt6raster10dyn_updateEiPKji", &dyn_update); if (f) f(id, px, s); }
__attribute__((weak)) uint32_t* dyn_pixels(int32_t id) { static auto f = host_fn("_ZN3zrt6raster10dyn_pixelsEi", &dyn_pixels); return f ? f(id) : nullptr; }
__attribute__((weak)) void dyn_set_alpha(int32_t id, bool a) { static auto f = host_fn("_ZN3zrt6raster13dyn_set_alphaEib", &dyn_set_alpha); if (f) f(id, a); }
}}

namespace {
const char FS = '\x1f';
const int FULL = 4096;   // ponytail: "the whole picture" is fitted in 4096, the largest texture of the phone profiles (as zinc:photos)

// libwebp: zinc links it for its assets; looked up at run time so the plugin carries no second copy (null: WebP is not read here)
using WebPInfoFn = int (*)(const uint8_t*, size_t, int*, int*);
using WebPDecodeFn = uint8_t* (*)(const uint8_t*, size_t, int*, int*);
WebPInfoFn webpInfo() { static auto f = reinterpret_cast<WebPInfoFn>(dlsym(RTLD_DEFAULT, "WebPGetInfo")); return f; }
WebPDecodeFn webpDecode() { static auto f = reinterpret_cast<WebPDecodeFn>(dlsym(RTLD_DEFAULT, "WebPDecodeRGBA")); return f; }
void webpFree(void* p) { static auto f = reinterpret_cast<void (*)(void*)>(dlsym(RTLD_DEFAULT, "WebPFree")); if (f) f(p); else free(p); }

// the portable reader first: in a deterministic run (the same pixels on every machine), or when ZINC_IMAGEIO=portable; ZINC_IMAGEIO=system
// puts the system's first in any run
bool deterministic() { const char* d = getenv("ZINC_DETERMINISTIC"); const char* r = getenv("ZINC_REALTIME"); return d && *d && *d != '0' && !(r && *r && *r != '0'); }
bool portableFirst() {
  const char* e = getenv("ZINC_IMAGEIO");
  if (e && *e) return strcmp(e, "system") != 0;
  return deterministic();
}

struct Meta {
  int w = 0, h = 0, orient = 1;   // pixels as stored; orientation 1-8 (5-8 swap width and height)
  long long size = 0;
  double iso = 0, exposure = 0, fnumber = 0, focal = 0, lat = 0, lon = 0;
  bool located = false;
  std::string format, date, make, model, lens;
};
// a picture: straight (not premultiplied) RGBA, rows top first
struct Pixels { int w = 0, h = 0; std::vector<uint8_t> rgba; };

bool readFile(const std::string& path, std::vector<uint8_t>& out, size_t limit = (size_t)-1) {
  FILE* f = fopen(path.c_str(), "rb");
  if (!f) return false;
  out.clear();
  uint8_t buf[65536];
  size_t n;
  while (out.size() < limit && (n = fread(buf, 1, std::min(sizeof buf, limit - out.size()), f)) > 0) out.insert(out.end(), buf, buf + n);
  fclose(f);
  return true;
}
std::string sniff(const uint8_t* d, size_t n) {
  if (n >= 3 && d[0] == 0xFF && d[1] == 0xD8 && d[2] == 0xFF) return "jpeg";
  if (n >= 8 && !memcmp(d, "\x89PNG\r\n\x1a\n", 8)) return "png";
  if (n >= 6 && (!memcmp(d, "GIF87a", 6) || !memcmp(d, "GIF89a", 6))) return "gif";
  if (n >= 2 && d[0] == 'B' && d[1] == 'M') return "bmp";
  if (n >= 12 && !memcmp(d, "RIFF", 4) && !memcmp(d + 8, "WEBP", 4)) return "webp";
  if (n >= 12 && !memcmp(d + 4, "ftyp", 4) && (!memcmp(d + 8, "hei", 3) || !memcmp(d + 8, "mif1", 4) || !memcmp(d + 8, "msf1", 4) || !memcmp(d + 8, "avif", 4))) return !memcmp(d + 8, "avif", 4) ? "avif" : "heic";
  if (n >= 4 && (!memcmp(d, "II*\0", 4) || !memcmp(d, "MM\0*", 4))) return "tiff";
  return "";
}
uint32_t be32(const uint8_t* p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
uint32_t le32(const uint8_t* p) { return (uint32_t)p[3] << 24 | (uint32_t)p[2] << 16 | (uint32_t)p[1] << 8 | p[0]; }
// "2024:05:01 12:34:56" -> "2024-05-01T12:34:56"
std::string isoDate(std::string s) {
  if (s.size() < 19 || s[4] != ':' || s[7] != ':') return "";
  s = s.substr(0, 19);
  s[4] = s[7] = '-'; s[10] = 'T';
  return s;
}
void exifInto(const uint8_t* d, size_t n, bool segment, Meta& m) {
  TinyEXIF::EXIFInfo e;
  e.clear();   // parseFromEXIFSegment, unlike parseFrom, starts from the fields as they are
  if (segment) {   // a PNG eXIf or WebP EXIF chunk: a TIFF header, with or without the JPEG's "Exif\0\0"
    std::vector<uint8_t> b;
    if (n < 6 || memcmp(d, "Exif\0\0", 6)) b.assign((const uint8_t*)"Exif\0\0", (const uint8_t*)"Exif\0\0" + 6);
    b.insert(b.end(), d, d + n);
    if (e.parseFromEXIFSegment(b.data(), (unsigned)b.size()) != TinyEXIF::PARSE_SUCCESS) return;
  } else if (e.parseFrom(d, (unsigned)std::min<size_t>(n, 0xFFFFFFFFu)) != TinyEXIF::PARSE_SUCCESS) return;
  if (e.Orientation >= 1 && e.Orientation <= 8) m.orient = e.Orientation;
  m.date = isoDate(!e.DateTimeOriginal.empty() ? e.DateTimeOriginal : e.DateTime);
  m.make = e.Make; m.model = e.Model; m.lens = e.LensInfo.Model;
  m.iso = e.ISOSpeedRatings; m.exposure = e.ExposureTime; m.fnumber = e.FNumber; m.focal = e.FocalLength;
  if (e.GeoLocation.hasLatLon()) { m.located = true; m.lat = e.GeoLocation.Latitude; m.lon = e.GeoLocation.Longitude; }
}
// the portable reader's header: size and metadata from the first bytes of the file (all of them when `d` is the whole file)
bool portableInfo(const uint8_t* d, size_t n, Meta& m) {
  m.format = sniff(d, n);
  int c = 0;
  if (m.format == "webp") {
    if (!webpInfo() || !webpInfo()(d, n, &m.w, &m.h)) return false;
    for (size_t p = 12; p + 8 <= n;) {   // RIFF chunks: EXIF holds the metadata
      const uint32_t len = le32(d + p + 4);
      if (!memcmp(d + p, "EXIF", 4) && p + 8 + len <= n) { exifInto(d + p + 8, len, true, m); break; }
      p += 8 + len + (len & 1);
    }
    return true;
  }
  if (m.format != "jpeg" && m.format != "png" && m.format != "gif" && m.format != "bmp") return false;
  if (!stbi_info_from_memory(d, (int)std::min<size_t>(n, 0x7fffffff), &m.w, &m.h, &c)) return false;
  if (m.format == "jpeg") exifInto(d, n, false, m);
  else if (m.format == "png")
    for (size_t p = 8; p + 12 <= n;) {   // PNG chunks: eXIf comes before the pixels
      const uint32_t len = be32(d + p);
      if (!memcmp(d + p + 4, "eXIf", 4) && p + 12 + len <= n) { exifInto(d + p + 8, len, true, m); break; }
      if (!memcmp(d + p + 4, "IDAT", 4)) break;
      p += 12 + len;
    }
  return true;
}

void unpremultiply(Pixels& p) {
  for (size_t i = 0, k = (size_t)p.w * p.h; i < k; i++) {
    uint8_t* q = &p.rgba[i * 4];
    if (q[3] == 255 || q[3] == 0) continue;
    for (int c = 0; c < 3; c++) q[c] = (uint8_t)std::min(255, (q[c] * 255 + q[3] / 2) / q[3]);
  }
}

#ifdef __APPLE__
std::string str(CFStringRef s) {
  if (!s) return "";
  char b[512];
  return CFStringGetCString(s, b, sizeof b, kCFStringEncodingUTF8) ? b : "";
}
double num(CFDictionaryRef d, CFStringRef k) {
  const void* v = d ? CFDictionaryGetValue(d, k) : nullptr;
  double r = 0;
  if (v && CFGetTypeID(v) == CFNumberGetTypeID()) CFNumberGetValue((CFNumberRef)v, kCFNumberDoubleType, &r);
  else if (v && CFGetTypeID(v) == CFArrayGetTypeID() && CFArrayGetCount((CFArrayRef)v) > 0) {   // ISOSpeedRatings is a list
    const void* x = CFArrayGetValueAtIndex((CFArrayRef)v, 0);
    if (CFGetTypeID(x) == CFNumberGetTypeID()) CFNumberGetValue((CFNumberRef)x, kCFNumberDoubleType, &r);
  }
  return r;
}
std::string text(CFDictionaryRef d, CFStringRef k) {
  const void* v = d ? CFDictionaryGetValue(d, k) : nullptr;
  return v && CFGetTypeID(v) == CFStringGetTypeID() ? str((CFStringRef)v) : "";
}
CGImageSourceRef openSource(const std::string& path) {
  CFURLRef u = CFURLCreateFromFileSystemRepresentation(nullptr, (const UInt8*)path.data(), (CFIndex)path.size(), false);
  if (!u) return nullptr;
  const void* k[] = {kCGImageSourceShouldCache};
  const void* v[] = {kCFBooleanFalse};
  CFDictionaryRef o = CFDictionaryCreate(nullptr, k, v, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  CGImageSourceRef s = CGImageSourceCreateWithURL(u, o);
  CFRelease(o); CFRelease(u);
  if (s && CGImageSourceGetCount(s) == 0) { CFRelease(s); return nullptr; }
  return s;
}
std::string formatOf(const std::string& uti) {
  static const char* const map[][2] = {{"public.jpeg", "jpeg"}, {"public.png", "png"}, {"public.heic", "heic"}, {"public.heif", "heic"}, {"public.avif", "avif"},
                                       {"org.webmproject.webp", "webp"}, {"com.compuserve.gif", "gif"}, {"public.tiff", "tiff"}, {"com.microsoft.bmp", "bmp"}};
  for (auto& p : map) if (uti == p[0]) return p[1];
  return uti.find("raw-image") != std::string::npos || uti == "com.adobe.raw-image" ? "raw" : uti;
}
bool appleInfo(const std::string& path, Meta& m) {
  CGImageSourceRef s = openSource(path);
  if (!s) return false;
  CFDictionaryRef p = CGImageSourceCopyPropertiesAtIndex(s, 0, nullptr);   // the header: nothing is decoded
  bool ok = p && CFDictionaryGetValue(p, kCGImagePropertyPixelWidth);
  if (ok) {
    m.format = formatOf(str(CGImageSourceGetType(s)));
    m.w = (int)num(p, kCGImagePropertyPixelWidth); m.h = (int)num(p, kCGImagePropertyPixelHeight);
    const int o = (int)num(p, kCGImagePropertyOrientation);
    m.orient = o >= 1 && o <= 8 ? o : 1;
    CFDictionaryRef exif = (CFDictionaryRef)CFDictionaryGetValue(p, kCGImagePropertyExifDictionary);
    CFDictionaryRef tiff = (CFDictionaryRef)CFDictionaryGetValue(p, kCGImagePropertyTIFFDictionary);
    CFDictionaryRef gps = (CFDictionaryRef)CFDictionaryGetValue(p, kCGImagePropertyGPSDictionary);
    m.date = isoDate(text(exif, kCGImagePropertyExifDateTimeOriginal));
    if (m.date.empty()) m.date = isoDate(text(tiff, kCGImagePropertyTIFFDateTime));
    m.make = text(tiff, kCGImagePropertyTIFFMake); m.model = text(tiff, kCGImagePropertyTIFFModel);
    m.lens = text(exif, kCGImagePropertyExifLensModel);
    m.iso = num(exif, kCGImagePropertyExifISOSpeedRatings); m.exposure = num(exif, kCGImagePropertyExifExposureTime);
    m.fnumber = num(exif, kCGImagePropertyExifFNumber); m.focal = num(exif, kCGImagePropertyExifFocalLength);
    if (gps && CFDictionaryGetValue(gps, kCGImagePropertyGPSLatitude) && CFDictionaryGetValue(gps, kCGImagePropertyGPSLongitude)) {
      m.located = true;
      m.lat = num(gps, kCGImagePropertyGPSLatitude) * (text(gps, kCGImagePropertyGPSLatitudeRef) == "S" ? -1 : 1);
      m.lon = num(gps, kCGImagePropertyGPSLongitude) * (text(gps, kCGImagePropertyGPSLongitudeRef) == "W" ? -1 : 1);
    }
  }
  if (p) CFRelease(p);
  CFRelease(s);
  return ok;
}
// the picture upright, its longest side `side` pixels at most (never enlarged): ImageIO decodes only what that size needs
bool appleDecode(const std::string& path, int side, Pixels& out, std::string& why) {
  CGImageSourceRef s = openSource(path);
  if (!s) { why = "imageio: not an image it can read: " + path; return false; }
  int sideV = side;
  CFNumberRef n = CFNumberCreate(nullptr, kCFNumberIntType, &sideV);
  const void* k[] = {kCGImageSourceCreateThumbnailFromImageAlways, kCGImageSourceCreateThumbnailWithTransform, kCGImageSourceShouldCacheImmediately, kCGImageSourceThumbnailMaxPixelSize};
  const void* v[] = {kCFBooleanTrue, kCFBooleanTrue, kCFBooleanTrue, n};
  CFDictionaryRef o = CFDictionaryCreate(nullptr, k, v, 4, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
  CGImageRef img = CGImageSourceCreateThumbnailAtIndex(s, 0, o);
  CFRelease(o); CFRelease(n); CFRelease(s);
  if (!img) { why = "imageio: cannot decode " + path; return false; }
  out.w = (int)CGImageGetWidth(img); out.h = (int)CGImageGetHeight(img);
  out.rgba.assign((size_t)out.w * out.h * 4, 0);
  CGColorSpaceRef cs = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);   // a Display P3 HEIC lands in sRGB, what the screen is drawn in
  CGContextRef ctx = CGBitmapContextCreate(out.rgba.data(), out.w, out.h, 8, (size_t)out.w * 4, cs, kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(cs);
  if (ctx) {
    CGContextSetBlendMode(ctx, kCGBlendModeCopy);
    CGContextDrawImage(ctx, CGRectMake(0, 0, out.w, out.h), img);
    CGContextRelease(ctx);
  }
  CGImageRelease(img);
  if (!ctx) { why = "imageio: cannot draw " + path; return false; }
  unpremultiply(out);
  return true;
}
#endif

bool readInfo(const std::string& path, Meta& m) {
  struct stat st;
  if (stat(path.c_str(), &st) != 0 || !S_ISREG(st.st_mode)) return false;
  m.size = (long long)st.st_size;
#ifdef __APPLE__
  if (!portableFirst()) return appleInfo(path, m);
#endif
  std::vector<uint8_t> head;
  if (!readFile(path, head, 1 << 20)) return false;   // the header and the EXIF block lie in the first megabyte
  Meta p = m;
  if (portableInfo(head.data(), head.size(), p) || ((size_t)st.st_size > head.size() && readFile(path, head) && portableInfo(head.data(), head.size(), p))) { m = p; return true; }
#ifdef __APPLE__
  return appleInfo(path, m);
#else
  return false;
#endif
}

// the stored pixels turned upright as orientation `o` says
void orient(Pixels& p, int o) {
  if (o <= 1 || o > 8) return;
  const int w = p.w, h = p.h, ow = o >= 5 ? h : w, oh = o >= 5 ? w : h;
  std::vector<uint8_t> out((size_t)ow * oh * 4);
  for (int y = 0; y < oh; y++)
    for (int x = 0; x < ow; x++) {
      int sx = x, sy = y;
      switch (o) {
        case 2: sx = w - 1 - x; break;
        case 3: sx = w - 1 - x; sy = h - 1 - y; break;
        case 4: sy = h - 1 - y; break;
        case 5: sx = y; sy = x; break;
        case 6: sx = y; sy = h - 1 - x; break;
        case 7: sx = w - 1 - y; sy = h - 1 - x; break;
        case 8: sx = w - 1 - y; sy = x; break;
      }
      memcpy(&out[((size_t)y * ow + x) * 4], &p.rgba[((size_t)sy * w + sx) * 4], 4);
    }
  p.w = ow; p.h = oh; p.rgba.swap(out);
}
void fit(Pixels& p, int side) {
  const int big = std::max(p.w, p.h);
  if (big <= side) return;
  const double s = (double)side / big;
  const int w = std::max(1, (int)(p.w * s + 0.5)), h = std::max(1, (int)(p.h * s + 0.5));
  std::vector<uint8_t> out((size_t)w * h * 4);
  stbir_resize_uint8_srgb(p.rgba.data(), p.w, p.h, 0, out.data(), w, h, 0, STBIR_RGBA);
  p.w = w; p.h = h; p.rgba.swap(out);
}
bool portableDecode(const std::string& path, int side, Pixels& out, std::string& why) {
  std::vector<uint8_t> f;
  if (!readFile(path, f)) { why = "imageio: cannot read " + path + ": " + strerror(errno); return false; }
  Meta m;
  if (!portableInfo(f.data(), f.size(), m)) { why = "imageio: not an image it can read: " + path; return false; }
  uint8_t* d = nullptr;
  if (m.format == "webp") d = webpDecode() ? webpDecode()(f.data(), f.size(), &out.w, &out.h) : nullptr;
  else { int c = 0; d = stbi_load_from_memory(f.data(), (int)f.size(), &out.w, &out.h, &c, 4); }
  if (!d) { why = "imageio: cannot decode " + path; return false; }
  out.rgba.assign(d, d + (size_t)out.w * out.h * 4);
  if (m.format == "webp") webpFree(d); else stbi_image_free(d);
  fit(out, side);
  orient(out, m.orient);
  return true;
}
bool decode(const std::string& path, int side, Pixels& out, std::string& why) {
#ifdef __APPLE__
  if (!portableFirst()) return appleDecode(path, side, out, why);
  return portableDecode(path, side, out, why) || appleDecode(path, side, out, why);
#else
  return portableDecode(path, side, out, why);
#endif
}

// ---- the thumbnail cache: <dir>/<hash of path, size, mtime, side>.jpg (.png with alpha); written to a temporary name, then renamed
uint64_t fnv(const std::string& s) { uint64_t h = 1469598103934665603ull; for (unsigned char c : s) { h ^= c; h *= 1099511628211ull; } return h; }
std::string cacheName(const std::string& dir, const std::string& path, int side) {
  struct stat st;
  if (dir.empty() || stat(path.c_str(), &st) != 0) return "";
#if defined(__APPLE__)
  const long long ns = (long long)st.st_mtimespec.tv_sec * 1000000000 + st.st_mtimespec.tv_nsec;
#else
  const long long ns = (long long)st.st_mtim.tv_sec * 1000000000 + st.st_mtim.tv_nsec;
#endif
  char b[64];
  snprintf(b, sizeof b, "%016llx", (unsigned long long)fnv("v1\n" + path + "\n" + std::to_string((long long)st.st_size) + "\n" + std::to_string(ns) + "\n" + std::to_string(side)));
  return dir + "/" + b;
}
void mkdirs(const std::string& dir) {
  for (size_t i = 1; i <= dir.size(); i++)
    if (i == dir.size() || dir[i] == '/') mkdir(dir.substr(0, i).c_str(), 0755);
}
bool cacheRead(const std::string& base, Pixels& p) {
  for (const char* ext : {".jpg", ".png"}) {
    std::vector<uint8_t> f;
    if (!readFile(base + ext, f) || f.empty()) continue;
    int c = 0;
    uint8_t* d = stbi_load_from_memory(f.data(), (int)f.size(), &p.w, &p.h, &c, 4);
    if (!d) continue;
    p.rgba.assign(d, d + (size_t)p.w * p.h * 4);
    stbi_image_free(d);
    return true;
  }
  return false;
}
void cacheWrite(const std::string& dir, const std::string& base, const Pixels& p) {
  bool alpha = false;
  for (size_t i = 3; i < p.rgba.size() && !alpha; i += 4) alpha = p.rgba[i] != 255;
  std::vector<uint8_t> enc;
  auto sink = [](void* ctx, void* d, int n) { auto* o = (std::vector<uint8_t>*)ctx; o->insert(o->end(), (uint8_t*)d, (uint8_t*)d + n); };
  if (alpha) stbi_write_png_to_func(sink, &enc, p.w, p.h, 4, p.rgba.data(), p.w * 4);
  else stbi_write_jpg_to_func(sink, &enc, p.w, p.h, 4, p.rgba.data(), 88);
  if (enc.empty()) return;
  mkdirs(dir);
  const std::string tmp = base + ".tmp" + std::to_string((unsigned long long)std::hash<std::thread::id>()(std::this_thread::get_id()));
  FILE* f = fopen(tmp.c_str(), "wb");
  if (!f) return;
  const bool ok = fwrite(enc.data(), 1, enc.size(), f) == enc.size();
  fclose(f);
  if (!ok || rename(tmp.c_str(), (base + (alpha ? ".png" : ".jpg")).c_str()) != 0) remove(tmp.c_str());
}

// ---- jobs and the workers
struct Job {
  int32_t id = 0;
  bool thumb = false;
  std::string path, cache;
  int a = 0, b = 0;                 // a thumbnail: the side; a load: the box
  std::atomic<int> state{0};        // 0 waiting or running, 1 done, -1 failed
  Pixels px;
  std::string why;
};
struct Pool {
  std::mutex m;
  std::condition_variable cv;
  std::deque<std::shared_ptr<Job>> queue;   // taken from the back: the newest request first (the cells a grid scrolled to)
  std::vector<int32_t> done;
  int threads = 0, busy = 0;                // busy: jobs taken by a worker and not done yet
  std::condition_variable idle;             // a deterministic run's finished() waits for it
};
Pool& pool() { static Pool* p = new Pool; return *p; }   // never destroyed: the workers outlive main()

void run(Job& j) {
  if (j.thumb) {
    const std::string base = cacheName(j.cache, j.path, j.a);
    if (!base.empty() && cacheRead(base, j.px)) { j.state.store(1, std::memory_order_release); return; }
    if (!decode(j.path, j.a, j.px, j.why)) { j.state.store(-1, std::memory_order_release); return; }
    if (!base.empty()) cacheWrite(j.cache, base, j.px);
  } else {
    Meta m;
    if (!readInfo(j.path, m)) { j.why = "imageio: not an image it can read: " + j.path; j.state.store(-1, std::memory_order_release); return; }
    const bool turned = m.orient >= 5;
    const double dw = turned ? m.h : m.w, dh = turned ? m.w : m.h;
    const int bw = j.a > 0 ? j.a : FULL, bh = j.b > 0 ? j.b : FULL;
    const double s = std::min(1.0, std::min(bw / dw, bh / dh));
    const int side = std::max(1, (int)(std::max(dw, dh) * s + 0.5));
    if (!decode(j.path, side, j.px, j.why)) { j.state.store(-1, std::memory_order_release); return; }
  }
  j.state.store(1, std::memory_order_release);
}
void worker() {
  Pool& p = pool();
  for (;;) {
    std::shared_ptr<Job> j;
    {
      std::unique_lock<std::mutex> l(p.m);
      p.cv.wait(l, [&] { return !p.queue.empty(); });
      j = std::move(p.queue.back());
      p.queue.pop_back();
      p.busy++;
    }
    run(*j);
    std::lock_guard<std::mutex> l(p.m);
    p.done.push_back(j->id);
    if (--p.busy == 0 && p.queue.empty()) p.idle.notify_all();
  }
}
void submit(std::shared_ptr<Job> j) {
  Pool& p = pool();
  std::lock_guard<std::mutex> l(p.m);
  p.queue.push_back(std::move(j));
  // ponytail: up to 4 workers (fewer on a small machine); each holds one decoded picture at a time
  const int want = std::max(1, std::min(4, (int)std::thread::hardware_concurrency() - 1));
  if (p.threads < want) { p.threads++; std::thread(worker).detach(); }
  p.cv.notify_one();
}

std::unordered_map<int32_t, std::shared_ptr<Job>> jobs;   // the program's thread only
int32_t nextId = 1;
std::string cstr(const zrt::String& s) { return std::string(s.ptr(), s.bytes()); }
zrt::String zstr(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
Job* at(int32_t id) { auto it = jobs.find(id); return it == jobs.end() ? nullptr : it->second.get(); }
std::string fmt(double v) { char b[48]; snprintf(b, sizeof b, "%.10g", v); return b; }
zrt::Array<double> nums(const std::vector<double>& v) {
  zrt::Array<double> r = zrt::Array<double>::with_cap((uint32_t)std::max<size_t>(1, v.size()));
  if (!v.empty()) memcpy(r.a->data, v.data(), v.size() * sizeof(double));
  r.a->len = (uint32_t)v.size();
  return r;
}
int32_t start(bool thumb, const std::string& path, int a, int b, const std::string& cache) {
  auto j = std::make_shared<Job>();
  j->id = nextId++; j->thumb = thumb; j->path = path; j->a = a; j->b = b; j->cache = cache;
  jobs[j->id] = j;
  submit(j);
  return j->id;
}
}  // namespace

struct HostImageio : NativeImageio {
  zrt::String info(zrt::String pathIn) override {
    Meta m;
    if (!readInfo(cstr(pathIn), m)) return zstr("");
    const bool turned = m.orient >= 5;
    std::string out;
    for (const std::string& f : {std::to_string(turned ? m.h : m.w), std::to_string(turned ? m.w : m.h), std::to_string(m.w), std::to_string(m.h),
                                 std::to_string(m.orient), m.format, std::to_string(m.size), m.date, m.make, m.model, m.lens, fmt(m.iso), fmt(m.exposure),
                                 fmt(m.fnumber), fmt(m.focal), m.located ? fmt(m.lat) : std::string(), m.located ? fmt(m.lon) : std::string()})
      out += f + FS;
    out.pop_back();
    return zstr(out);
  }
  int32_t thumbnail(zrt::String path, int32_t side, zrt::String cache) override { return start(true, cstr(path), std::max(1, std::min(side, FULL)), 0, cstr(cache)); }
  int32_t load(zrt::String path, int32_t w, int32_t h) override { return start(false, cstr(path), std::max(0, w), std::max(0, h), ""); }
  void cancel(int32_t id) override {
    Pool& p = pool();
    std::lock_guard<std::mutex> l(p.m);
    for (auto it = p.queue.begin(); it != p.queue.end(); ++it)
      if ((*it)->id == id) {
        (*it)->why = "cancelled";
        (*it)->state.store(-1, std::memory_order_release);
        p.queue.erase(it);
        p.done.push_back(id);
        return;
      }
  }
  zrt::Array<double> finished() override {
    std::vector<int32_t> d;
    {
      Pool& p = pool();
      std::unique_lock<std::mutex> l(p.m);
      // a deterministic run gets every requested picture at the first poll: the frame a thumbnail appears on does not depend on the machine
      if (deterministic()) p.idle.wait(l, [&] { return p.busy == 0 && p.queue.empty(); });
      d.swap(p.done);
    }
    return nums(std::vector<double>(d.begin(), d.end()));
  }
  int32_t state(int32_t id) override { Job* j = at(id); return j ? j->state.load(std::memory_order_acquire) : -2; }
  zrt::Array<double> size(int32_t id) override {
    Job* j = at(id);
    const bool ok = j && j->state.load(std::memory_order_acquire) == 1;
    return nums({ok ? (double)j->px.w : 0, ok ? (double)j->px.h : 0});
  }
  bool copy(int32_t id, int32_t image) override {
    Job* j = at(id);
    uint32_t* d = j && j->state.load(std::memory_order_acquire) == 1 && !j->px.rgba.empty() ? zrt::raster::dyn_pixels(image) : nullptr;
    if (!d) return false;
    bool alpha = false;
    const uint8_t* s = j->px.rgba.data();
    for (size_t i = 0, n = (size_t)j->px.w * j->px.h; i < n; i++, s += 4) {
      d[i] = (uint32_t)s[3] << 24 | (uint32_t)s[0] << 16 | (uint32_t)s[1] << 8 | s[2];
      alpha |= s[3] != 255;
    }
    zrt::raster::dyn_set_alpha(image, alpha);
    zrt::raster::dyn_update(image, nullptr, 0);
    return true;
  }
  zrt::String result(int32_t id) override { Job* j = at(id); return zstr(j && j->state.load(std::memory_order_acquire) == -1 ? j->why : ""); }
  void release(int32_t id) override { jobs.erase(id); }   // a running job keeps its own reference and ends alone
};

NativeImageio* zinc_create_Imageio() {
  static HostImageio inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
