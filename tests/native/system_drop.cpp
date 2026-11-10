// The production HAL handler, against the real host filesystem scope. No window needed.
#define ZRT_HOSTED_CPP
#include <cassert>
#include <cstdio>
#include <cstring>
#include "zn/host.h"
#include "zn/runtime.h"
#include "../../plugins/system/native/system.host.cpp"
#include <barrier>
#include <thread>
static bool readable(const char* path) {
  zn::host::HostArg args[1], result, failed;
  args[0].p=path;args[0].n=static_cast<uint32_t>(strlen(path));
  zn::host::hostSys(static_cast<int>(zn::Rt::HostFsReadText),args,&result);
  zn::host::hostSys(static_cast<int>(zn::Rt::HostFsFailed),nullptr,&failed);
  return failed.i==0;
}
int main(int argc,char** argv) {
  assert(argc==3);zn::host::installSys();
  NativeSystem* system=zinc_create_System();
  system->setPermissions(zrt::String::from("",0));system->setApp(zrt::String::from("{}",2));
  const char* scope="{\"fs\":\"user-picked\"}";
  system->setScopes(zrt::String::from(scope,static_cast<uint32_t>(strlen(scope))));
  assert(!readable(argv[1]));assert(!readable(argv[2]));
  int events=0;
  system->onEvent(zrt::Fn<void(zrt::String)>([&](zrt::String event){
    ++events;
    if(events==1) {assert(!readable(argv[1]));assert(!readable(argv[2]));}
    if(events==2) {assert(readable(argv[1]));assert(!readable(argv[2]));}
  }));
  Sim::onDrop(argv[2],1); // dropped text is never a filesystem capability
  Sim::onDrop(argv[1],0); // exactly the native callback registered with hal_set_drop_handler
  assert(events==2);assert(readable(argv[1]));assert(!readable(argv[2]));
  std::barrier turn(2);
  std::thread reader([&] {
    for (int i=0;i<8;++i) {
      turn.arrive_and_wait();
      assert(readable(argv[1]));assert(!readable(argv[2]));
      turn.arrive_and_wait();
    }
  });
  for (int i=0;i<8;++i) {
    turn.arrive_and_wait();
    zn_host_fs_scope(1);zn_host_fs_grant(argv[1]);
    turn.arrive_and_wait();
  }
  reader.join();
  static_cast<Sim*>(system)->shutdown();
  std::puts("system native drop scope: ok");
}
