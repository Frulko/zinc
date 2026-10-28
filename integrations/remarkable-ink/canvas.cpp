// zinc-canvas: the ink canvas inside xochitl, a XOVI extension (ZN-839; route 2 of docs/reports/remarkable-fast-ink-landscape.md §6).
// While an AppLoad app holds the Marker down, a QQuickPaintedItem laid over AppLoad's window repaints only the rectangles the app names,
// from the app's own qtfb shared memory, under xochitl's own QML ScreenModeItem in Pen mode (xofm.libs.epaper): xochitl's handwriting
// waveform with xochitl running. At pen-up the item goes back to UI mode and AppLoad's item repaints the stroke's box: the colour settle.
// The same item also brings back the document xochitl had open before a display lease (lease.c): Settings.lastOpen is recorded in
// /run/zinc-canvas/document, and a /run/zinc-lease/reopen left by the lease is opened once at the next start.
// Only exported Qt API and xochitl's QML types and names (the ones rm-hacks-qmd and AppLoad's QMD use): no native engine address, no
// override, no QMD. Every gate fails closed with one journal line ("[zinc-canvas] off: ..."): the model row, the SHA-256 of the
// running xochitl against exthome/zinc-canvas/verified (install.sh records it; a new OS is one line, not a build), the QML type and its
// Pen mode, AppLoad's item fullscreen 1:1 or docked under the header. A xochitl that dies while the canvas is armed refuses it for the rest of the boot.
// Wire protocol: protocol.h (version 2; Welcome.key = zink::Canvas, Welcome.hash = the verified xochitl hash).
#include <QByteArray>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QFile>
#include <QGuiApplication>
#include <QImage>
#include <QPainter>
#include <QPointer>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQmlEngine>
#include <QQmlExpression>
#include <QQuickPaintedItem>
#include <QQuickWindow>
#include <QRegion>
#include <QSocketNotifier>
#include <QTimer>
#include <fcntl.h>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <future>
#include "protocol.h"
#include "../../plugins/display-rmpp/models.h"
#include "xovi.h"

