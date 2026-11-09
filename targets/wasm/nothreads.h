// Included first in every file of the compiler built for the browser (tools/build-wasm compiler, ZN-774.29). The libc++ of WASI has no threads, so
// no std::mutex: the compiler's few locks (parser.cpp keep, modules.cpp memos) guard against plugin builds on other threads, which this build has not.
// ponytail: a lock that does nothing; a real one when the compiler runs on wasm32-wasi-threads.
#pragma once
#ifdef __cplusplus
#include <mutex>
namespace std { inline namespace __1 {
struct mutex {
  void lock() {}
  void unlock() {}
  bool try_lock() { return true; }
};
}}
#endif
