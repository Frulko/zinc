// zinc-ink v2: the ink lane, a XOVI extension inside xochitl (docs/reports/remarkable-bridge-design.md §4.3, §7.1).
// One engine, xochitl's own. While the Marker is down the lane blocks xochitl's rendering, copies each rectangle the app
// names from the app's qtfb shared memory into the vendor buffer and calls the Pen/Mono partial swap; at pen-up it unblocks
// and repaints the stroke's box through AppLoad's item, which is the colour settle. Nothing to restore, nothing restarted.
// Safety (§7.1): no load-time condition or override on libqsgepaper (the one override is on Qt6Quick, always loaded);
// vendor symbols are resolved with dlsym at run time, after the first frame; every gate fails closed and silently for the
// apps (they stay on qtfb); a xochitl that dies while the lane is armed makes the lane refuse to load for the rest of the
// boot; install.sh refuses an extensions.d where another extension hooks the same symbol.
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QElapsedTimer>
#include <QEvent>
#include <QFile>
#include <QFileInfo>
#include <QKeyEvent>
#include <QPointer>
#include <QQuickPaintedItem>
#include <QQuickWindow>
#include <QSocketNotifier>
#include <QTimer>
#include <dlfcn.h>
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
#include "protocol.h"
#include "../../plugins/display-rmpp/models.h"
#include "build/xovi.h"

struct FramebufferConfig { void* framebufferAddress; int width, height, type, bpl; bool requiresReload; };  // framebuffer-spy.h

namespace {
constexpr const char* state_dir = "/run/zinc-ink";
const QString reason = QStringLiteral("zinc-ink");
using Instance = void* (*)();
using Block = void (*)(void*, const QString&);
using Swap327 = unsigned long (*)(void*, QRect, int content, int mode, int flags);
using Swap328 = unsigned long (*)(void*, QRect, int mode, int flags);

void note(const char* file, const QByteArray& text) {
  mkdir(state_dir, 0700);
  QFile f(QString::fromLatin1(state_dir) + '/' + file);
  if (f.open(QIODevice::WriteOnly | QIODevice::Truncate)) f.write(text + '\n');
}
/** The crash guard's mark: present while the lane may touch the engine (start-up, a client); a leftover mark at load = a crash. */
void armed(bool on) {
  QByteArray path = QByteArray(state_dir) + "/armed";
  if (on) note("armed", QByteArray::number(getpid()));
  else unlink(path.constData());
}

/** SHA-256 of the vendor library, once per boot: cached in /run with the file's size and mtime. */
QByteArray vendorHash(const QString& path) {
  QFileInfo info(path);
  QByteArray key = QByteArray::number(info.size()) + ' ' + QByteArray::number(info.lastModified().toSecsSinceEpoch());
  QFile cache(QString::fromLatin1(state_dir) + "/hash");
  if (cache.open(QIODevice::ReadOnly)) {
    QList<QByteArray> parts = cache.readAll().trimmed().split(' ');
    if (parts.size() == 3 && parts[0] + ' ' + parts[1] == key) return parts[2];
  }
  QFile f(path);
  if (!f.open(QIODevice::ReadOnly)) return {};
  QCryptographicHash h(QCryptographicHash::Sha256);
  h.addData(&f);
  QByteArray hex = h.result().toHex();
  note("hash", key + ' ' + hex);
  return hex;
}

class Lane : public QObject {
  const rmm::Model& model;
  const rmm::Vendor& vendor;
  QByteArray hash;
  void *fb, *loop, *swap;
  Block block, unblock;
  unsigned char* pixels;
  int bpl;
  QPointer<QQuickWindow> window;
  int server = -1, client = -1;
  pid_t peer = 0, refused = 0;  // refused: the pid whose session failed (the lane stays off for it)
  QSocketNotifier* notifier = nullptr;
  const unsigned char* qtfb = nullptr;
  size_t qtfb_size = 0;
  QPointer<QQuickPaintedItem> item;
  bool granted = false, blocked = false;
  uint32_t seq = 0;
  QRect box;
  QElapsedTimer since_ink, since_begin;
  QTimer deadline;

