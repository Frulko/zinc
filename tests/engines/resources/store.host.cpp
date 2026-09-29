#include "zinc_native_store.h"
static int32_t alive=0;
struct Counter : zrt::native::NativeResource {
  int32_t value;
  explicit Counter(int32_t n):value(n){++alive;}
  ~Counter() override {--alive;}
};
struct Store : NativeStore {
  zrt::Ref<zrt::native::NativeResource> create(int32_t n) override {return zrt::make<Counter>(n);}
  zrt::Ref<zrt::native::NativeResource> alias(zrt::Ref<zrt::native::NativeResource> value) override {return value;}
  int32_t get(zrt::Ref<zrt::native::NativeResource> value) override {return static_cast<Counter*>(value.p)->value;}
  void set(zrt::Ref<zrt::native::NativeResource> value,int32_t n) override {static_cast<Counter*>(value.p)->value=n;}
  int32_t live() override {return alive;}
};
NativeStore* zinc_create_Store(){static Store s;s.rc=zrt::IMMORTAL;return &s;}