namespace {
constexpr const char* state_dir = "/run/zinc-canvas";
constexpr const char* reopen_file = "/run/zinc-lease/reopen";   // written by lease.c before it stops xochitl
QByteArray trust_file;                                           // exthome/zinc-canvas/verified: "<sha256> <codename>" per line
std::shared_future<QByteArray> xochitl_hash;                     // SHA-256 of /proc/self/exe, hashed off the GUI thread at load
const bool trace = getenv("ZINC_CANVAS_TRACE") != nullptr;       // one line per paint (the fake-xochitl harness)

void note(const char* file, const QByteArray& text, const char* dir = state_dir) {
  mkdir(dir, 0700);
  QFile f(QString::fromLatin1(dir) + '/' + file);
  if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(text + '\n');
}
void say(const QByteArray& m) { fprintf(stderr, "[zinc-canvas] %s\n", m.constData()); note("last", m); }
/** The crash guard's mark: present while the canvas may touch xochitl's scene; a leftover mark at load means xochitl died with it. */
void armed(bool on) {
  if (on) note("armed", QByteArray::number(getpid()));
  else unlink((QByteArray(state_dir) + "/armed").constData());
}
QByteArray osVersion() {
  QFile f("/etc/os-release");
  if (f.open(QIODevice::ReadOnly))
    for (const QByteArray& l : f.readAll().split('\n')) if (l.startsWith("IMG_VERSION=")) return l.mid(12).replace('"', "");
  return "unknown";
}

/** "" when this model and this xochitl are verified, else the reason (asked once, at start). */
QByteArray gate(const rmm::Model*& model) {
  model = rmm::model(rmm::machine());
  if (!model || model->backend != rmm::QTFB) return QByteArray("unknown model '") + rmm::machine() + "'";
  {
    const QByteArray hash = xochitl_hash.get();
    if (hash.size() != 64) return "cannot hash /proc/self/exe";
    QFile f(QString::fromUtf8(trust_file));
    if (f.open(QIODevice::ReadOnly))
      for (const QByteArray& l : f.readAll().split('\n'))
        if (l.startsWith(hash + ' ') && l.mid(65).trimmed() == model->codename) return {};
    return "xochitl " + hash + " (OS " + osVersion() + ") is not verified in " + trust_file +
           "; check this OS, then run install.sh again (docs/targets/remarkable-paper-pro.md)";
  }
}

/** The app's pixels, straight from its qtfb shared memory; transparent everywhere but the current stroke's rectangles. */
class Canvas : public QQuickPaintedItem {
 public:
  QImage image;
  QRegion live;   // in the item's coordinates
  int top = 0;    // the buffer's row at the item's origin: 0 fullscreen, xochitl's header height docked (AppLoad 0005)
  Canvas(QQuickItem* parent, const uchar* pixels, int w, int h)
      : QQuickPaintedItem(parent), image(pixels, w, h, qsizetype(w) * 3, QImage::Format_RGB888) {
    setRenderTarget(QQuickPaintedItem::Image);   // the epaper painter node, as AppLoad's item and PR #61's InkCanvas
    setAntialiasing(false);
    setAcceptedMouseButtons(Qt::NoButton);       // input stays with AppLoad's item underneath
    setZ(1e6);
    setSize(parent->size());
  }
  void paint(QPainter* p) override {
    const QRect clip = p->clipBoundingRect().toAlignedRect();
    if (trace) fprintf(stderr, "[zinc-canvas] paint %d,%d %dx%d\n", clip.x(), clip.y(), clip.width(), clip.height());
    for (const QRect& r : live & clip) p->drawImage(r.topLeft(), image, r.translated(0, top));
  }
};

// xochitl's own type and enum (the names AppLoad's QMD hashes: xofm.libs.epaper / ScreenModeItem / Pen / UI).
const char* const mode_qml = R"(import QtQuick
import xofm.libs.epaper 1.0 as Epaper
Epaper.ScreenModeItem {
  anchors.fill: parent
  property bool inking: false
  readonly property var pen: Epaper.ScreenModeItem.Pen
  readonly property var ui: Epaper.ScreenModeItem.UI
  mode: inking ? pen : ui
})";

class Server : public QObject {
  const rmm::Model* model = nullptr;
  int server = -1, client = -1;
  pid_t peer = 0, refused = 0;
  QSocketNotifier* notifier = nullptr;
  uint32_t seq = 0;
  QPointer<QQuickWindow> window;
  QPointer<QQuickPaintedItem> fb;
  QPointer<Canvas> canvas;
  QPointer<QQuickItem> mode;
  const unsigned char* qtfb = nullptr;
  size_t qtfb_size = 0;
  bool inking = false;
  QRect box;

