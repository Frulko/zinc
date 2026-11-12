#pragma once
#include "network_manager.h"
#include <cerrno>
#include <fcntl.h>
#include <spawn.h>
#include <signal.h>
#include <sys/wait.h>
#include <unistd.h>

namespace zinc::radio {
// A finite nmcli invocation: argv only, no credentials, no inherited session environment.
class NmcliCommand {
public:
  enum class State { idle, running, exited, stopping, failing, finished, closed };
private:
  State phase = State::idle;
  pid_t pid = -1;
  int fd = -1, code = -1;
  std::string output, failure;
  std::chrono::steady_clock::time_point deadline;
  bool transition(State next) {
    bool valid = ((phase == State::idle || phase == State::finished || phase == State::closed) && next == State::running) ||
      (phase == State::running && (next == State::exited || next == State::stopping || next == State::failing)) ||
      (phase == State::failing && next == State::stopping) ||
      ((phase == State::running || phase == State::exited || phase == State::failing) && next == State::finished) ||
      (phase != State::running && phase != State::failing && next == State::closed);
    if (valid) phase = next;
    return valid;
  }
  void closePipe() { if (fd >= 0) close(fd); fd = -1; }
  void terminate(State next) {
    closePipe();
    if (pid > 0) {
      // Keep the unreaped child PID owned until WNOHANG confirms its exit.
      if (phase == State::running) kill(-pid, SIGKILL);
      transition(next == State::closed ? State::stopping : State::failing);
    } else transition(next);
  }
  void fail(const char* why) { failure = why; terminate(State::finished); }
public:
  NmcliCommand() = default;
  NmcliCommand(const NmcliCommand&) = delete;
  NmcliCommand& operator=(const NmcliCommand&) = delete;
  ~NmcliCommand() { stop(); }
  State state() const { return phase; }
  bool pending() const { return phase == State::running || phase == State::exited || phase == State::stopping || phase == State::failing; }
  bool cleaning() const { return phase == State::stopping || phase == State::failing; }
  bool ok() const { return phase == State::finished && failure.empty() && code == 0; }
  const std::string& text() const { return output; }
  std::string error() const { return failure.empty() ? "nmcli exited (" + std::to_string(code) + ")" : failure; }
  bool start(const std::string& executable, const std::vector<std::string>& args) {
    if (pending()) return false;
    output.clear(); failure.clear(); code = -1;
    if (!transition(State::running)) return false;
    int pipes[2];
    if (pipe(pipes) < 0) { fail("nmcli pipe failed"); return false; }
    // Standard streams may be closed in the host; spawn actions need distinct fds >=3.
    int reader = fcntl(pipes[0], F_DUPFD_CLOEXEC, 3), writer = fcntl(pipes[1], F_DUPFD_CLOEXEC, 3);
    close(pipes[0]); close(pipes[1]);
    if (reader < 0 || writer < 0) { if (reader >= 0) close(reader); if (writer >= 0) close(writer); fail("nmcli pipe setup failed"); return false; }
    pipes[0] = reader; pipes[1] = writer;
    // Keep the child end blocking: only the parent's read is nonblocking.
    fd = pipes[0];
    if (fcntl(fd, F_SETFL, O_NONBLOCK) < 0 || fcntl(fd, F_SETFD, FD_CLOEXEC) < 0 || fcntl(pipes[1], F_SETFD, FD_CLOEXEC) < 0) {
      close(pipes[1]); fail("nmcli pipe setup failed"); return false;
    }
    posix_spawn_file_actions_t actions;
    posix_spawnattr_t attrs;
    int n = posix_spawn_file_actions_init(&actions);
    if (n) { close(pipes[1]); fail("nmcli spawn setup failed"); return false; }
    struct Actions { posix_spawn_file_actions_t* a; ~Actions() { posix_spawn_file_actions_destroy(a); } } actionGuard{&actions};
    n = posix_spawnattr_init(&attrs);
    if (n) { close(pipes[1]); fail("nmcli spawn setup failed"); return false; }
    struct Attrs { posix_spawnattr_t* a; ~Attrs() { posix_spawnattr_destroy(a); } } attrGuard{&attrs};
    n = posix_spawnattr_setflags(&attrs, POSIX_SPAWN_SETPGROUP);
    if (!n) n = posix_spawnattr_setpgroup(&attrs, 0);
    if (!n) n = posix_spawn_file_actions_addopen(&actions, STDIN_FILENO, "/dev/null", O_RDONLY, 0);
    if (!n) n = posix_spawn_file_actions_adddup2(&actions, pipes[1], STDOUT_FILENO);
    if (!n) n = posix_spawn_file_actions_addopen(&actions, STDERR_FILENO, "/dev/null", O_WRONLY, 0);
    if (!n) n = posix_spawn_file_actions_addclose(&actions, pipes[0]);
    if (!n) n = posix_spawn_file_actions_addclose(&actions, pipes[1]);
    std::vector<std::string> values{executable, "--terse", "--escape", "yes", "--colors", "no", "--wait", "5"};
    values.insert(values.end(), args.begin(), args.end());
    std::vector<char*> argv; for (auto& s : values) argv.push_back(s.data()); argv.push_back(nullptr);
    char locale[] = "LC_ALL=C", lang[] = "LANG=C", path[] = "PATH=/usr/bin:/bin";
    char* env[] = {locale, lang, path, nullptr};
    if (!n) n = posix_spawn(&pid, executable.c_str(), &actions, &attrs, argv.data(), env);
    close(pipes[1]);
    if (n) { pid = -1; fail("nmcli unavailable or spawn failed"); return false; }
    deadline = std::chrono::steady_clock::now() + std::chrono::seconds(7); return true;
  }
  void poll(std::chrono::steady_clock::time_point now = std::chrono::steady_clock::now()) {
    if (phase == State::stopping || phase == State::failing) {
      int status = 0; pid_t result = waitpid(pid, &status, WNOHANG);
      if (result == pid || (result < 0 && errno == ECHILD)) { pid = -1; transition(phase == State::stopping ? State::closed : State::finished); }
      return;
    }
    if (phase != State::running && phase != State::exited) return;
    if (now >= deadline) { fail("nmcli timed out"); return; }
    char buffer[4096];
    for (unsigned i = 0; fd >= 0 && i < 16; i++) {
      ssize_t n = read(fd, buffer, sizeof buffer);
      if (n > 0) {
        if (output.size() + static_cast<size_t>(n) > 65536) { fail("nmcli output limit exceeded"); return; }
        output.append(buffer, n);
      } else if (!n) { closePipe(); break; }
      else if (errno == EINTR) continue;
      else if (errno == EAGAIN || errno == EWOULDBLOCK) break;
      else { fail("nmcli read failed"); return; }
    }
    if (phase == State::running) {
      int status = 0; pid_t reaped = waitpid(pid, &status, WNOHANG);
      if (reaped < 0 && errno != EINTR) { if (errno == ECHILD) pid = -1; fail("nmcli wait failed"); return; }
      if (reaped == pid) { code = WIFEXITED(status) ? WEXITSTATUS(status) : 128; pid = -1; transition(State::exited); }
    }
    if (phase == State::exited && fd < 0) { pid = -1; transition(State::finished); }
  }
  void stop() { terminate(State::closed); output.clear(); }
};
// nmcli escapes only colon and backslash in terse mode. Reject malformed/control data.
inline bool nmcliRows(const std::string& text, size_t fields, std::vector<std::vector<std::string>>& out) {
  out.clear(); std::vector<std::string> row(1); bool escape = false;
  for (unsigned char c : text) {
    if (escape) { if (c != ':' && c != '\\') return false; row.back() += c; escape = false; }
    else if (c == '\\') escape = true;
    else if (c == ':') { row.emplace_back(); if (row.size() > fields) return false; }
    else if (c == '\n') { if (row.size() != fields || out.size() >= 128) return false; out.push_back(std::move(row)); row = {""}; }
    else if (c < 32 || c == 127 || row.back().size() >= 1024) return false;
    else row.back() += c;
  }
  return !escape && row.size() == 1 && row[0].empty();
}
inline bool nmcliHex(const std::string& s, std::vector<uint8_t>& out) {
  out.clear(); if (s.size() > 64 || s.size() % 2) return false;
  auto digit = [](char c) -> int { if (c >= '0' && c <= '9') return c - '0'; if (c >= 'a' && c <= 'f') return c - 'a' + 10; if (c >= 'A' && c <= 'F') return c - 'A' + 10; return -1; };
  for (size_t i = 0; i < s.size(); i += 2) { int a = digit(s[i]), b = digit(s[i+1]); if (a < 0 || b < 0) return false; out.push_back((a << 4) | b); }
  return true;
}
class Nmcli {
public:
  enum class State { idle, restarting, discovering, refreshing, listing, ready, scanning, absent, failed, closed };
private:
  State phase = State::idle;
  NmcliCommand command;
  std::string executable, device, statusText = "discovering", reason;
  std::vector<uint8_t> ssid;
  unsigned strength = 0;
  std::vector<NetworkManager::Network> networks;
  std::chrono::steady_clock::time_point next;
  bool transition(State to) {
    bool valid = to == State::closed || to == State::failed || ((phase == State::idle || phase == State::closed || phase == State::failed || phase == State::ready || phase == State::absent || phase == State::restarting) && to == State::discovering) || (to == State::restarting && phase != State::listing && phase != State::scanning) ||
      ((phase == State::discovering || phase == State::refreshing) && (to == State::listing || to == State::absent)) || (phase == State::ready && to == State::refreshing) || ((phase == State::listing || phase == State::scanning) && to == State::ready) || (phase == State::ready && to == State::scanning);
    if (valid) phase = to;
    return valid;
  }
  void fail(const std::string& why) { reason = why; device.clear(); ssid.clear(); strength = 0; networks.clear(); statusText = "failed"; transition(State::failed); }
  bool launch(std::vector<std::string> args) { if (command.start(executable, args)) return true; fail(command.error()); return false; }
  bool list(bool rescan) {
    return launch({"--fields", "SSID-HEX,SIGNAL,SECURITY,ACTIVE", "device", "wifi", "list", "ifname", device, "--rescan", rescan ? "yes" : "no"});
  }
public:
  explicit Nmcli(std::string path = "/usr/bin/nmcli") : executable(std::move(path)) {}
  bool has() const { return phase == State::ready || phase == State::listing || phase == State::scanning || phase == State::refreshing; }
  bool busy() const { return phase == State::restarting || phase == State::discovering || phase == State::scanning; }
  const std::string& error() const { return reason; }
  const std::vector<NetworkManager::Network>& results() const { return networks; }
  std::string info() const { return (phase == State::absent ? "unsupported" : statusText) + "\t" + hex(ssid) + "\t\t" + std::to_string(strength); }
  void start() {
    command.stop();
    if (!transition(command.pending() ? State::restarting : State::discovering)) return;
    device.clear(); networks.clear(); ssid.clear(); strength = 0; reason.clear(); statusText = "discovering";
    if (phase == State::discovering) launch({"--fields", "DEVICE,TYPE,STATE", "device", "status"});
  }
  bool reap() { if (phase == State::closed || phase == State::failed) command.poll(); return command.cleaning(); }
  void poll() {
    command.poll();
    if (phase == State::restarting) { if (!command.pending()) { transition(State::discovering); launch({"--fields", "DEVICE,TYPE,STATE", "device", "status"}); } return; }
    if (phase == State::ready || phase == State::absent) {
      if (std::chrono::steady_clock::now() >= next) { if (phase == State::absent) start(); else { transition(State::refreshing); launch({"--fields", "DEVICE,TYPE,STATE", "device", "status"}); } }
      return;
    }
    if (phase != State::discovering && phase != State::refreshing && phase != State::listing && phase != State::scanning) return;
    if (command.state() != NmcliCommand::State::finished) return;
    if (!command.ok()) { fail(command.error()); return; }
    std::vector<std::vector<std::string>> rows;
    if (!nmcliRows(command.text(), (phase == State::discovering || phase == State::refreshing) ? 3 : 4, rows)) { fail("invalid nmcli terse output"); return; }
    if (phase == State::discovering || phase == State::refreshing) {
      device.clear(); ssid.clear(); strength = 0;
      for (auto& r : rows) if (r[1] == "wifi") {
        if (r[0].empty() || r[0].size() > 15 || r[0][0] == '-' || r[0].find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_.:-") != std::string::npos) { fail("invalid nmcli interface"); return; }
        device = r[0]; statusText = r[2].rfind("connected", 0) == 0 ? "connected" : r[2].rfind("connecting", 0) == 0 ? "connecting" : "off"; break;
      }
      next = std::chrono::steady_clock::now() + std::chrono::seconds(2);
      if (device.empty()) { transition(State::absent); return; }
      transition(State::listing); list(false); return;
    }
    std::vector<NetworkManager::Network> result;
    for (auto& r : rows) {
      NetworkManager::Network n;
      if (!nmcliHex(r[0] == "--" ? "" : r[0], n.ssid) || r[1].empty() || r[1].size() > 3 || r[1].find_first_not_of("0123456789") != std::string::npos || (r[3] != "yes" && r[3] != "no")) { fail("invalid nmcli access point"); return; }
      n.strength = static_cast<unsigned>(std::strtoul(r[1].c_str(), nullptr, 10));
      if (n.strength > 100) { fail("invalid nmcli strength"); return; }
      n.flags = r[2].empty() || r[2] == "--" ? 0 : 1;
      if (r[3] == "yes") { ssid = n.ssid; strength = n.strength; }
      result.push_back(std::move(n));
    }
    networks = std::move(result); transition(State::ready); next = std::chrono::steady_clock::now() + std::chrono::seconds(2);
  }
  bool scan() { if (phase != State::ready) { reason = "nmcli device is not ready"; return false; } transition(State::scanning); networks.clear(); reason.clear(); return list(true); }
  bool connect() { reason = "nmcli fallback cannot guarantee client-bound volatile connections; direct D-Bus is required"; return false; }
  void stop() { command.stop(); transition(State::closed); device.clear(); networks.clear(); ssid.clear(); strength = 0; statusText = "off"; }
};
}
