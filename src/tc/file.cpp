#include "tc/tc.h"
#include <filesystem>
#include <fstream>
#include <unistd.h>
#ifndef _WIN32
#include <fcntl.h>
#include <sys/file.h>
#endif
extern "C" {
#include "sha256.h"
}
namespace zn::tc {
namespace fs = std::filesystem;
std::string sha256Hex(const std::string& bytes) {
  SHA256_CTX ctx;
  sha256_init(&ctx);
  sha256_update(&ctx, reinterpret_cast<const BYTE*>(bytes.data()), bytes.size());
  BYTE out[SHA256_BLOCK_SIZE];
  sha256_final(&ctx, out);
  static const char* hex = "0123456789abcdef";
  std::string r;
  for (BYTE b : out) { r += hex[b >> 4]; r += hex[b & 15]; }
  return r;
}
std::string sha256File(const std::string& path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) return "";
  SHA256_CTX ctx;
  sha256_init(&ctx);
  char buf[1 << 16];
  while (in.read(buf, sizeof buf) || in.gcount() > 0) sha256_update(&ctx, reinterpret_cast<const BYTE*>(buf), static_cast<size_t>(in.gcount()));
  BYTE out[SHA256_BLOCK_SIZE];
  sha256_final(&ctx, out);
  static const char* hex = "0123456789abcdef";
  std::string r;
  for (BYTE b : out) { r += hex[b >> 4]; r += hex[b & 15]; }
  return r;
}

FileLock::FileLock(const std::string& path) {
#ifndef _WIN32
  std::error_code ec;
  fs::create_directories(fs::path(path).parent_path(), ec);
  fd = ::open(path.c_str(), O_RDWR | O_CREAT | O_CLOEXEC, 0644);
  if (fd >= 0 && ::flock(fd, LOCK_EX) != 0) { ::close(fd); fd = -1; }
#endif   // ponytail: no lock on Windows yet (LockFileEx when it installs or builds in parallel)
}
FileLock::~FileLock() {
#ifndef _WIN32
  if (fd >= 0) ::close(fd);
#endif
}

}
