// A tiny xochitl: a 1620x2160 QML window holding AppLoad's qtfb item (FBController) with its ScreenModeItem from a fake
// xofm.libs.epaper module, the qtfb shared memory /qtfb_7, the names zinc-canvas uses for documents (navigator, Library.entryForId,
// navigator.requestOpenDocument, Settings.lastOpen, as rm-hacks-qmd reads them), and the scene-graph engine loaded LATE with
// dlopen(RTLD_LOCAL), as Qt loads libqsgepaper (the reason the v1 bridge never loaded: remarkable-bridge-design.md §4.2).
// $FAKE_LOG gets "update x,y wxh" per repaint of AppLoad's item and "mode <name> <objectName>" per ScreenModeItem mode change.
// $FAKE_LAST_OPEN is the document Settings.lastOpen starts with; Library knows the ids of $FAKE_DOCUMENTS (space separated).
#include <QGuiApplication>
#include <QMetaEnum>
#include <QPainter>
#include <QQmlApplicationEngine>
#include <QQuickPaintedItem>
#include <QTimer>
#include <dlfcn.h>
#include <fcntl.h>
#include <sys/mman.h>
#include <unistd.h>
#include <cstdio>
#include <cstdlib>

static void log(const QByteArray& line) {
  if (FILE* out = fopen(getenv("FAKE_LOG") ? getenv("FAKE_LOG") : "/tmp/fake.log", "a")) { fprintf(out, "%s\n", line.constData()); fclose(out); }
}

class FBController : public QQuickPaintedItem {
  Q_OBJECT
 public:
  using QQuickPaintedItem::QQuickPaintedItem;
  void paint(QPainter* p) override {
    QRect r = p->clipBoundingRect().toAlignedRect();
    log(QStringLiteral("update %1,%2 %3x%4").arg(r.x()).arg(r.y()).arg(r.width()).arg(r.height()).toUtf8());
  }
};

class ScreenModeItem : public QQuickItem {
  Q_OBJECT
  Q_PROPERTY(Mode mode READ mode WRITE setMode NOTIFY modeChanged)
 public:
  enum Mode { Pen, Mono, Animation, Content, UI };
  Q_ENUM(Mode)
  Mode mode() const { return m; }
  void setMode(Mode v) {
    if (v == m) return;
    m = v;
    log(QByteArray("mode ") + QMetaEnum::fromType<Mode>().valueToKey(v) + ' ' + objectName().toUtf8());
    emit modeChanged();
  }
 signals:
  void modeChanged();
 private:
  Mode m = UI;
};

class Settings : public QObject {
  Q_OBJECT
  Q_PROPERTY(QString lastOpen MEMBER lastOpen NOTIFY lastOpenChanged)
 public:
  QString lastOpen = QString::fromUtf8(getenv("FAKE_LAST_OPEN"));
 signals:
  void lastOpenChanged();
};

class Library : public QObject {
  Q_OBJECT
 public:
  Q_INVOKABLE QVariant entryForId(const QString& id) {
    if (!QString::fromUtf8(getenv("FAKE_DOCUMENTS")).split(' ').contains(id)) return {};
    return QVariantMap{{"id", id}};
  }
};

int main(int argc, char** argv) {
  QGuiApplication app(argc, argv);
  int fd = shm_open("/qtfb_7", O_RDWR | O_CREAT, 0600);
  if (fd < 0 || ftruncate(fd, 1620 * 2160 * 3)) return 1;
  qmlRegisterType<FBController>("net.asivery.Framebuffer", 1, 0, "FBController");
  qmlRegisterType<ScreenModeItem>("xofm.libs.epaper", 1, 0, "ScreenModeItem");
  static Settings settings;
  static Library library;
  qmlRegisterSingletonInstance("com.remarkable", 1, 0, "Settings", &settings);
  qmlRegisterSingletonInstance("com.remarkable", 1, 0, "Library", &library);
  QQmlApplicationEngine engine;
  engine.loadData(R"(import QtQuick
import QtQuick.Window
import net.asivery.Framebuffer 1.0
import xofm.libs.epaper 1.0 as Epaper
import com.remarkable 1.0
Window {
  width: 1620; height: 2160; visible: true
  Item {
    id: navigator
    function requestOpenDocument(entry) { console.log("fake: open " + entry.id); Settings.lastOpen = entry.id }
  }
  FBController {
    width: 1620; height: 2160
    Epaper.ScreenModeItem { objectName: "appload-window"; anchors.fill: parent; mode: Epaper.ScreenModeItem.UI }
  }
})");
  if (engine.rootObjects().isEmpty()) return 1;
  QTimer::singleShot(200, [] {
    if (!dlopen("/usr/lib/plugins/scenegraph/libqsgepaper.so", RTLD_NOW | RTLD_LOCAL)) { fprintf(stderr, "fake: %s\n", dlerror()); exit(1); }
  });
  if (const char* q = getenv("FAKE_QUIT_MS")) QTimer::singleShot(atoi(q), &app, &QGuiApplication::quit);
  return app.exec();
}
#include "fake_xochitl.moc"
