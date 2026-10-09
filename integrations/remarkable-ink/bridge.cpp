// One vendor engine, owned by xochitl. The client never maps this process's framebuffer.
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QElapsedTimer>
#include <QEvent>
#include <QFile>
#include <QImage>
#include <QKeyEvent>
#include <QPointer>
#include <QQuickWindow>
#include <QRegion>
#include <QSocketNotifier>
#include <QThread>
#include <QTimer>
#include <dlfcn.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/un.h>
#include <unistd.h>
#include <atomic>
#include <cstdio>
#include <cstring>
#include "protocol.h"
#include "build/xovi.h"

namespace {
using Swap = unsigned long (*)(void*, QRect, int, int, int);
using Block = void (*)(void*, const QString&);
unsigned char* pixels = nullptr;
void* framebuffer = nullptr;
void* renderLoop = nullptr;
QThread* renderThread = nullptr;
constexpr int stride = 6528;
std::atomic<unsigned> foreignSwaps{0};
std::atomic<bool> leased{false};
thread_local bool ownSwap = false;
Block block = nullptr, unblock = nullptr;
Swap vendorSwap = nullptr;
class Bridge;
Bridge* bridge = nullptr;
const QString reason = QStringLiteral("zinc-ink-session");

class Bridge : public QObject {
  int server = -1, client = -1;
  QSocketNotifier* peer = nullptr;
  QPointer<QQuickWindow> window;
  QByteArray backup, staging, packet;
  QTimer timer;
  QElapsedTimer activity, cooldown;
  bool active = false, probe = false, wrote = false;
  uint32_t seq = 0;
  unsigned foreignAtStart = 0;
  void wake(bool on) {
    QFile f(on ? "/sys/power/wake_lock" : "/sys/power/wake_unlock");
    if (f.open(QIODevice::WriteOnly)) f.write("zinc-ink");
  }
  void reply(const zink::Message& request) {
    zink::Message m; m.type = zink::Ack; m.seq = request.seq;
    if (::send(client, &m, sizeof m, MSG_DONTWAIT | MSG_NOSIGNAL) != sizeof m) finish("reply failed");
  }
  void finish(const char* why) {
    if (client < 0) return;
    if (peer) { peer->setEnabled(false); peer->deleteLater(); peer = nullptr; }
    ::close(client); client = -1;
    leased = false;
    if (active) {
      if (wrote && backup.size() == stride * zink::height) {
        memcpy(pixels, backup.constData(), size_t(backup.size()));
        ownSwap = true;
        vendorSwap(framebuffer, QRect(0, 0, zink::width, zink::height), 1, 4, 0);
        ownSwap = false;
      }
      unblock(renderLoop, reason);
      active = false;
      cooldown.restart();
      if (window) window->update();
      wake(false);
    }
    backup.clear(); staging.clear();
    fprintf(stderr, "[zinc-ink] released: %s; foreign swaps=%u\n", why, foreignSwaps.load() - foreignAtStart);
  }
  bool eventFilter(QObject*, QEvent* event) override {
    if (!active && (!cooldown.isValid() || cooldown.elapsed() > 300)) return false;
    switch (event->type()) {
      case QEvent::TouchBegin: case QEvent::TouchUpdate: case QEvent::TouchEnd:
      case QEvent::TabletPress: case QEvent::TabletMove: case QEvent::TabletRelease:
      case QEvent::MouseButtonPress: case QEvent::MouseMove: case QEvent::MouseButtonRelease:
        return true;
      case QEvent::KeyPress:
        if (static_cast<QKeyEvent*>(event)->key() == Qt::Key_PowerOff) finish("power button");
        return false;
      default: return false;
    }
  }
  void receive() {
    // Bound each dispatch so heartbeat timers and native event processing remain live.
    for (int count = 0; count < 32 && client >= 0; ++count) {
      ssize_t n = recv(client, packet.data(), size_t(packet.size()), MSG_DONTWAIT | MSG_TRUNC);
      if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
      if (n < (ssize_t)sizeof(zink::Message) || n > packet.size()) { finish("disconnect/packet size"); return; }
      zink::Message m; memcpy(&m, packet.constData(), sizeof m);
      if (m.magic != zink::magic || m.version != zink::version || m.seq <= seq) { finish("protocol"); return; }
      seq = m.seq;
      if (!active) {
        if ((m.type != zink::Hello && m.type != zink::Probe) || n != sizeof m || !pixels || !framebuffer) {
          finish("not ready"); return;
        }
        // Diagnostic-only until the short blocker probe has been validated on this firmware.
        if (m.type == zink::Hello && !QFile::exists("/home/root/xovi/exthome/zinc-ink/drawing-enabled")) {
          finish("drawing not enabled"); return;
        }
        block(renderLoop, reason);
        active = true; probe = m.type == zink::Probe; wrote = false;
        foreignAtStart = foreignSwaps.load(); leased = true;
        backup = QByteArray(reinterpret_cast<const char*>(pixels), stride * zink::height);
        staging = backup;
        activity.restart(); wake(true);
        fprintf(stderr, "[zinc-ink] acquired %s pid=%d\n", probe ? "probe" : "drawing", int(getpid()));
        reply(m); continue;
      }
      if (foreignSwaps.load() != foreignAtStart) { finish("unexpected native writer"); return; }
      if (activity.elapsed() > (probe ? 1500 : 3000)) { finish("expired"); return; }
      if (m.type == zink::Bye) { finish("client exit"); return; }
      if (m.type == zink::Ping && n == sizeof m) {
        if (!probe) activity.restart();
        reply(m); continue;
      }
      if (probe || !zink::rectangle(m)) { finish("invalid draw"); return; }
      if (m.type == zink::Pixels && m.h <= zink::rows && n == ssize_t(sizeof m + m.w * m.h * 4)) {
        for (int row = 0; row < m.h; ++row)
          memcpy(staging.data() + (m.y + row) * stride + m.x * 4,
                 packet.constData() + sizeof m + row * m.w * 4, size_t(m.w * 4));
      } else if (m.type == zink::Present && n == sizeof m && (m.mode == 0 || m.mode == 4)) {
        for (int row = m.y; row < m.y + m.h; ++row)
          memcpy(pixels + row * stride + m.x * 4, staging.constData() + row * stride + m.x * 4, size_t(m.w * 4));
        ownSwap = true;
        vendorSwap(framebuffer, QRect(m.x, m.y, m.w, m.h), m.mode == 0 ? 0 : 1, m.mode, 0);
        ownSwap = false;
        wrote = true; activity.restart(); reply(m);
      } else { finish("invalid payload"); return; }
    }
  }
public:
  explicit Bridge(QQuickWindow* w) : QObject(w), window(w) {
    packet.resize(int(sizeof(zink::Message)) + zink::width * zink::rows * 4);
    server = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0);
    sockaddr_un a{}; a.sun_family = AF_UNIX; strcpy(a.sun_path, zink::socket_path);
    // xochitl restart can leave a stale socket, but never replace a live listener.
    int check = socket(AF_UNIX, SOCK_SEQPACKET | SOCK_CLOEXEC, 0);
    bool live = ::connect(check, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0; close(check);
    if (live) { close(server); server = -1; return; }
    unlink(a.sun_path);
    if (server < 0 || bind(server, reinterpret_cast<sockaddr*>(&a), sizeof a) || listen(server, 1)) return;
    chmod(a.sun_path, 0600);
    auto acceptor = new QSocketNotifier(server, QSocketNotifier::Read, this);
    connect(acceptor, &QSocketNotifier::activated, this, [this] {
      int fd = accept4(server, nullptr, nullptr, SOCK_NONBLOCK | SOCK_CLOEXEC);
      if (fd < 0) return;
      ucred cred{}; socklen_t len = sizeof cred;
      if (client >= 0 || getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &cred, &len) || cred.uid != 0) { close(fd); return; }
      client = fd; seq = 0; activity.restart();
      peer = new QSocketNotifier(client, QSocketNotifier::Read, this);
      connect(peer, &QSocketNotifier::activated, this, [this] { receive(); });
    });
    qApp->installEventFilter(this);
    connect(&timer, &QTimer::timeout, this, [this] {
      if (client >= 0 && (activity.elapsed() > (probe ? 1500 : 3000) ||
          (active && foreignSwaps.load() != foreignAtStart))) finish("timeout/native writer");
    });
    timer.start(100);
    fprintf(stderr, "[zinc-ink] ready %s; buffer=%p framebuffer=%p\n", zink::socket_path, pixels, framebuffer);
  }
  ~Bridge() override { finish("window destroyed"); if (server >= 0) { close(server); unlink(zink::socket_path); } bridge = nullptr; }
};