  /** AppLoad's qtfb item for this app, fullscreen, unrotated and unscaled (1:1 with the panel); else null. */
  QQuickPaintedItem* findItem(QQuickItem* in) {
    for (QQuickItem* c : in->childItems()) {
      if (c->isVisible() && QByteArray(c->metaObject()->className()).contains("FBController") && c->inherits("QQuickPaintedItem")) return static_cast<QQuickPaintedItem*>(c);
      if (QQuickPaintedItem* hit = findItem(c)) return hit;
    }
    return nullptr;
  }
  bool oneToOne() {
    if (!window || !item || !item->isVisible()) return false;
    QPointF origin = item->mapToScene(QPointF(0, 0));
    return item->width() == model.w && item->height() == model.h && origin == QPointF(0, 0) && item->rotation() == 0 &&
           window->contentItem()->rotation() == 0 && window->width() == model.w && window->height() == model.h;
  }
  void doSwap(const QRect& r) {
    if (vendor.abi == 328) reinterpret_cast<Swap328>(swap)(fb, r, vendor.pen_mode, 0);
    else reinterpret_cast<Swap327>(swap)(fb, r, 0, vendor.pen_mode, 0);
  }
  void drop() {
    if (notifier) { notifier->setEnabled(false); notifier->deleteLater(); notifier = nullptr; }
    if (client >= 0) ::close(client);
    if (qtfb) munmap(const_cast<unsigned char*>(qtfb), qtfb_size);
    client = -1; qtfb = nullptr; granted = false; seq = 0; box = QRect();
    deadline.stop();
    armed(false);
  }
  /** Any error: give rendering back, repaint the whole item, refuse this client for the rest of its session. */
  void fail(const char* why) {
    if (client < 0) return;
    if (blocked) { unblock(loop, reason); blocked = false; }
    if (item) item->update();
    fprintf(stderr, "[zinc-ink] lane off for pid %d: %s\n", int(peer), why);
    note("last", QByteArray("off: ") + why);
    refused = peer;
    drop();
  }
  void end() {
    if (blocked) { unblock(loop, reason); blocked = false; if (item) item->update(box); }
    drop();
  }
  void hello(const zink::Message& m) {
    ucred cred{}; socklen_t len = sizeof cred;
    if (getsockopt(client, SOL_SOCKET, SO_PEERCRED, &cred, &len) || cred.uid != 0 || cred.pid != m.pid || cred.pid == refused) { fail("peer"); return; }
    peer = cred.pid;
    QQuickItem* root = window ? window->contentItem() : nullptr;
    item = root ? findItem(root) : nullptr;
    if (!oneToOne()) { fail("the app's window is not fullscreen 1:1"); return; }
    char name[32]; snprintf(name, sizeof name, "/qtfb_%d", m.key);
    int fd = shm_open(name, O_RDONLY, 0);
    struct stat st{};
    qtfb_size = size_t(model.w) * model.h * 3;
    if (fd < 0 || fstat(fd, &st) || size_t(st.st_size) < qtfb_size) { if (fd >= 0) ::close(fd); fail("qtfb buffer"); return; }
    void* p = mmap(nullptr, qtfb_size, PROT_READ, MAP_SHARED, fd, 0);
    ::close(fd);
    if (p == MAP_FAILED) { fail("qtfb map"); return; }
    qtfb = static_cast<const unsigned char*>(p);
    zink::Message w; w.type = zink::Welcome; w.seq = m.seq; w.w = model.w; w.h = model.h;
    memcpy(w.hash, hash.constData(), 64);
    if (::send(client, &w, sizeof w, MSG_DONTWAIT | MSG_NOSIGNAL) != sizeof w) { fail("welcome"); return; }
    granted = true;
    armed(true);
    fprintf(stderr, "[zinc-ink] lane granted to pid %d\n", int(peer));
  }
  void ink(const zink::Message& m) {
    const QRect r(m.x, m.y, m.w, m.h);
    for (int y = r.top(); y <= r.bottom(); ++y) {
      const unsigned char* s = qtfb + (size_t(y) * model.w + r.left()) * 3;
      uint32_t* d = reinterpret_cast<uint32_t*>(pixels + size_t(y) * bpl) + r.left();
      for (int x = 0; x < r.width(); ++x, s += 3) d[x] = 0xff000000u | uint32_t(s[0]) << 16 | uint32_t(s[1]) << 8 | s[2];
    }
    doSwap(r);
    box |= r;
    since_ink.restart();
  }
  void receive() {
    // Bounded per dispatch so xochitl's own events stay live.
    for (int count = 0; count < 32 && client >= 0; ++count) {
      zink::Message m;
      ssize_t n = recv(client, &m, sizeof m, MSG_DONTWAIT);
      if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK || errno == EINTR)) return;
      if (n == 0) { fail("client gone"); return; }
      if (n != sizeof m || m.magic != zink::magic || m.version != zink::version || m.seq <= seq) { fail("protocol"); return; }
      seq = m.seq;
      if (!granted) { if (m.type == zink::Hello) hello(m); else fail("not granted"); continue; }
      switch (m.type) {
        case zink::StrokeBegin:
          if (blocked || !oneToOne()) { fail("stroke begin"); return; }
          block(loop, reason); blocked = true; box = QRect();
          since_begin.restart(); since_ink.restart(); deadline.start(50);
          break;
        case zink::Ink:
          if (!blocked || !zink::inside(m, model.w, model.h) || !oneToOne()) { fail("ink"); return; }
          ink(m);
          break;
        case zink::StrokeEnd:
          if (!blocked) { fail("stroke end"); return; }
          unblock(loop, reason); blocked = false; deadline.stop();
          if (item) item->update(zink::inside(m, model.w, model.h) ? box | QRect(m.x, m.y, m.w, m.h) : box);  // the settle
          box = QRect();
          break;
        case zink::Bye: end(); return;
        default: fail("message"); return;
      }
    }
  }
  bool eventFilter(QObject*, QEvent* e) override {
    if (client >= 0 && e->type() == QEvent::KeyPress && static_cast<QKeyEvent*>(e)->key() == Qt::Key_PowerOff) fail("power key");
    return false;
  }

 public:
  Lane(QQuickWindow* w, const rmm::Model& m, const rmm::Vendor& v, QByteArray h, void* fb, void* loop, void* swap, Block b, Block u,
       unsigned char* px, int bpl)
      : QObject(w), model(m), vendor(v), hash(std::move(h)), fb(fb), loop(loop), swap(swap), block(b), unblock(u), pixels(px), bpl(bpl), window(w) {
    server = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    sockaddr_un a{}; a.sun_family = AF_UNIX; strcpy(a.sun_path, zink::socket_path);
    unlink(a.sun_path);  // a stale socket of a previous xochitl; one xochitl, one lane
    if (server < 0 || bind(server, reinterpret_cast<sockaddr*>(&a), sizeof a) || listen(server, 1)) { note("last", "off: socket"); return; }
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
    connect(&deadline, &QTimer::timeout, this, [this] {
      if (blocked && (since_ink.elapsed() > zink::stroke_idle_ms || since_begin.elapsed() > zink::stroke_max_ms)) fail("stroke deadline");
    });
    qApp->installEventFilter(this);
    QTimer::singleShot(60000, this, [this] { if (client < 0) armed(false); });  // 60 s healthy: the start-up is not what crashes
    fprintf(stderr, "[zinc-ink] lane ready on %s (%s, OS %s)\n", zink::socket_path, model.name, vendor.os);
    note("last", "ready");
  }
  ~Lane() override { fail("xochitl window destroyed"); if (server >= 0) { ::close(server); unlink(zink::socket_path); } }
};

