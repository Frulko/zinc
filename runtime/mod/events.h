// zinc:events — typed event channel. Listeners run as microtasks, in emission order (NAT-06).
#pragma once
namespace zrt { namespace events {
template<class T> struct Emitter : Object {
  Array<Fn<void(T)>> ls = Array<Fn<void(T)>>::with_cap(0);
  void on(Fn<void(T)> cb) { ls.push(cb); }
  void emit(T v) {
    for (int32_t i = 0; i < ls.length(); i++) { Fn<void(T)> f = ls.get(i); microtask([f, v]() { f(v); }); }
  }
};
}}
