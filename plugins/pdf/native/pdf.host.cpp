// zinc:pdf for macos and linux: PDFium (vendor/PIN) loaded at run time with dlopen, so the plugin builds anywhere (a cross build of
// tools/package needs no library) and a program that never opens a PDF never loads it. Where it looks, first found wins:
//   $ZINC_PDFIUM (the library file); libpdfium.so / .dylib on the loader's path (the reMarkable bundle's lib/, which zinc-app puts on
//   LD_LIBRARY_PATH); <exe>/../lib/; plugins/pdf/vendor/pdfium/<platform>/lib/ of $ZINC_ROOT, of <exe>/.. (a checkout's build/zinc)
//   and of <exe>/../share/zinc (a package), where vendor/fetch puts it.
// PDFium is not thread-safe: every call comes from the program's thread. FPDF_InitLibrary runs once, at the first open; documents are
// closed by close(), pages after each call (a page is loaded per call: a page turn on e-paper costs far more than the load).
// No C++ standard library here: zrt.h defines its own placement new.
#include "zinc_native_pdf.h"
#include "zrt_raster.h"
#include "../vendor/include/fpdfview.h"
#include "../vendor/include/fpdf_annot.h"
#include "../vendor/include/fpdf_save.h"
#include <dlfcn.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#if defined(__APPLE__)
#include <mach-o/dyld.h>
#define PDFIUM_LIB "libpdfium.dylib"
#define PDFIUM_PLATFORM "macos-arm64"
#else
#include <unistd.h>
#define PDFIUM_LIB "libpdfium.so"
#define PDFIUM_PLATFORM "linux-arm64"
#endif
#define PDFIUM_VENDOR "/plugins/pdf/vendor/pdfium/" PDFIUM_PLATFORM "/lib/" PDFIUM_LIB

#define PDFIUM_FUNCS(X) \
  X(FPDF_InitLibrary) X(FPDF_LoadDocument) X(FPDF_CloseDocument) X(FPDF_GetLastError) X(FPDF_GetPageCount) X(FPDF_LoadPage) \
  X(FPDF_ClosePage) X(FPDF_GetPageWidthF) X(FPDF_GetPageHeightF) X(FPDFBitmap_CreateEx) X(FPDFBitmap_FillRect) X(FPDFBitmap_Destroy) \
  X(FPDF_RenderPageBitmap) X(FPDF_DeviceToPage) X(FPDFPage_CreateAnnot) X(FPDFPage_CloseAnnot) X(FPDFAnnot_AddInkStroke) \
  X(FPDFAnnot_SetColor) X(FPDFAnnot_SetBorder) X(FPDFAnnot_SetRect) X(FPDF_SaveAsCopy)

