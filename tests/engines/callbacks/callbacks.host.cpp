#include "zinc_native_callbacks.h"
struct Callbacks : NativeCallbacks {
  zrt::Fn<int32_t(int32_t)> saved;
  int32_t apply(int32_t value,zrt::Fn<int32_t(int32_t)> callback) override {return callback(value);}
  void keep(zrt::Fn<int32_t(int32_t)> callback) override {saved=callback;}
  int32_t fire(int32_t value) override {auto callback=saved;return callback?callback(value):-1;}
  void clear() override {saved={};}
  zrt::String text(zrt::String value,zrt::Fn<zrt::String(zrt::String)> callback) override {return callback(value);}
};
NativeCallbacks* zinc_create_Callbacks(){return new Callbacks;}