  /** AppLoad's qtfb item (FBController), visible; else null. */
  static QQuickPaintedItem* findItem(QQuickItem* in) {
    for (QQuickItem* c : in->childItems()) {
      if (c->isVisible() && QByteArray(c->metaObject()->className()).contains("FBController") && c->inherits("QQuickPaintedItem"))
        return static_cast<QQuickPaintedItem*>(c);
      if (QQuickPaintedItem* hit = findItem(c)) return hit;
    }
    return nullptr;
  }
  /** The buffer's row shown at AppLoad's item origin when the window is fullscreen 1:1 (0) or docked under xochitl's header (its height,
   *  the buffer below it pixel for pixel); else -1. */
  int shown() {
    if (!window || !fb || !fb->isVisible()) return -1;
    const QPointF o = fb->mapToScene(QPointF(0, 0));
    const int top = int(o.y());
    if (o.x() != 0 || o.y() != top || top < 0 || top >= model->h || fb->width() != model->w || fb->height() != model->h - top) return -1;
    return fb->rotation() == 0 && window->contentItem()->rotation() == 0 && window->width() == model->w && window->height() == model->h ? top : -1;
  }
  void drop() {
    if (inking && fb) fb->update(box);
    delete canvas;   // its ScreenModeItem goes with it
    if (notifier) { notifier->setEnabled(false); notifier->deleteLater(); notifier = nullptr; }
    if (client >= 0) ::close(client);
    if (qtfb) munmap(const_cast<unsigned char*>(qtfb), qtfb_size);
    client = -1; qtfb = nullptr; seq = 0; inking = false; box = QRect();
    armed(false);
  }
  void fail(const QByteArray& why) {
    if (client < 0) return;
    say("off for pid " + QByteArray::number(peer) + ": " + why);
    refused = peer;
    drop();
  }
  void hello(const zink::Message& m) {
    ucred cred{}; socklen_t len = sizeof cred;
    if (getsockopt(client, SOL_SOCKET, SO_PEERCRED, &cred, &len) || cred.uid != 0 || cred.pid != m.pid || cred.pid == refused) return fail("peer");
    peer = cred.pid;
    for (QWindow* w : QGuiApplication::topLevelWindows())
      if (auto* q = qobject_cast<QQuickWindow*>(w)) if ((fb = findItem(q->contentItem()))) { window = q; break; }
    if (shown() < 0) return fail("the app's window is neither fullscreen 1:1 nor docked");
    QQmlEngine* engine = qmlEngine(fb);
    if (!engine) return fail("AppLoad's item has no QML engine");
    char name[32]; snprintf(name, sizeof name, "/qtfb_%d", m.key);
    int fd = shm_open(name, O_RDONLY, 0);
    struct stat st{};
    qtfb_size = size_t(model->w) * model->h * 3;
    if (fd < 0 || fstat(fd, &st) || size_t(st.st_size) < qtfb_size) { if (fd >= 0) ::close(fd); return fail("qtfb buffer"); }
    void* p = mmap(nullptr, qtfb_size, PROT_READ, MAP_SHARED, fd, 0);
    ::close(fd);
    if (p == MAP_FAILED) return fail("qtfb map");
    qtfb = static_cast<const unsigned char*>(p);
    armed(true);
    canvas = new Canvas(fb, qtfb, model->w, model->h);
    QQmlComponent component(engine);
    component.setData(mode_qml, QUrl());
    QObject* o = component.beginCreate(engine->rootContext());
    mode = qobject_cast<QQuickItem*>(o);
    if (!mode) { delete o; return fail("xochitl's QML has no xofm.libs.epaper ScreenModeItem: " + component.errorString().simplified().toUtf8()); }
    mode->setParent(canvas);
    mode->setParentItem(canvas);
    component.completeCreate();
    const QVariant pen = mode->property("pen"), ui = mode->property("ui");
    if (!pen.isValid() || !ui.isValid() || pen.toInt() == ui.toInt() || mode->property("mode").toInt() != ui.toInt())
      return fail("xochitl's ScreenModeItem has no Pen and UI modes");
    zink::Message w; w.type = zink::Welcome; w.seq = m.seq; w.w = model->w; w.h = model->h; w.key = zink::Canvas;
    memcpy(w.hash, xochitl_hash.get().constData(), 64);
    if (::send(client, &w, sizeof w, MSG_DONTWAIT | MSG_NOSIGNAL) != sizeof w) return fail("welcome");
    say("canvas granted to pid " + QByteArray::number(peer));
  }
  void receive() {
    // Bounded per dispatch so xochitl's own events stay live.
    for (int count = 0; count < 32 && client >= 0; ++count) {
      zink::Message m;
      ssize_t n = recv(client, &m, sizeof m, MSG_DONTWAIT);
      if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return;
      if (n == 0) return fail("client gone");
      if (n != sizeof m || m.magic != zink::magic || m.version != zink::version || m.seq <= seq) return fail("protocol");
      seq = m.seq;
      if (!canvas) { if (m.type == zink::Hello) hello(m); else fail("not granted"); continue; }
      switch (m.type) {
        case zink::StrokeBegin:
          if (inking || (canvas->top = shown()) < 0) return fail("stroke begin");
          canvas->setSize(fb->size());   // the window may have docked since the hello
          inking = true; box = QRect();
          mode->setProperty("inking", true);
          break;
        case zink::Ink: {
          if (!inking || !zink::inside(m, model->w, model->h)) return fail("ink");
          const QRect r = QRect(m.x, m.y - canvas->top, m.w, m.h) & QRect(QPoint(), fb->size().toSize());
          canvas->live += r; box |= r;
          canvas->update(r);   // only this rectangle, in Pen mode
          break;
        }
        case zink::StrokeEnd: {
          if (!inking) return fail("stroke end");
          inking = false;
          mode->setProperty("inking", false);
          const QRect settle = zink::inside(m, model->w, model->h) ? box | (QRect(m.x, m.y - canvas->top, m.w, m.h) & QRect(QPoint(), fb->size().toSize())) : box;
          canvas->live = QRegion();
          canvas->update(settle);   // transparent again
          fb->update(settle);       // AppLoad's item repaints the box in its UI mode: the colour settle
          box = QRect();
          break;
        }
        case zink::Bye: drop(); return;
        default: return fail("message");
      }
    }
  }

