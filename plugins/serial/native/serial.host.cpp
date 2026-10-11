// zinc:serial for macos and linux: POSIX termios on a non-blocking descriptor, raw mode (no echo, no line editing, no translation). Nothing here
// waits: read() takes what has arrived, write() queues what the port does not take at once. Windows will be serial.windows.cpp behind the same Spec.
#define ZRT_HOSTED_CPP   // zrt.h takes <new> from the standard library, which <string> includes too
#include "zinc_native_serial.h"
#include <errno.h>
#include <fcntl.h>
#include <glob.h>
#include <stdio.h>
#include <string.h>
#include <string>
#include <sys/ioctl.h>
#include <termios.h>
#include <unistd.h>
#ifdef __APPLE__
#include <IOKit/serial/ioss.h>   // IOSSIOSPEED: any baud rate the driver takes (250000 for DMX and 3D printers, 31250 for MIDI)
#endif

namespace {
const int MAXPORT = 32;
const size_t MAXQUEUE = 1 << 20;   // 1 MiB waiting to go out: a port that takes nothing (flow control, a dead board) must not eat the memory
struct Port { int fd = -1; bool gone = false; std::string out; };
Port ports[MAXPORT];
char err_msg[300];

zrt::String str(const std::string& s) { return zrt::String::from(s.data(), (uint32_t)s.size()); }
int32_t fail(const std::string& path, const char* what) {
  snprintf(err_msg, sizeof err_msg, "%s: %s%s%s", path.c_str(), what, errno ? ": " : "", errno ? strerror(errno) : "");
  return -1;
}
Port* at(int32_t h) { return h >= 0 && h < MAXPORT && ports[h].fd >= 0 ? &ports[h] : nullptr; }

// The Bxxx constant of a standard rate, or 0. On Linux the constants are not the numbers.
speed_t standard(int32_t baud) {
  switch (baud) {
    case 300: return B300; case 1200: return B1200; case 2400: return B2400; case 4800: return B4800; case 9600: return B9600;
    case 19200: return B19200; case 38400: return B38400; case 57600: return B57600; case 115200: return B115200; case 230400: return B230400;
#ifdef B460800
    case 460800: return B460800; case 921600: return B921600;
#endif
    default: return 0;
  }
}
// Sends what waits in the queue and the port takes now.
void flush(Port& p) {
  while (!p.gone && !p.out.empty()) {
    ssize_t n = ::write(p.fd, p.out.data(), p.out.size());
    if (n > 0) p.out.erase(0, (size_t)n);
    else if (n < 0 && errno == EINTR) continue;
    else { if (n < 0 && errno != EAGAIN) p.gone = true; break; }
  }
}
}  // namespace

