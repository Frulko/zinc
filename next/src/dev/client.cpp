#include "dev/client.h"

#include <chrono>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <sstream>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#include <dirent.h>

#include "zn/devproto.h"

namespace zn::dev {
namespace {

using Clock = std::chrono::steady_clock;

long msSince(Clock::time_point t) { return static_cast<long>(std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - t).count()); }

bool writeAll(int fd, const void* p, std::size_t n) {
  const char* c = static_cast<const char*>(p);
  while (n > 0) {
    ssize_t w = ::write(fd, c, n);
    if (w < 0) { if (errno == EINTR || errno == EAGAIN) { usleep(1000); continue; } return false; }
    c += w; n -= static_cast<std::size_t>(w);
  }
  return true;
}

// Reads protocol lines out of the stream the device sends: 0x1E ... LF, then (for `out`) a counted body.
struct Reader {
  Link& link;
  std::string pending;  // bytes read and not yet consumed
  std::string* log;

  // Waits up to `ms` for more bytes; false on timeout or end of stream.
  bool fill(int ms) {
    pollfd p{link.in, POLLIN, 0};
    int r = ::poll(&p, 1, ms);
    if (r <= 0) return false;
    char buf[1024];
    ssize_t n = ::read(link.in, buf, sizeof buf);
    if (n <= 0) return false;
    pending.append(buf, static_cast<std::size_t>(n));
    return true;
  }
  // The next protocol line (without the mark and the newline); other bytes go to the log. False on timeout.
  bool nextLine(std::string& l, int ms) {
    auto t0 = Clock::now();
    for (;;) {
      std::size_t m = pending.find(kMark);
      if (m != std::string::npos) {
        if (log && m > 0) log->append(pending, 0, m);
        pending.erase(0, m);
        std::size_t nl = pending.find('\n');
        if (nl != std::string::npos) { l = pending.substr(1, nl - 1); pending.erase(0, nl + 1); return true; }
      } else if (log) { log->append(pending); pending.clear(); }
      long left = ms - msSince(t0);
      if (left <= 0 || !fill(static_cast<int>(left))) return false;
    }
  }
  bool body(std::size_t n, std::string& out, int ms) {
    auto t0 = Clock::now();
    while (pending.size() < n) {
      long left = ms - msSince(t0);
      if (left <= 0 || !fill(static_cast<int>(left))) return false;
    }
    out = pending.substr(0, n);
    pending.erase(0, n);
    return true;
  }
};

}  // namespace

bool openSerial(const std::string& path, int baud, Link& link, std::string& err) {
  int fd = ::open(path.c_str(), O_RDWR | O_NOCTTY | O_NONBLOCK);
  if (fd < 0) { err = "cannot open " + path + ": " + std::strerror(errno); return false; }
  termios t{};
  if (tcgetattr(fd, &t) != 0) { err = path + " is not a serial port"; ::close(fd); return false; }
  cfmakeraw(&t);
#ifdef __APPLE__
  speed_t sp = static_cast<speed_t>(baud);  // macOS takes any rate as a number
#else
  speed_t sp = baud == 921600 ? B921600 : baud == 460800 ? B460800 : baud == 230400 ? B230400 : B115200;
#endif
  cfsetispeed(&t, sp); cfsetospeed(&t, sp);
  t.c_cflag |= CLOCAL | CREAD;
  t.c_cc[VMIN] = 0; t.c_cc[VTIME] = 0;
  tcsetattr(fd, TCSANOW, &t);
  link.in = link.out = fd;
  return true;
}

