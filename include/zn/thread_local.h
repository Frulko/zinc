#pragma once

#ifdef ZN_PTHREAD_TLS
#include <cstdlib>
#include <pthread.h>
#endif

namespace zn {
// Each caller supplies a distinct state type, so unrelated values never share a key.
template<class State> State& threadLocal() {
#ifdef ZN_PTHREAD_TLS
  static pthread_key_t key;
  static pthread_once_t once = PTHREAD_ONCE_INIT;
  if (pthread_once(&once, [] {
    if (pthread_key_create(&key, [](void* p) { delete static_cast<State*>(p); })) std::abort();
  })) std::abort();
  auto* state = static_cast<State*>(pthread_getspecific(key));
  if (!state) {
    state = new State{};
    if (pthread_setspecific(key, state)) { delete state; std::abort(); }
  }
  return *state;
#else
  static thread_local State state{};
  return state;
#endif
}
}

#ifdef ZN_PTHREAD_TLS
#define ZN_THREAD_LOCAL(Type, Name, ...) \
  struct Name##ThreadState { Type value __VA_ARGS__; }; \
  auto& Name = ::zn::threadLocal<Name##ThreadState>().value
#else
#define ZN_THREAD_LOCAL(Type, Name, ...) thread_local Type Name __VA_ARGS__
#endif