struct HostSerial : NativeSerial {
  zrt::String list() override {
    std::string all;
    glob_t g;
#ifdef __APPLE__
    const char* patterns[] = {"/dev/cu.*"};   // the callout devices: opening one does not wait for a carrier, as /dev/tty.* does
#else
    const char* patterns[] = {"/dev/ttyUSB*", "/dev/ttyACM*", "/dev/ttyAMA*", "/dev/ttyS[0-9]*", "/dev/rfcomm*"};
#endif
    int flags = 0;
    for (const char* p : patterns) { glob(p, flags, nullptr, &g); flags = GLOB_APPEND; }
    for (size_t i = 0; i < g.gl_pathc; i++) { all += g.gl_pathv[i]; all += '\n'; }
    globfree(&g);
    return str(all);
  }
  int32_t open(zrt::String pathIn, int32_t baud, int32_t dataBits, int32_t parity, int32_t stopBits) override {
    std::string path(pathIn.ptr(), pathIn.bytes());
    errno = 0;
    if (baud <= 0 || dataBits < 5 || dataBits > 8 || parity < 0 || parity > 2 || stopBits < 1 || stopBits > 2) return fail(path, "bad baud rate or framing");
    int32_t h = 0;
    while (h < MAXPORT && ports[h].fd >= 0) h++;
    if (h == MAXPORT) return fail(path, "too many ports open (32)");
    int fd = ::open(path.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK | O_CLOEXEC);
    if (fd < 0) return fail(path, "cannot open");
    termios t;
    if (!isatty(fd) || tcgetattr(fd, &t) != 0) { ::close(fd); errno = 0; return fail(path, "not a serial port"); }
    ioctl(fd, TIOCEXCL);   // ours alone: a second open() of the port fails with "busy" instead of stealing half the bytes
    cfmakeraw(&t);
    t.c_cflag |= CLOCAL | CREAD;   // no modem control: do not wait for a carrier, do not hang up on its loss
    t.c_cflag &= ~(tcflag_t)(CSIZE | PARENB | PARODD | CSTOPB | CRTSCTS);
    t.c_cflag |= dataBits == 5 ? CS5 : dataBits == 6 ? CS6 : dataBits == 7 ? CS7 : CS8;
    if (parity) t.c_cflag |= parity == 1 ? PARENB | PARODD : PARENB;
    if (stopBits == 2) t.c_cflag |= CSTOPB;
    t.c_cc[VMIN] = 1; t.c_cc[VTIME] = 0;
    speed_t std_rate = standard(baud);
    cfsetspeed(&t, std_rate ? std_rate : B9600);
    if (tcsetattr(fd, TCSANOW, &t) != 0) { int e = errno; ::close(fd); errno = e; return fail(path, "cannot set the framing"); }
    if (!std_rate) {
#ifdef __APPLE__
      speed_t any = (speed_t)baud;
      if (ioctl(fd, IOSSIOSPEED, &any) != 0) { int e = errno; ::close(fd); errno = e; return fail(path, "the port does not take this baud rate"); }
#else
      // ponytail: Linux needs termios2 and BOTHER for a rate outside the table; add it with the Linux pass (later.md)
      ::close(fd); errno = 0; return fail(path, "not a standard baud rate (300 to 921600)");
#endif
    }
    tcflush(fd, TCIOFLUSH);   // what the board sent before we listened is noise
    ports[h].fd = fd; ports[h].gone = false; ports[h].out.clear();
    return h;
  }
  zrt::String error() override { return str(err_msg); }
  zrt::Array<uint8_t> read(int32_t h) override {
    Port* p = at(h);
    uint8_t buf[4096];
    ssize_t n = 0;
    if (p && !p->gone) {
      flush(*p);
      n = ::read(p->fd, buf, sizeof buf);
      // with VMIN 1 on a non-blocking descriptor "nothing yet" is EAGAIN, so 0 is the end: an unplugged adapter, or a pseudo-terminal
      // whose other end closed (some drivers answer ENXIO or EIO instead)
      if (n == 0 || (n < 0 && errno != EAGAIN && errno != EINTR)) p->gone = true;
      if (n < 0) n = 0;
    }
    zrt::Array<uint8_t> r = zrt::Array<uint8_t>::with_cap((int32_t)n);
    if (n > 0) memcpy(r.a->data, buf, (size_t)n);
    r.a->len = (int32_t)n;
    return r;
  }
  bool alive(int32_t h) override { Port* p = at(h); return p && !p->gone; }
  bool write(int32_t h, zrt::Array<uint8_t> data) override {
    Port* p = at(h);
    if (!p || p->gone || p->out.size() + (size_t)data.length() > MAXQUEUE) return false;
    if (data.length() > 0) p->out.append((const char*)data.a->data, (size_t)data.length());
    flush(*p);
    return !p->gone;
  }
  int32_t pending(int32_t h) override { Port* p = at(h); return p ? (int32_t)p->out.size() : 0; }
  bool setSignals(int32_t h, bool dtr, bool rts) override {
    Port* p = at(h);
    int bits = 0;
    if (!p || p->gone || ioctl(p->fd, TIOCMGET, &bits) != 0) return false;
    bits = (bits & ~(TIOCM_DTR | TIOCM_RTS)) | (dtr ? TIOCM_DTR : 0) | (rts ? TIOCM_RTS : 0);
    return ioctl(p->fd, TIOCMSET, &bits) == 0;
  }
  void close(int32_t h) override {
    Port* p = at(h);
    if (!p) return;
    ::close(p->fd);
    p->fd = -1; p->out.clear();
  }
};

NativeSerial* zinc_create_Serial() {
  static HostSerial inst;
  inst.rc = zrt::IMMORTAL;
  return &inst;
}
