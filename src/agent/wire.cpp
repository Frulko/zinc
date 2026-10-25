// The device agent's files: whole files, keys on disk, the trees of push, pull and install (std::filesystem). The session itself (TLS
// over a socket, frames, JSON) is chan.cpp, which the console player links without this file.
#include "wire.h"

#include "platform/socket.h"
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <sstream>

namespace zn::agent {

namespace fs = std::filesystem;

bool readFile(const std::string& path, std::string& out) {
  std::ifstream f(path, std::ios::binary);
  if (!f) return false;
  std::ostringstream s;
  s << f.rdbuf();
  out = s.str();
  return true;
}

bool writePrivate(const std::string& path, const std::string& data) {
  const std::string tmp = path + ".tmp";
  const int fd = ::open(tmp.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
  if (fd < 0) return false;
  const bool ok = writeAll(fd, data.data(), data.size());
  ::close(fd);
  return ok && ::rename(tmp.c_str(), path.c_str()) == 0;
}

std::string hostName() {
  char b[256] = "";
  ::gethostname(b, sizeof b - 1);
  std::string s = b;
  return s.substr(0, s.find('.'));
}

namespace {

bool sendFile(Chan& c, const std::string& path, const std::string& rel, std::uint64_t& files, std::uint64_t& bytes, std::string& err, const Sent& sent) {
  const int fd = ::open(path.c_str(), O_RDONLY | O_CLOEXEC);
  struct stat st{};
  if (fd < 0 || ::fstat(fd, &st) != 0) { err = path + ": " + std::strerror(errno); if (fd >= 0) ::close(fd); return false; }
  bool ok = send(c, kJson, Obj().str("file", rel).num("mode", st.st_mode & 0777).num("size", static_cast<long long>(st.st_size)).done());
  char buf[kChunk];
  for (std::uint64_t left = static_cast<std::uint64_t>(st.st_size); ok && left > 0;) {
    const ssize_t n = ::read(fd, buf, static_cast<size_t>(std::min<std::uint64_t>(left, sizeof buf)));
    if (n <= 0) { err = path + " changed while it was read"; ok = false; break; }
    ok = send(c, kOut, std::string_view(buf, static_cast<size_t>(n)));
    left -= static_cast<std::uint64_t>(n);
    bytes += static_cast<std::uint64_t>(n);
    if (ok && sent) sent(bytes);
  }
  ::close(fd);
  if (ok) ++files;
  else if (err.empty()) err = "the connection was lost";
  return ok;
}

}  // namespace

bool sendTree(Chan& c, const std::string& path, std::uint64_t& files, std::uint64_t& bytes, std::string& err, const Sent& sent) {
  std::error_code ec;
  bool ok = true;
  const char* fault = std::getenv("ZINC_AGENT_FAULT");   // tests/t0/agent.sh: a sender that lies about a name, to see the receiver refuse it
  if (fs::is_regular_file(path, ec)) {
    ok = sendFile(c, path, fault && !std::strcmp(fault, "escape") ? "../escaped" : "", files, bytes, err, sent);
  } else if (fs::is_directory(path, ec)) {
    ok = send(c, kJson, Obj().str("dir", "").done());
    // ponytail: links and special files are left out (a link could name anything on the other side); add them when a tree needs its links
    for (auto it = fs::recursive_directory_iterator(path, fs::directory_options::skip_permission_denied, ec); ok && !ec && it != fs::recursive_directory_iterator(); it.increment(ec)) {
      const std::string rel = it->path().lexically_relative(path).generic_string();
      if (it->is_symlink(ec)) continue;
      if (it->is_directory(ec)) ok = send(c, kJson, Obj().str("dir", rel).done());
      else if (it->is_regular_file(ec)) ok = sendFile(c, it->path().string(), rel, files, bytes, err, sent);
    }
    if (!ok && err.empty()) err = "the connection was lost";
  } else {
    err = path + ": no such file or directory";
    ok = false;
  }
  if (ok) return send(c, kJson, Obj().flag("end", true).done());
  send(c, kJson, Obj().str("error", err).done());
  return false;
}

bool recvTree(Chan& c, const std::string& root, std::uint64_t& files, std::uint64_t& bytes, std::string& err) {
  std::string firstErr;   // kept until the sender is done: it is not reading us while it sends
  const auto note = [&](const std::string& e) { if (firstErr.empty()) firstErr = e; };
  const auto under = [&](const std::string& rel) { return rel.empty() ? root : root + "/" + rel; };
  int out = -1;
  std::uint64_t left = 0;
  for (;;) {
    char type;
    std::string payload;
    if (!recv(c, type, payload)) { if (out >= 0) ::close(out); err = "the connection ended during the transfer"; return false; }
    if (type == kOut) {
      if (payload.size() > left) { if (out >= 0) ::close(out); err = "the transfer does not follow its sizes"; return false; }
      left -= payload.size();
      if (out >= 0) {
        if (writeAll(out, payload.data(), payload.size())) bytes += payload.size();
        else { note(std::string("write: ") + std::strerror(errno)); ::close(out); out = -1; }
      }
      if (left == 0 && out >= 0) { ::close(out); out = -1; }
      continue;
    }
    if (type != kJson) continue;
    const Doc d(payload);
    if (left != 0 || !d.ok() || d.has("error")) {   // the sender gave up in the middle
      if (out >= 0) ::close(out);
      err = d.ok() && d.has("error") ? d.str("error") : "the transfer was interrupted";
      return false;
    }
    if (d.flag("end")) break;
    const bool isDir = d.has("dir");
    const std::string rel = d.str(isDir ? "dir" : "file");
    if (!isDir) left = static_cast<std::uint64_t>(d.num("size"));
    if (!safeRel(rel)) { note("refused: the name '" + rel + "' leaves the destination"); continue; }
    const std::string target = under(rel);
    std::error_code ec;
    if (isDir) {
      fs::create_directories(target, ec);
      if (ec) note(target + ": " + ec.message());
      continue;
    }
    if (fs::path(target).has_parent_path()) fs::create_directories(fs::path(target).parent_path(), ec);
    out = ::open(target.c_str(), O_WRONLY | O_CREAT | O_TRUNC | O_CLOEXEC, 0600);
    if (out < 0) { note(target + ": " + std::strerror(errno)); continue; }
    ::fchmod(out, static_cast<mode_t>(d.num("mode")) & 0777);
    ++files;
    if (left == 0) { ::close(out); out = -1; }
  }
  if (!firstErr.empty()) { err = firstErr; return false; }
  return true;
}

}  // namespace zn::agent