bool started = false;

/** After the first frame, on the GUI thread: every gate, then the lane. Any miss: the lane stays off for this boot. */
void setup(QQuickWindow* window) {
  auto off = [](const char* why) { fprintf(stderr, "[zinc-ink] lane off: %s\n", why); note("last", QByteArray("off: ") + why); armed(false); };
  const rmm::Model* model = rmm::model(rmm::machine());
  if (!model) return off("unknown model");
  FramebufferConfig spy = framebuffer_spy$getFramebufferConfig();
  if (!spy.framebufferAddress || spy.width != model->vendor_w || spy.height != model->vendor_h || spy.bpl != model->vendor_bpl)
    return off("framebuffer-spy geometry differs from the model row");
  const char* library = "/usr/lib/plugins/scenegraph/libqsgepaper.so";
  QByteArray hash = vendorHash(QString::fromLatin1(library));
  const rmm::Vendor* vendor = rmm::vendor(hash.constData(), model->codename);
  if (hash.size() != 64 || !vendor) return off("vendor library not verified for this OS");
  // Qt loads the scene-graph plugin RTLD_LOCAL: its symbols come from its own handle (NOLOAD: never load it ourselves).
  void* engine = dlopen(library, RTLD_NOW | RTLD_NOLOAD);
  if (!engine) return off("libqsgepaper is not loaded");
  auto fbInstance = reinterpret_cast<Instance>(dlsym(engine, "_ZN13EPFramebuffer8instanceEv"));
  auto loopInstance = reinterpret_cast<Instance>(dlsym(RTLD_DEFAULT, "_ZN13QSGRenderLoop8instanceEv"));
  auto block = reinterpret_cast<Block>(dlsym(engine, "_ZN12EPRenderLoop14blockRenderingERK7QString"));
  auto unblock = reinterpret_cast<Block>(dlsym(engine, "_ZN12EPRenderLoop16unblockRenderingERK7QString"));
  void* swap = dlsym(engine, vendor->swap);
  if (!fbInstance || !loopInstance || !block || !unblock || !swap) return off("vendor symbols missing");
  void* fb = fbInstance();
  void* loop = loopInstance();
  if (!fb || !loop) return off("no engine instance");
  new Lane(window, *model, *vendor, hash, fb, loop, swap, block, unblock, static_cast<unsigned char*>(spy.framebufferAddress), spy.bpl);
}
}  // namespace

// The crash guard, before anything else: a mark left by a xochitl that died while the lane was armed refuses the lane for this boot.
extern "C" char _xovi_shouldLoad() {
  QByteArray mark = QByteArray(state_dir) + "/armed";
  if (access(mark.constData(), F_OK) == 0) { note("last", "refused: xochitl died while the lane was armed; reboot to try again"); return 0; }
  armed(true);
  atexit([] { armed(false); });  // a clean exit (systemctl stop) is not a crash
  return 1;
}

// The first expose of xochitl's window arms the lane's start one second later, on the GUI thread (Qt6Quick, not libqsgepaper).
extern "C" void override$_ZN12QQuickWindow11exposeEventEP12QExposeEvent(QQuickWindow* self, QExposeEvent* e) {
  using Fn = void (*)(QQuickWindow*, QExposeEvent*);
  reinterpret_cast<Fn>(reinterpret_cast<void*>($_ZN12QQuickWindow11exposeEventEP12QExposeEvent))(self, e);
  if (started) return;
  started = true;
  QPointer<QQuickWindow> w(self);
  QTimer::singleShot(1000, qApp, [w] { if (w) setup(w); });
}
