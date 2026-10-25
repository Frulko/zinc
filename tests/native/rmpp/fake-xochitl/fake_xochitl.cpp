// A tiny xochitl: a 1620x2160 Qt Quick window holding an item named FBController (as AppLoad's qtfb item), the qtfb shared
// memory /qtfb_7, and the scene-graph engine loaded LATE with dlopen(RTLD_LOCAL), as Qt loads libqsgepaper (the reason the v1
// bridge never loaded: remarkable-bridge-design.md §4.2). Repaints of the item are logged to $FAKE_LOG ("update x,y wxh").
#include <QGuiApplication>
#include <QPainter>
#include <QQuickPaintedItem>
#include <QQuickWindow>
#include <QTimer>
#include <dlfcn.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>

class FBController : public QQuickPaintedItem {
  Q_OBJECT
 public:
  using QQuickPaintedItem::QQuickPaintedItem;
  void paint(QPainter* p) override {
    QRect r = p->clipBoundingRect().toAlignedRect();
    if (FILE* out = fopen(getenv("FAKE_LOG") ? getenv("FAKE_LOG") : "/tmp/fake.log", "a")) {
      fprintf(out, "update %d,%d %dx%d\n", r.x(), r.y(), r.width(), r.height());
      fclose(out);
    }
  }
};

int main(int argc, char** argv) {
  QGuiApplication app(argc, argv);
  int fd = shm_open("/qtfb_7", O_RDWR | O_CREAT, 0600);
  if (fd < 0 || ftruncate(fd, 1620 * 2160 * 3)) return 1;
  QQuickWindow window;
  window.resize(1620, 2160);
  FBController item(window.contentItem());
  item.setSize(QSizeF(1620, 2160));
  window.show();
  QTimer::singleShot(200, [] {
    if (!dlopen("/usr/lib/plugins/scenegraph/libqsgepaper.so", RTLD_NOW | RTLD_LOCAL)) { fprintf(stderr, "fake: %s\n", dlerror()); exit(1); }
  });
  if (const char* q = getenv("FAKE_QUIT_MS")) QTimer::singleShot(atoi(q), &app, &QGuiApplication::quit);
  return app.exec();
}
#include "fake_xochitl.moc"
