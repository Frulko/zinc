#pragma once
// Thread-owned advisory file locks. OS handles never escape and tokens never repeat.
#include <atomic>
#include <cerrno>
#include <climits>
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#ifdef _WIN32
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#else
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#endif

namespace zn::host::fslock {
struct File {
#ifdef _WIN32
  HANDLE handle = INVALID_HANDLE_VALUE;
  ~File() { if (handle != INVALID_HANDLE_VALUE) CloseHandle(handle); }
#else
  int fd = -1;
  ~File() { if (fd >= 0) close(fd); }
#endif
  File() = default;
  File(const File&) = delete;
  File& operator=(const File&) = delete;
};
inline std::atomic<std::int64_t> nextToken{1};
inline auto& owned() {
  // shortcut: same-thread program teardown has no reliable host hook; callers must unlock in finally until run ownership is wired.
  thread_local std::map<std::int32_t, std::unique_ptr<File>> files;
  return files;
}
#ifdef _WIN32
inline int winError(DWORD e) {
  return e == ERROR_ACCESS_DENIED ? EACCES : e == ERROR_FILE_NOT_FOUND || e == ERROR_PATH_NOT_FOUND ? ENOENT :
         e == ERROR_TOO_MANY_OPEN_FILES ? EMFILE : e == ERROR_INVALID_NAME ? EINVAL : EIO;
}
#endif
// 0: acquired or contended (token 0), otherwise errno. Path policy is checked by sys_host before this opens anything.
inline int acquire(const std::string& path, std::int32_t& token) {
  token = 0;
  auto file = std::make_unique<File>();
#ifdef _WIN32
  const int n = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.data(), static_cast<int>(path.size()), nullptr, 0);
  if (!n) return EINVAL;
  std::wstring wide(static_cast<std::size_t>(n), L'\0');
  if (!MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, path.data(), static_cast<int>(path.size()), wide.data(), n)) return EINVAL;
  file->handle = CreateFileW(wide.c_str(), GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                             OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
  if (file->handle == INVALID_HANDLE_VALUE) return winError(GetLastError());
  BY_HANDLE_FILE_INFORMATION info{};
  if (!GetFileInformationByHandle(file->handle, &info)) return winError(GetLastError());
  if (GetFileType(file->handle) != FILE_TYPE_DISK || (info.dwFileAttributes & (FILE_ATTRIBUTE_DIRECTORY | FILE_ATTRIBUTE_REPARSE_POINT))) return EINVAL;
  OVERLAPPED offset{};
  if (!LockFileEx(file->handle, LOCKFILE_EXCLUSIVE_LOCK | LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, &offset)) {
    const DWORD error = GetLastError();
    return error == ERROR_LOCK_VIOLATION ? 0 : winError(error);
  }
#else
  file->fd = open(path.c_str(), O_RDWR | O_CREAT | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK, 0600);
  if (file->fd < 0) return errno;
  struct stat info{};
  if (fstat(file->fd, &info) != 0) return errno;
  if (!S_ISREG(info.st_mode)) return S_ISDIR(info.st_mode) ? EISDIR : EINVAL;
  int result;
  do { result = flock(file->fd, LOCK_EX | LOCK_NB); } while (result != 0 && errno == EINTR);
  if (result != 0) return errno == EWOULDBLOCK || errno == EAGAIN ? 0 : errno;
#endif
  auto& files = owned();
  std::int64_t next = nextToken.load(std::memory_order_relaxed);
  do { if (next > INT32_MAX) return EMFILE; }
  while (!nextToken.compare_exchange_weak(next, next + 1, std::memory_order_relaxed));
  token = static_cast<std::int32_t>(next);
  files.emplace(token, std::move(file));
  return 0;
}
inline int release(std::int32_t token) { return owned().erase(token) ? 0 : EBADF; }
}  // namespace zn::host::fslock
