// A stand-in for xochitl's libqsgepaper.so with the same exported names (OS 3.27 ABI). It records what the ink lane calls into
// $FAKE_LOG and owns a 1620x2160 RGB32 buffer (bpl 6528) built as an external-memory QImage, so framebuffer-spy finds it as on the tablet.
#include <QImage>
#include <QRect>
#include <QString>
#include <cstdio>
#include <cstdlib>

enum EPContentType : int {};
enum EPScreenMode : int {};
static void log(const char* fmt, int a = 0, int b = 0, int c = 0, int d = 0, int e = 0, int f = 0) {
  if (FILE* out = fopen(getenv("FAKE_LOG") ? getenv("FAKE_LOG") : "/tmp/fake.log", "a")) { fprintf(out, fmt, a, b, c, d, e, f); fputc('\n', out); fclose(out); }
}

class EPFramebuffer {
 public:
  enum UpdateFlag { NoFlag = 0 };
  static EPFramebuffer* instance();
  unsigned long swapBuffers(QRect r, EPContentType content, EPScreenMode mode, QFlags<UpdateFlag> flags);
  uchar* pixels = static_cast<uchar*>(calloc(6528, 2160));
  QImage image{pixels, 1620, 2160, 6528, QImage::Format_RGB32};
};
EPFramebuffer* EPFramebuffer::instance() { static EPFramebuffer fb; return &fb; }
unsigned long EPFramebuffer::swapBuffers(QRect r, EPContentType content, EPScreenMode mode, QFlags<UpdateFlag> flags) {
  log("swap %d,%d %dx%d content %d mode %d", r.x(), r.y(), r.width(), r.height(), int(content), int(mode));
  (void)flags;
  return 0;
}

class EPRenderLoop {
 public:
  void blockRendering(const QString&);
  void unblockRendering(const QString&);
};
void EPRenderLoop::blockRendering(const QString&) { log("block"); }
void EPRenderLoop::unblockRendering(const QString&) { log("unblock"); }

// The engine exists once the plugin is loaded, as xochitl's does (framebuffer-spy sees its QImage then).
static int made = (EPFramebuffer::instance(), 0);