bool spawnCommand(const std::string& cmd, Link& link, std::string& err) {
  int toChild[2], fromChild[2];
  if (pipe(toChild) != 0 || pipe(fromChild) != 0) { err = "pipe failed"; return false; }
  pid_t pid = fork();
  if (pid < 0) { err = "fork failed"; return false; }
  if (pid == 0) {
    dup2(toChild[0], 0); dup2(fromChild[1], 1);
    ::close(toChild[0]); ::close(toChild[1]); ::close(fromChild[0]); ::close(fromChild[1]);
    execl("/bin/sh", "sh", "-c", cmd.c_str(), static_cast<char*>(nullptr));
    _exit(127);
  }
  ::close(toChild[0]); ::close(fromChild[1]);
  link.out = toChild[1]; link.in = fromChild[0]; link.pid = pid;
  signal(SIGPIPE, SIG_IGN);
  return true;
}

void closeLink(Link& link) {
  if (link.out >= 0) ::close(link.out);
  if (link.in >= 0 && link.in != link.out) ::close(link.in);
  if (link.pid > 0) { kill(link.pid, SIGTERM); int st; waitpid(link.pid, &st, 0); }
  link = Link{};
}

std::string findSerialPort() {
  for (const char* dir : {"/dev"}) {
    DIR* d = opendir(dir);
    if (!d) continue;
    std::string best;
    while (dirent* e = readdir(d)) {
      std::string n = e->d_name;
      if (n.rfind("cu.usbserial", 0) == 0 || n.rfind("cu.SLAB", 0) == 0 || n.rfind("cu.wchusbserial", 0) == 0 || n.rfind("ttyUSB", 0) == 0 || n.rfind("ttyACM", 0) == 0) best = std::string(dir) + "/" + n;
    }
    closedir(d);
    if (!best.empty()) return best;
  }
  return "";
}

bool upload(Link& link, const std::vector<std::uint8_t>& module, Answer& a, std::string& err, int bootMs, int runMs, std::string* log) {
  Reader rd{link, "", log};
  std::string l;
  // wait for the core: ping every half second while the device boots
  auto t0 = Clock::now();
  bool ready = false;
  while (!ready && msSince(t0) < bootMs) {
    std::string ping = std::string(1, kMark) + "ZN ping\n";
    if (!writeAll(link.out, ping.data(), ping.size())) { err = "cannot write to the device"; return false; }
    while (rd.nextLine(l, 500)) {
      std::istringstream in(l);
      std::string zn, cmd;
      in >> zn >> cmd;
      if (zn == "ZN" && cmd == "ready") { in >> a.coreVersion >> a.freeHeap; ready = true; break; }
    }
  }
  if (!ready) { err = "the device does not answer (is the core firmware flashed? `zinc flash --target esp32`)"; return false; }
  std::string head = std::string(1, kMark) + "ZN load " + std::to_string(module.size()) + " " + hex32(crc32(module.data(), module.size())) + "\n";
  if (!writeAll(link.out, head.data(), head.size())) { err = "cannot write to the device"; return false; }
  for (std::size_t at = 0; at < module.size(); at += 256) {  // small chunks: the UART of a device has a small buffer
    std::size_t n = std::min<std::size_t>(256, module.size() - at);
    if (!writeAll(link.out, module.data() + at, n)) { err = "cannot write to the device"; return false; }
    usleep(2000);
  }
  auto r0 = Clock::now();
  for (;;) {
    long left = runMs - msSince(r0);
    if (left <= 0 || !rd.nextLine(l, static_cast<int>(left))) { err = "the program did not finish in time"; return false; }
    std::istringstream in(l);
    std::string zn, cmd;
    in >> zn >> cmd;
    if (zn != "ZN") continue;
    if (cmd == "err") { std::getline(in, err); if (!err.empty() && err[0] == ' ') err.erase(0, 1); err = "the device refused the module: " + err; return false; }
    if (cmd == "out") {
      std::size_t n = 0;
      in >> n;
      if (!rd.body(n, a.output, 5000)) { err = "the output of the program was cut short"; return false; }
    } else if (cmd == "done") {
      in >> a.status >> a.leaked >> a.freeHeap;
      return true;
    }
  }
}

}  // namespace zn::dev