namespace {
struct Api {
#define PDFIUM_FIELD(f) decltype(&::f) f = nullptr;
  PDFIUM_FUNCS(PDFIUM_FIELD)
#undef PDFIUM_FIELD
} P;
bool tried = false;
char loadError[256] = "PDFium is not loaded yet";
char errMsg[512];
const int MAXDOC = 32;
FPDF_DOCUMENT docs[MAXDOC];

void setErr(const char* m) { snprintf(errMsg, sizeof errMsg, "%s", m); }
zrt::String str(const char* s) { return zrt::String::from(s, (uint32_t)strlen(s)); }
// a NUL-terminated copy of a Zinc string
struct CStr { zrt::StrBuilder sb; CStr(const zrt::String& s) { zrt::to_s(sb, s); sb.ch('\0'); } const char* c() const { return sb.buf; } };

// the directory of the running zinc, '' when unknown
void exeDir(char* out, size_t cap) {
  out[0] = 0;
  char buf[PATH_MAX];
#if defined(__APPLE__)
  uint32_t n = sizeof buf;
  char real[PATH_MAX];
  if (_NSGetExecutablePath(buf, &n) != 0) return;
  snprintf(out, cap, "%s", realpath(buf, real) ? real : buf);
#else
  ssize_t n = readlink("/proc/self/exe", buf, sizeof buf - 1);
  if (n <= 0) return;
  buf[n] = 0;
  snprintf(out, cap, "%s", buf);
#endif
  if (char* s = strrchr(out, '/')) *s = 0; else out[0] = 0;
}

void* tryOpen(const char* a, const char* b = "", const char* c = "") {
  char p[PATH_MAX * 2];
  snprintf(p, sizeof p, "%s%s%s", a, b, c);
  return dlopen(p, RTLD_NOW | RTLD_LOCAL);
}

bool load() {
  if (tried) return loadError[0] == 0;
  tried = true;
  char exe[PATH_MAX];
  exeDir(exe, sizeof exe);
  const char* env = getenv("ZINC_PDFIUM");
  const char* root = getenv("ZINC_ROOT");
  void* h = nullptr;
  if (env && *env) h = tryOpen(env);
  if (!h) h = tryOpen(PDFIUM_LIB);
  if (!h && *exe) h = tryOpen(exe, "/../lib/" PDFIUM_LIB);
  if (!h && root && *root) h = tryOpen(root, PDFIUM_VENDOR);
  if (!h && *exe) h = tryOpen(exe, "/.." PDFIUM_VENDOR);
  if (!h && *exe) h = tryOpen(exe, "/../share/zinc" PDFIUM_VENDOR);
  if (!h) {
    snprintf(loadError, sizeof loadError, "PDFium (" PDFIUM_LIB ") was not found: run plugins/pdf/vendor/fetch, or set ZINC_PDFIUM to the library");
    return false;
  }
#define PDFIUM_SYM(f) P.f = (decltype(P.f))dlsym(h, #f); if (!P.f) { snprintf(loadError, sizeof loadError, "PDFium has no " #f); return false; }
  PDFIUM_FUNCS(PDFIUM_SYM)
#undef PDFIUM_SYM
  P.FPDF_InitLibrary();
  loadError[0] = 0;
  return true;
}

FPDF_DOCUMENT docAt(int32_t d) { return d >= 0 && d < MAXDOC ? docs[d] : nullptr; }

// One page for the length of a call.
struct Page {
  FPDF_PAGE p = nullptr;
  Page(int32_t d, int32_t i) { FPDF_DOCUMENT doc = docAt(d); if (doc && i >= 0 && i < P.FPDF_GetPageCount(doc)) p = P.FPDF_LoadPage(doc, i); if (!p) setErr("no such page"); }
  ~Page() { if (p) P.FPDF_ClosePage(p); }
};

const char* pdfError(unsigned long e) {
  switch (e) {
    case FPDF_ERR_FILE: return "the file cannot be opened";
    case FPDF_ERR_FORMAT: return "the file is not a PDF, or it is damaged";
    case FPDF_ERR_PASSWORD: return "the PDF needs a password, or the password is wrong";
    case FPDF_ERR_SECURITY: return "the PDF uses an unsupported security scheme";
    case FPDF_ERR_PAGE: return "a page cannot be read";
    default: return "PDFium cannot open the file";
  }
}

struct FileWrite : FPDF_FILEWRITE { FILE* f = nullptr; bool ok = true; };
int writeBlock(FPDF_FILEWRITE* self, const void* data, unsigned long size) {
  FileWrite* w = static_cast<FileWrite*>(self);
  if (fwrite(data, 1, size, w->f) != size) w->ok = false;
  return w->ok ? 1 : 0;
}
}  // namespace

struct HostPdf : NativePdf {
  zrt::String status() override { load(); return str(loadError); }
  int32_t open(zrt::String path, zrt::String password) override {
    if (!load()) { setErr(loadError); return -1; }
    int h = 0;
    while (h < MAXDOC && docs[h]) h++;
    if (h == MAXDOC) { setErr("too many open documents"); return -1; }
    CStr p(path), pw(password);
    FPDF_DOCUMENT d = P.FPDF_LoadDocument(p.c(), pw.c()[0] ? pw.c() : nullptr);
    if (!d) { setErr(pdfError(P.FPDF_GetLastError())); return -1; }
    docs[h] = d;
    return h;
  }
  zrt::String error() override { return str(errMsg); }
  int32_t pageCount(int32_t d) override { FPDF_DOCUMENT doc = docAt(d); return doc ? P.FPDF_GetPageCount(doc) : 0; }
  double pageWidth(int32_t d, int32_t i) override { Page pg(d, i); return pg.p ? P.FPDF_GetPageWidthF(pg.p) : 0; }
  double pageHeight(int32_t d, int32_t i) override { Page pg(d, i); return pg.p ? P.FPDF_GetPageHeightF(pg.p) : 0; }

  int32_t render(int32_t d, int32_t i, double scale, double x, double y, int32_t w, int32_t h, int32_t img) override {
    if (w <= 0 || h <= 0 || w > 8192 || h > 8192 || !(scale > 0)) { setErr("bad render size"); return -1; }
    Page pg(d, i);
    if (!pg.p) return -1;
    int32_t iw = 0, ih = 0;
    if (img < 0 || !zrt::raster::image_size(img, &iw, &ih)) img = zrt::raster::dyn_create(w, h);
    else if (iw != w || ih != h) zrt::raster::dyn_resize(img, w, h);
    if (img < 0) { setErr("no runtime image left"); return -1; }
    uint32_t* px = zrt::raster::dyn_pixels(img);
    // BGRx in memory is 0x..RRGGBB in a little-endian uint32: the runtime image's own layout, so PDFium draws straight into it
    FPDF_BITMAP bm = P.FPDFBitmap_CreateEx(w, h, FPDFBitmap_BGRx, px, w * 4);
    if (!bm) { setErr("PDFium cannot make a bitmap"); return -1; }
    P.FPDFBitmap_FillRect(bm, 0, 0, w, h, 0xFFFFFFFF);
    const double pw = P.FPDF_GetPageWidthF(pg.p) * scale, ph = P.FPDF_GetPageHeightF(pg.p) * scale;
    P.FPDF_RenderPageBitmap(bm, pg.p, (int)lround(-x), (int)lround(-y), (int)lround(pw), (int)lround(ph), 0, FPDF_ANNOT);
    P.FPDFBitmap_Destroy(bm);
    zrt::raster::dyn_update(img, nullptr, w);
    return img;
  }