 public:
  explicit Server(const rmm::Model* m) : QObject(qApp), model(m) {
    server = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    sockaddr_un a{}; a.sun_family = AF_UNIX; strcpy(a.sun_path, zink::socket_path);
    unlink(a.sun_path);   // a stale socket of a previous xochitl; install.sh refuses the lane and the canvas together
    if (server < 0 || bind(server, reinterpret_cast<sockaddr*>(&a), sizeof a) || listen(server, 1)) { say("off: socket"); return; }
    chmod(a.sun_path, 0600);
    auto acceptor = new QSocketNotifier(server, QSocketNotifier::Read, this);
    connect(acceptor, &QSocketNotifier::activated, this, [this] {
      int fd = accept4(server, nullptr, nullptr, SOCK_NONBLOCK | SOCK_CLOEXEC);
      if (fd < 0) return;
      if (client >= 0) { ::close(fd); return; }
      client = fd;
      notifier = new QSocketNotifier(client, QSocketNotifier::Read, this);
      connect(notifier, &QSocketNotifier::activated, this, [this] { receive(); });
    });
  }
  ~Server() override { fail("xochitl is quitting"); if (server >= 0) { ::close(server); unlink(zink::socket_path); } }
};

/** The QML context where xochitl's navigator, Library and Settings resolve (the file rm-hacks-qmd patches), or null. */
QQmlContext* xochitlContext() {
  QList<QQuickItem*> todo;
  for (QWindow* w : QGuiApplication::topLevelWindows()) if (auto* q = qobject_cast<QQuickWindow*>(w)) todo << q->contentItem();
  QSet<QQmlContext*> seen;
  while (!todo.isEmpty()) {
    QQuickItem* i = todo.takeLast();
    todo << i->childItems();
    QQmlContext* c = qmlContext(i);
    if (!c || seen.contains(c)) continue;
    seen.insert(c);
    QQmlExpression e(c, nullptr, "typeof navigator !== 'undefined' && typeof Library !== 'undefined' && typeof Settings !== 'undefined'");
    if (e.evaluate().toBool()) return c;
  }
  return nullptr;
}