bool compatible() {
  QFile f("/usr/lib/plugins/scenegraph/libqsgepaper.so");
  if (!f.open(QIODevice::ReadOnly)) return false;
  return QCryptographicHash::hash(f.readAll(), QCryptographicHash::Sha256).toHex() ==
    "3800e9f3d01f40fa3f5cc96ca49bcd982471ce5b033320f8788707520c8ddd08";
}
}

extern "C" char _xovi_shouldLoad() { return compatible(); }
extern "C" void override$_ZN6QImageC1EPhiixNS_6FormatEPFvPvES2_(void* self, unsigned char* data, int w, int h, long long bpl, int format, void* cleanup, void* info) {
  using Fn = void (*)(void*, unsigned char*, int, int, long long, int, void*, void*);
  reinterpret_cast<Fn>($_ZN6QImageC1EPhiixNS_6FormatEPFvPvES2_)(self, data, w, h, bpl, format, cleanup, info);
  if (!pixels && w == zink::width && h == zink::height && bpl == stride && format == 4) pixels = data;
}
extern "C" void override$_ZN12EPRenderLoop19handleUpdateRequestEP12QQuickWindow(void* self, QQuickWindow* w) {
  using Fn = void (*)(void*, QQuickWindow*);
  reinterpret_cast<Fn>($_ZN12EPRenderLoop19handleUpdateRequestEP12QQuickWindow)(self, w);
  if (!bridge && pixels && framebuffer && QThread::currentThread() == qApp->thread()) {
    renderLoop = self; renderThread = QThread::currentThread();
    block = reinterpret_cast<Block>(dlsym(RTLD_DEFAULT, "_ZN12EPRenderLoop14blockRenderingERK7QString"));
    unblock = reinterpret_cast<Block>(dlsym(RTLD_DEFAULT, "_ZN12EPRenderLoop16unblockRenderingERK7QString"));
    vendorSwap = reinterpret_cast<Swap>($_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE);
    if (block && unblock && vendorSwap) bridge = new Bridge(w);
  }
}
extern "C" unsigned long override$_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE(void* self, QRect r, int content, int mode, int flags) {
  framebuffer = self;
  if (leased && !ownSwap) ++foreignSwaps;
  return reinterpret_cast<Swap>($_ZN13EPFramebuffer11swapBuffersE5QRect13EPContentType12EPScreenMode6QFlagsINS_10UpdateFlagEE)(self, r, content, mode, flags);
}
extern "C" unsigned long override$_ZN13EPFramebuffer11swapBuffersERK7QRegionRK12EPContentMapRK15EPScreenModeMap6QFlagsINS_10UpdateFlagEE(void* self, const QRegion& r, const void* content, const void* mode, int flags) {
  framebuffer = self;
  if (leased && !ownSwap) ++foreignSwaps;
  using Fn = unsigned long (*)(void*, const QRegion&, const void*, const void*, int);
  return reinterpret_cast<Fn>($_ZN13EPFramebuffer11swapBuffersERK7QRegionRK12EPContentMapRK15EPScreenModeMap6QFlagsINS_10UpdateFlagEE)(self, r, content, mode, flags);
}
