// A Pi session yields the display before the new process may execute.
#include "wire.h"
#include "../tc/tc.h"
#include <cerrno>
#include <chrono>
#include <cstdlib>
#include <csignal>
#include <filesystem>
#include <cstring>
#include <set>
#include <sys/socket.h>
#include <sys/un.h>
#include <thread>
#include <unistd.h>

namespace zn::agent {

static std::string firstLine(const std::string& path) {
  std::string text;
  readFile(path, text);
  return text.substr(0, text.find('\n'));
}

static std::string screenDir() {
  const char* dir = std::getenv("ZINC_AGENT_SCREEN");
  return dir ? dir : "";
}

bool awaitScreen(int fd) {
  char ready = 0;
  ssize_t n;
  do { n = ::read(fd, &ready, 1); } while (n < 0 && errno == EINTR);
  ::close(fd);
  return n == 1 && ready == '1';
}

void releaseScreen(long pid) {
  const std::string dir = screenDir();
  if (!dir.empty() && firstLine(dir + "/device-screen") == std::to_string(pid)) ::unlink((dir + "/device-screen").c_str());
}

std::string liveShell() {
  std::string path;
  if (const char* e = std::getenv("ZINC_SHELL_SOCKET"); e && *e) path = e;
  else if (const std::string dir = screenDir(); !dir.empty()) path = dir + "/shell.sock";
  else if (const char* r = std::getenv("ZINC_RUN"); r && *r) path = std::string(r) + "/shell.sock";
  sockaddr_un a{};
  if (path.empty() || path.size() >= sizeof a.sun_path) return "";
  a.sun_family = AF_UNIX;
  std::memcpy(a.sun_path, path.c_str(), path.size() + 1);
  const int fd = ::socket(AF_UNIX, SOCK_STREAM, 0);
  if (fd < 0) return "";
  const bool live = ::connect(fd, reinterpret_cast<sockaddr*>(&a), sizeof a) == 0;   // the shell drops a client that sends nothing
  ::close(fd);
  return live ? path : "";
}

bool handoffScreen(long pid, int fd, std::string& err, bool lease) {
  const std::string dir = screenDir(), mine = std::to_string(pid);
  bool ready = dir.empty() || !lease;
  if (!dir.empty()) {
    const long previous = std::atol(firstLine(dir + "/device-screen").c_str());
    std::set<long> old{previous};
    std::error_code ec;
    for (const auto& file : std::filesystem::directory_iterator(tc::home() + "/agent/run", ec))
      if (file.path().extension() == ".pid") old.insert(std::atol(firstLine(file.path().string()).c_str()));
    for (const long other : old) if (other > 1 && other != pid) {
      ::kill(-other, SIGTERM);
      for (int i = 0; i < 60 && ::kill(other, 0) == 0; ++i) std::this_thread::sleep_for(std::chrono::milliseconds(50));
      ::kill(-other, SIGKILL);
    }
    if (lease && writePrivate(dir + "/device-screen", mine + "\n")) {
      for (int i = 0; i < 100; ++i) {
        if (firstLine(dir + "/screen-ready") == mine) { ready = true; break; }
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
      }
    }
  }
  if (ready) ready = ::write(fd, "1", 1) == 1;
  ::close(fd);
  if (!ready) {
    releaseScreen(pid);
    err = "the display session did not yield: update zinc-session and zinc-agent.service on the device";
  }
  return ready;
}

}  // namespace zn::agent
