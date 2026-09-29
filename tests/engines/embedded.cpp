#include "../../runtime/include/zinc_vm.h"
#include <cassert>
#include <algorithm>
#include <chrono>
#include <cstring>
#include <fstream>
#include <iterator>
#include <memory>
#include <string>
#include <thread>
#include <vector>
using Context=std::unique_ptr<ZincVM,decltype(&zinc_vm_destroy)>;
std::vector<char> read(const char* path) {std::ifstream in(path,std::ios::binary);assert(in);return {std::istreambuf_iterator<char>(in),{}};}
int main(int argc,char** argv) {
  assert(argc==6);
  auto good=read(argv[1]),loop=read(argv[2]),heap=read(argv[3]),timer=read(argv[4]),native=read(argv[5]);
  ZincError error{};
  const auto message=[&]{return std::string(error.data?error.data:"",error.length);};
  const auto create=[&](size_t bytes,uint32_t timeout,uint32_t jit){
    ZincVMOptions o={ZINC_VM_API_VERSION,sizeof(ZincVMOptions),bytes,8u<<20,timeout,jit};
    Context vm(zinc_vm_create(&o,&error),zinc_vm_destroy);assert(vm);return vm;
  };
  const auto load=[&](ZincVM* vm,const std::vector<char>& bytes){return zinc_vm_load(vm,bytes.data(),bytes.size(),&error);};
  for(unsigned jit=0;jit<=1;jit++) {
#if !defined(__aarch64__)
    if(jit)continue;
#endif
    auto first=create(65536,1000,jit),second=create(65536,1000,jit);
    assert(load(first.get(),good)==ZINC_OK);assert(load(second.get(),good)==ZINC_OK);
    assert(zinc_vm_memory_used(first.get())>0);
    assert(zinc_vm_run(first.get(),&error)==ZINC_OK);
    assert(zinc_vm_run(first.get(),&error)!=ZINC_OK); // Never re-execute initializers.
    ZincVMExport binding{};ZincValue result{},argument{ZINC_I32,0,{}};argument.as.integer=3;
    assert(zinc_vm_lookup(first.get(),"increment",&binding,&error)==ZINC_OK);
    assert(binding.kind==ZINC_VM_FUNCTION && binding.type==ZINC_I32 && binding.parameter_count==1 && binding.parameters[0]==ZINC_I32);
    assert(zinc_vm_call(first.get(),"increment",&argument,1,&result,&error)==ZINC_OK && result.as.integer==4);
    assert(zinc_vm_get(first.get(),"n",&result,&error)==ZINC_OK && result.as.integer==4);
    assert(zinc_vm_lookup(first.get(),"hidden",&binding,&error)!=ZINC_OK);
    assert(zinc_vm_call(first.get(),"fromDependency",&argument,1,&result,&error)==ZINC_OK && result.as.integer==9);
    assert(zinc_vm_call(first.get(),"inc",nullptr,0,&result,&error)!=ZINC_OK);
    ZincValue wrong{ZINC_BOOL,0,{}};assert(zinc_vm_call(first.get(),"inc",&wrong,1,&result,&error)!=ZINC_OK);
    assert(zinc_vm_call(first.get(),"fail",nullptr,0,&result,&error)!=ZINC_OK);assert(message()=="guest failure");
    assert(zinc_vm_call(first.get(),"inc",&argument,1,&result,&error)==ZINC_OK && result.as.integer==8);
    assert(zinc_vm_set(first.get(),"n",&argument,&error)==ZINC_OK);
    assert(zinc_vm_get(first.get(),"n",&result,&error)==ZINC_OK && result.as.integer==3);
    assert(zinc_vm_get(first.get(),"label",&result,&error)==ZINC_OK && std::string(result.as.string,result.length)=="fixed");
    assert(zinc_vm_lookup(first.get(),"label",&binding,&error)==ZINC_OK && !binding.writable);
    assert(zinc_vm_set(first.get(),"label",&result,&error)!=ZINC_OK);
    assert(zinc_vm_set(first.get(),"text",&result,&error)==ZINC_OK); // Returned string can be passed back.
    ZincValue suffix{ZINC_STRING,1,{}};suffix.as.string="!";
    for(unsigned j=0;j<1000;j++)assert(zinc_vm_call(first.get(),"join",&suffix,1,&result,&error)==ZINC_OK && std::string(result.as.string,result.length)=="fixed!");
    assert(zinc_vm_call(first.get(),"random",nullptr,0,&result,&error)==ZINC_OK);const auto randomFirst=result.as.number;
    assert(zinc_vm_call(first.get(),"random",nullptr,0,&result,&error)==ZINC_OK && result.as.number!=randomFirst);
    assert(zinc_vm_run(second.get(),&error)==ZINC_OK);
    assert(zinc_vm_call(second.get(),"random",nullptr,0,&result,&error)==ZINC_OK && result.as.number==randomFirst);
    assert(zinc_vm_get(second.get(),"n",&result,&error)==ZINC_OK && result.as.integer==1);
    first.reset();
    assert(zinc_vm_call(second.get(),"inc",&argument,1,&result,&error)==ZINC_OK && result.as.integer==4); // Other instance survives.
    assert(zinc_vm_call(second.get(),"spin",nullptr,0,&result,&error)!=ZINC_OK);assert(message().find("timed out")!=std::string::npos);
    assert(zinc_vm_call(second.get(),"inc",&argument,1,&result,&error)!=ZINC_OK); // Limits invalidate execution.

    auto limited=create(65536,5,jit);assert(load(limited.get(),loop)==ZINC_OK);
    assert(zinc_vm_run(limited.get(),&error)!=ZINC_OK);assert(message().find("timed out")!=std::string::npos);
    for(const auto* program:{&loop,&timer}) {
      auto interrupted=create(65536,0,jit);assert(load(interrupted.get(),*program)==ZINC_OK);
      std::thread cancel([&]{std::this_thread::sleep_for(std::chrono::milliseconds(5));zinc_vm_interrupt(interrupted.get());});
      assert(zinc_vm_run(interrupted.get(),&error)!=ZINC_OK);cancel.join();assert(message().find("interrupted")!=std::string::npos);
    }
    auto tiny=create(4096,1000,jit);
    const auto loaded=load(tiny.get(),heap);
    assert(loaded!=ZINC_OK || zinc_vm_run(tiny.get(),&error)!=ZINC_OK);assert(message().find("memory limit")!=std::string::npos);
  }
  auto invalid=create(65536,1000,0);const char junk[4]={'B','A','D','!'};
  assert(zinc_vm_load(invalid.get(),junk,sizeof junk,&error)!=ZINC_OK);
  assert(load(invalid.get(),good)!=ZINC_OK); // Failed parser cannot leave a runnable context.
  auto malformed=good;std::fill(malformed.end()-4,malformed.end(),char(255));
  auto badExport=create(65536,1000,0);assert(load(badExport.get(),malformed)!=ZINC_OK);assert(message().find("export")!=std::string::npos);
  auto denied=create(65536,1000,0);assert(load(denied.get(),native)!=ZINC_OK);
  assert(message().find("not registered")!=std::string::npos);
  bool led=false;
  const uint32_t boolean[]={ZINC_BOOL};
  ZincExport exports[]={
    {"serial",nullptr,0,ZINC_STRING,[](void*,const ZincValue*,uint32_t,ZincValue* out,ZincError*)->int32_t{*out={ZINC_STRING,8,{}};out->as.string="EMBEDDED";return ZINC_OK;},nullptr},
    {"temperature",nullptr,0,ZINC_F64,[](void* p,const ZincValue*,uint32_t,ZincValue* out,ZincError*)->int32_t{*out={ZINC_F64,0,{}};out->as.number=40.25+*(bool*)p;return ZINC_OK;},&led},
    {"setLed",boolean,1,ZINC_VOID,[](void* p,const ZincValue* args,uint32_t,ZincValue* out,ZincError*)->int32_t{*(bool*)p=args[0].as.unsigned_integer!=0;*out={ZINC_VOID,0,{}};return ZINC_OK;},&led},
  };
  ZincModule sensor={ZINC_ABI_VERSION,sizeof(ZincModule),"zinc:native/Sensor",exports,3,nullptr,nullptr};
  auto allowed=create(65536,1000,0);assert(zinc_vm_register(allowed.get(),&sensor,&error)==ZINC_OK);
  assert(load(allowed.get(),native)==ZINC_OK);assert(zinc_vm_run(allowed.get(),&error)==ZINC_OK);assert(led);allowed.reset();
  unsigned disposed=0;
  ZincModule module={ZINC_ABI_VERSION,sizeof(ZincModule),"test:empty",nullptr,0,&disposed,[](void* p){++*(unsigned*)p;}};
  {
    auto owner=create(65536,1000,0);
    assert(zinc_vm_register(owner.get(),&module,&error)==ZINC_OK);
    assert(zinc_vm_register(owner.get(),&module,&error)!=ZINC_OK);
    assert(disposed==0);assert(zinc_vm_host(owner.get())->version==ZINC_ABI_VERSION);
    assert(load(owner.get(),good)==ZINC_OK);
    assert(zinc_vm_register(owner.get(),&module,&error)!=ZINC_OK);
  }
  assert(disposed==1);
  ZincVMOptions bad{};assert(!zinc_vm_create(&bad,&error));
  assert(zinc_vm_load(nullptr,good.data(),good.size(),&error)!=ZINC_OK);
  assert(zinc_vm_run(nullptr,&error)!=ZINC_OK);assert(!zinc_vm_host(nullptr));
  zinc_vm_interrupt(nullptr);zinc_vm_destroy(nullptr);
}