  bool addInk(int32_t d, int32_t i, zrt::Array<double> pts, int32_t color, double width) override {
    Page pg(d, i);
    if (!pg.p) return false;
    const int n = pts.a ? (int)pts.a->len / 2 : 0;
    if (n < 1) { setErr("an ink stroke needs a point"); return false; }
    // page units (top left, as shown) to PDF user space through PDFium's own device mapping (rotation, crop box), at 1/16 point
    const int K = 16, sw = (int)lround(P.FPDF_GetPageWidthF(pg.p) * K), sh = (int)lround(P.FPDF_GetPageHeightF(pg.p) * K);
    FS_POINTF* v = (FS_POINTF*)malloc(sizeof(FS_POINTF) * (size_t)n);
    if (!v) { setErr("out of memory"); return false; }
    float x0 = 1e9f, y0 = 1e9f, x1 = -1e9f, y1 = -1e9f;
    for (int k = 0; k < n; k++) {
      double px = 0, py = 0;
      P.FPDF_DeviceToPage(pg.p, 0, 0, sw, sh, 0, (int)lround(pts.a->data[2 * k] * K), (int)lround(pts.a->data[2 * k + 1] * K), &px, &py);
      v[k].x = (float)px; v[k].y = (float)py;
      x0 = fminf(x0, (float)px); y0 = fminf(y0, (float)py); x1 = fmaxf(x1, (float)px); y1 = fmaxf(y1, (float)py);
    }
    FPDF_ANNOTATION a = P.FPDFPage_CreateAnnot(pg.p, FPDF_ANNOT_INK);
    bool ok = a != nullptr;
    if (ok) {
      const float m = (float)width;
      FS_RECTF r;
      r.left = x0 - m; r.top = y1 + m; r.right = x1 + m; r.bottom = y0 - m;
      ok = P.FPDFAnnot_SetRect(a, &r) && P.FPDFAnnot_SetColor(a, FPDFANNOT_COLORTYPE_Color, (unsigned)(color >> 16) & 255, (unsigned)(color >> 8) & 255, (unsigned)color & 255, 255) &&
           P.FPDFAnnot_SetBorder(a, 0, 0, (float)width) && P.FPDFAnnot_AddInkStroke(a, v, (size_t)n) >= 0;
      P.FPDFPage_CloseAnnot(a);
    }
    free(v);
    if (!ok) setErr("PDFium refused the ink annotation");
    return ok;
  }

  bool save(int32_t d, zrt::String path) override {
    FPDF_DOCUMENT doc = docAt(d);
    if (!doc) { setErr("the document is closed"); return false; }
    CStr p(path);
    char tmp[PATH_MAX + 8];
    snprintf(tmp, sizeof tmp, "%s.tmp", p.c());
    FileWrite w;
    w.version = 1;
    w.WriteBlock = writeBlock;
    w.f = fopen(tmp, "wb");
    if (!w.f) { setErr("cannot write the file"); return false; }
    bool ok = P.FPDF_SaveAsCopy(doc, &w, FPDF_NO_INCREMENTAL) && w.ok;
    ok = fclose(w.f) == 0 && ok;
    if (ok) ok = rename(tmp, p.c()) == 0;
    if (!ok) { remove(tmp); setErr("PDFium could not write the PDF"); }
    return ok;
  }

  void close(int32_t d) override {
    FPDF_DOCUMENT doc = docAt(d);
    if (!doc) return;
    P.FPDF_CloseDocument(doc);
    docs[d] = nullptr;
  }

  zrt::String hash(int32_t img) override {
    const uint32_t* px = nullptr;
    int32_t w = 0, h = 0, stride = 0;
    if (!zrt::raster::dyn_view(img, &px, &w, &h, &stride)) return str("");
    uint64_t f = 1469598103934665603ull;
    for (int32_t y = 0; y < h; y++) for (int32_t x = 0; x < w; x++) { f ^= px[(size_t)y * stride + x] & 0xFFFFFF; f *= 1099511628211ull; }
    char b[17];
    snprintf(b, sizeof b, "%016llx", (unsigned long long)f);
    return str(b);
  }
};

NativePdf* zinc_create_Pdf() {
  static HostPdf inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