/** Records Settings.lastOpen for the lease, and opens the document a lease left in reopen_file (once). Polls until the UI is up. */
void documents() {
  QByteArray id;
  QFile r(reopen_file);
  if (r.open(QIODevice::ReadOnly)) { id = r.readAll().trimmed(); r.close(); unlink(reopen_file); }
  auto tries = std::make_shared<int>(0);
  auto timer = new QTimer(qApp);
  QObject::connect(timer, &QTimer::timeout, [timer, tries, id] {
    QQmlContext* c = xochitlContext();
    if (!c) {
      if (++*tries < 30) return;
      timer->deleteLater();
      say("reopen off: no QML context with navigator, Library and Settings (xochitl's QML changed)");
      if (!id.isEmpty()) note("reopened", "no: xochitl's QML changed", "/run/zinc-lease");
      return;
    }
    timer->deleteLater();
    auto* last = new QQmlExpression(c, nullptr, "Settings.lastOpen", qApp);
    last->setNotifyOnValueChanged(true);
    auto record = [last] {
      const QVariant v = last->evaluate();
      if (!last->hasError() && v.isValid()) note("document", v.toString().toUtf8());
    };
    QObject::connect(last, &QQmlExpression::valueChanged, record);
    record();
    if (id.isEmpty()) return;
    bool uuid = id.size() == 36;
    for (char ch : id) uuid = uuid && (ch == '-' || (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'));
    if (!uuid) { say("reopen: not a document id: " + id.left(64)); note("reopened", "no: not a document id", "/run/zinc-lease"); return; }
    // rm-hacks-qmd's openLastDocument: Library.entryForId(id), then navigator.requestOpenDocument(entry). The library may still be loading.
    auto open = new QQmlExpression(c, nullptr, QString::fromUtf8("(function (id) { var e = Library.entryForId(id); if (!e) return 'no entry'; navigator.requestOpenDocument(e); return 'ok'; })('" + id + "')"), qApp);
    auto again = std::make_shared<int>(0);
    auto t = new QTimer(qApp);
    QObject::connect(t, &QTimer::timeout, [t, open, again, id] {
      const QString out = open->evaluate().toString();
      if (open->hasError() || out == "ok" || ++*again >= 20) {
        t->deleteLater();
        const QByteArray why = open->hasError() ? open->error().toString().toUtf8() : out.toUtf8();
        say("reopen " + id + ": " + why);
        note("reopened", (out == "ok" && !open->hasError() ? "yes " : "no: ") + why, "/run/zinc-lease");
      }
    });
    t->start(1000);
  });
  timer->start(1000);
}

/** On the GUI thread once the application exists: the gate, then the canvas server and the documents. */
void start() {
  auto timer = new QTimer(qApp);
  QObject::connect(timer, &QTimer::timeout, [timer] {
    if (xochitl_hash.wait_for(std::chrono::seconds(0)) != std::future_status::ready) return;
    timer->deleteLater();
    const rmm::Model* model = nullptr;
    const QByteArray why = gate(model);
    if (!why.isEmpty()) {
      say("off: " + why);
      if (unlink(reopen_file) == 0) note("reopened", "no: zinc-canvas is off: " + why, "/run/zinc-lease");
      armed(false);
      return;
    }
    new Server(model);
    documents();
    say(QByteArray("ready on ") + zink::socket_path + " (" + model->name + ", OS " + osVersion() + ")");
    QTimer::singleShot(60000, qApp, [] { armed(false); });   // 60 s healthy: the start-up is not what crashes (a client re-arms)
  });
  timer->start(200);
}
}  // namespace

// The crash guard, before anything else: a mark left by a xochitl that died while the canvas was armed refuses it for this boot.
extern "C" char _xovi_shouldLoad() {
  if (access((QByteArray(state_dir) + "/armed").constData(), F_OK) == 0) {
    fprintf(stderr, "[zinc-canvas] refused: xochitl died while the canvas was armed; reboot to try again\n");
    note("last", "refused: xochitl died while the canvas was armed; reboot to try again");
    return 0;
  }
  armed(true);
  atexit([] { armed(false); });   // a clean exit is not a crash (lease.c also clears the mark after its own clean stop)
  return 1;
}

extern "C" void _xovi_construct() {
  trust_file = QByteArray(Environment->getExtensionDirectory("zinc-canvas")) + "verified";
  xochitl_hash = std::async(std::launch::async, [] {
    QFile f("/proc/self/exe");
    QCryptographicHash h(QCryptographicHash::Sha256);
    return f.open(QIODevice::ReadOnly) && h.addData(&f) ? h.result().toHex() : QByteArray();
  }).share();
  qAddPreRoutine([] { QMetaObject::invokeMethod(qApp, start, Qt::QueuedConnection); });   // runs at once if the app already exists
}
