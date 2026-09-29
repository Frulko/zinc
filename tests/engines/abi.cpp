#include "../../runtime/vm/abi.h"
#include <cassert>
int calls=0;
int32_t twice(void*,const ZincValue* a,uint32_t,ZincValue* out,ZincError*) {
  ++calls;out->type=ZINC_F64;out->as.number=a[0].as.number*2;return ZINC_OK;
}
int32_t broken(void*,const ZincValue*,uint32_t,ZincValue* out,ZincError*) {out->type=ZINC_STRING;return ZINC_OK;}
int32_t error(void*,const ZincValue*,uint32_t,ZincValue*,ZincError* e) {*e={"expected",8};return ZINC_HOST_ERROR;}
template<class F> void rejects(F f) {bool failed=false;try{f();}catch(const std::runtime_error&){failed=true;}assert(failed);}
int main() {
  const uint32_t params[]={ZINC_F64};
  const ZincExport exports[]={{"twice",params,1,ZINC_F64,twice,nullptr},{"broken",nullptr,0,ZINC_F64,broken,nullptr},{"error",nullptr,0,ZINC_VOID,error,nullptr}};
  ZincModule m={ZINC_ABI_VERSION,sizeof(ZincModule),"zinc:test",exports,3};
  zinc::Modules modules;modules.add(m);rejects([&]{modules.add(m);});
  rejects([&]{modules.resolve("zinc:absent","twice");});
  ZincValue a{};a.type=ZINC_F64;a.as.number=21;
  assert(zinc::Modules::call(modules.resolve("zinc:test","twice"),&a,1).as.number==42);
  rejects([&]{zinc::Modules::call(exports[0],nullptr,0);});
  a.type=ZINC_I32;rejects([&]{zinc::Modules::call(exports[0],&a,1);});assert(calls==1);
  rejects([&]{zinc::Modules::call(exports[1],nullptr,0);});
  rejects([&]{zinc::Modules::call(exports[2],nullptr,0);});
  struct Context {const ZincHost* host;ZincHandle handle;std::string text;bool* destroyed;};
  bool destroyed=false;
  auto* context=new Context{&modules.host,0,"callback survives cancellation",&destroyed};
  auto* callback=new zinc::Callback{context,
    [](void* p,const ZincValue*,uint32_t,uint32_t,ZincValue* out,ZincError*)->int32_t {
      auto& c=*(Context*)p;c.host->resource_release(c.host->context,c.handle,nullptr);
      out->type=ZINC_STRING;out->as.string=c.text.data();out->length=(uint32_t)c.text.size();return ZINC_OK;
    },[](void* p){auto* c=(Context*)p;*c->destroyed=true;delete c;}};
  const auto handle=modules.resources.add(callback,zinc::callbackKind,[](void* p){delete (zinc::Callback*)p;});context->handle=handle;
  ZincValue result{};
  assert(modules.host.callback_invoke(&modules,handle,nullptr,0,ZINC_STRING,&result,nullptr)==ZINC_OK);
  assert(destroyed);assert(std::string(result.as.string,result.length)=="callback survives cancellation");
  assert(modules.host.callback_invoke(&modules,handle,nullptr,0,ZINC_STRING,&result,nullptr)==ZINC_BAD_ARGUMENT);
  std::shared_ptr<zinc::CallbackRef> retained;
  {
    zinc::Modules other;
    auto* empty=new zinc::Callback{nullptr,nullptr,[](void*){}};
    const auto h=other.resources.add(empty,zinc::callbackKind,[](void* p){delete (zinc::Callback*)p;});
    retained=std::make_shared<zinc::CallbackRef>(other.callbackLifetime,h);other.resources.release(h);
  }
  rejects([&]{retained->call(nullptr,0,ZINC_VOID);});retained.reset();
  m.name="zinc:version";m.version++;rejects([&]{modules.add(m);});
}
