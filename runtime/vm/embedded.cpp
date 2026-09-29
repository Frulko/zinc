// One implementation of validation, GC, dispatch and JIT for both integrations.
#define ZINC_VM_EMBEDDED
#include "main.cpp"
#include "../include/zinc_vm.h"

struct ZincVM {
  VM vm;
  std::unique_ptr<Jit> code;
  uint32_t entry=0,timeout;
  bool useJit;
  std::string text;
  std::vector<std::vector<uint32_t>> parameters;
  std::vector<ZincVMExport> exports;
  enum State { Empty, Loaded, Ready, Entered, Failed } state=Empty;
  explicit ZincVM(const ZincVMOptions& o):vm(o.heap_bytes,o.register_stack_bytes/sizeof(Reg)),timeout(o.timeout_ms),useJit(o.jit) {}
};
namespace {
int32_t embeddedError(ZincError* out,const char* message,int32_t status=ZINC_HOST_ERROR) noexcept {
  static thread_local std::string text;
  try {text=message;if(out)*out={text.data(),(uint32_t)text.size()};}
  catch(...) {if(out)*out={"embedded VM failure",19};}
  return status;
}
template<class F> int32_t embeddedCall(ZincError* error,F&& action) noexcept {
  if(error)*error={nullptr,0};
  try {action();return ZINC_OK;}
  catch(const std::exception& e){return embeddedError(error,e.what());}
  catch(...){return embeddedError(error,"embedded VM failure");}
}
size_t findExport(ZincVM* context,const char* name) {
  if(!context || !name || (context->state!=ZincVM::Loaded && context->state!=ZincVM::Ready))throw std::runtime_error("embedded VM is not ready");
  for(size_t j=0;j<context->exports.size();j++)if(context->vm.exports[j].name==name)return j;
  throw std::runtime_error("VM export not found");
}
size_t entryExport(ZincVM* context,const char* name,uint32_t kind) {
  const auto index=findExport(context,name);
  if(context->state!=ZincVM::Ready)throw std::runtime_error("embedded VM must be initialized before entry");
  if(context->exports[index].kind!=kind)throw std::runtime_error("VM export kind mismatch");
  return index;
}
void scalarArgument(const ZincValue& value,uint32_t type) {
  if(value.type!=type || type>ZINC_STRING || (type==ZINC_STRING && value.length && !value.as.string) || (type==ZINC_BOOL && value.as.unsigned_integer>1))
    throw std::runtime_error("invalid VM scalar argument");
}
void scalarResult(ZincVM& context,Reg value,uint32_t type,ZincValue& out) {
  out={type,0,{}};
  if(type==ZINC_STRING) {context.text.assign(string(value).ptr(),string(value).bytes());out.as.string=context.text.data();out.length=(uint32_t)context.text.size();}
  else if(type==ZINC_I32)out.as.integer=value.i;
  else if(type==ZINC_U32 || type==ZINC_BOOL)out.as.unsigned_integer=value.u;
  else if(type!=ZINC_VOID)out.as.number=value.f;
}
void entryDeadline(ZincVM& context) {
  auto& vm=context.vm;
  vm.ticks=0;vm.jitBudget=4096;
  if(vm.interrupted.load(std::memory_order_relaxed))throw std::runtime_error("execution interrupted");
  vm.deadline=context.timeout?std::chrono::steady_clock::now()+std::chrono::milliseconds(context.timeout):std::chrono::steady_clock::time_point::max();
}
void finishEntry(ZincVM& context) {
  if(context.vm.interrupted.load(std::memory_order_relaxed))throw std::runtime_error("execution interrupted");
  if(std::chrono::steady_clock::now()>context.vm.deadline)throw std::runtime_error("execution timed out");
  context.state=ZincVM::Ready;
}

}
extern "C" {
ZincVM* zinc_vm_create(const ZincVMOptions* options,ZincError* error) {
  ZincVM* result=nullptr;
  embeddedCall(error,[&]{
    const ZincVMOptions defaults={ZINC_VM_API_VERSION,sizeof(ZincVMOptions),16u<<20,8u<<20,1000,0};
    const auto& o=options?*options:defaults;
    if(o.version!=ZINC_VM_API_VERSION || o.size!=sizeof(ZincVMOptions) || o.heap_bytes<4096 || o.heap_bytes>(1u<<30) || o.register_stack_bytes<4096 || o.register_stack_bytes>(64u<<20) || o.timeout_ms>86400000 || o.jit>1)
      throw std::runtime_error("invalid embedded VM options");
    result=new ZincVM(o);
  });
  return result;
}
const ZincHost* zinc_vm_host(ZincVM* context) {return context?&context->vm.modules.host:nullptr;}
int32_t zinc_vm_register(ZincVM* context,const ZincModule* module,ZincError* error) {
  return embeddedCall(error,[&]{
    if(!context || !module || context->state!=ZincVM::Empty)throw std::runtime_error("native modules must be registered before loading bytecode");
    context->vm.modules.add(*module);
  });
}
int32_t zinc_vm_load(ZincVM* context,const void* bytes,size_t length,ZincError* error) {
  return embeddedCall(error,[&]{
    if(!context || context->state!=ZincVM::Empty)throw std::runtime_error("embedded VM already loaded or failed");
    context->state=ZincVM::Failed;
    if(!bytes || length<4 || length>(64u<<20))throw std::runtime_error("invalid bytecode buffer");
    Reader reader;reader.bytes.assign((const uint8_t*)bytes,(const uint8_t*)bytes+length);
    context->entry=load(context->vm,std::move(reader));
    for(const auto& fn:context->vm.fns)if(fn.types.size()>context->vm.stack.size())throw std::runtime_error("VM register stack overflow");
    if(context->useJit) {
      context->vm.deadline=context->timeout?std::chrono::steady_clock::now()+std::chrono::milliseconds(context->timeout):std::chrono::steady_clock::time_point::max();
      context->code=std::make_unique<Jit>(context->vm);
    }
    context->parameters.resize(context->vm.exports.size());
    for(size_t j=0;j<context->vm.exports.size();j++) {
      const auto& e=context->vm.exports[j];auto& params=context->parameters[j];
      if(e.kind==ZINC_VM_FUNCTION)for(auto p:context->vm.fns[e.index].params)params.push_back(context->vm.fns[e.index].types[p]);
      context->exports.push_back({e.name.c_str(),e.kind,e.kind==ZINC_VM_FUNCTION?context->vm.fns[e.index].ret:context->vm.gt[e.index],params.data(),(uint32_t)params.size(),e.writable});
    }
    context->state=ZincVM::Loaded;
  });
}
int32_t zinc_vm_run(ZincVM* context,ZincError* error) {
  return embeddedCall(error,[&]{
    if(!context || context->state!=ZincVM::Loaded)throw std::runtime_error("embedded VM must be loaded and can run only once");
    context->state=ZincVM::Failed;
    auto& vm=context->vm;
    entryDeadline(*context);
    execute(vm,context->entry,vm.stack.data());drainJobs(vm);
    finishEntry(*context);
  });
}
int32_t zinc_vm_lookup(ZincVM* context,const char* name,ZincVMExport* out,ZincError* error) {
  return embeddedCall(error,[&]{if(!out)throw std::runtime_error("missing VM export result");const auto index=findExport(context,name);*out=context->exports[index];});
}
int32_t zinc_vm_call(ZincVM* context,const char* name,const ZincValue* args,uint32_t count,ZincValue* out,ZincError* error) {
  return embeddedCall(error,[&]{
    const auto index=entryExport(context,name,ZINC_VM_FUNCTION);const auto& e=context->exports[index];
    if(!out || (count && !args) || count!=e.parameter_count)throw std::runtime_error("VM call arity mismatch");
    for(uint32_t j=0;j<count;j++)scalarArgument(args[j],e.parameters[j]);
    context->state=ZincVM::Failed;entryDeadline(*context);
    auto& vm=context->vm;const auto function=vm.exports[index].index;
    if(!vm.functionValues[function].h) {
      auto* closure=vm.allocate(vm.fns[function].closureLayout,0,nullptr);closure->function=function;vm.functionValues[function].h=closure;
    }
    context->state=ZincVM::Entered;
    GuestCallback callback{&vm,vm.functionValues[function].h};ZincError failure{};
    const auto status=invokeCallback(&callback,args,count,e.type,out,&failure);
    context->state=ZincVM::Failed;
    if(status!=ZINC_OK && !callback.guestError)throw std::runtime_error(callback.error);
    if(status==ZINC_OK) {
      if(e.type==ZINC_STRING){context->text=callback.text;out->as.string=context->text.data();}
      else out->length=0;
    }
    drainJobs(vm);finishEntry(*context);
    if(status!=ZINC_OK)throw std::runtime_error(callback.error);
  });
}
int32_t zinc_vm_get(ZincVM* context,const char* name,ZincValue* out,ZincError* error) {
  return embeddedCall(error,[&]{
    const auto index=entryExport(context,name,ZINC_VM_GLOBAL);
    if(!out)throw std::runtime_error("missing VM get result");
    context->state=ZincVM::Failed;entryDeadline(*context);
    scalarResult(*context,context->vm.globals[context->vm.exports[index].index],context->exports[index].type,*out);
    finishEntry(*context);
  });
}
int32_t zinc_vm_set(ZincVM* context,const char* name,const ZincValue* value,ZincError* error) {
  return embeddedCall(error,[&]{
    const auto index=entryExport(context,name,ZINC_VM_GLOBAL);const auto& e=context->exports[index];
    if(!value || !e.writable)throw std::runtime_error("VM global export is read-only or missing a value");
    scalarArgument(*value,e.type);
    context->state=ZincVM::Failed;entryDeadline(*context);Reg result;
    if(e.type==ZINC_STRING)result.h=context->vm.keepString(value->as.string,value->length);
    else if(e.type==ZINC_I32)result.i=value->as.integer;
    else if(e.type==ZINC_U32 || e.type==ZINC_BOOL)result.u=value->as.unsigned_integer;
    else result=::value(value->as.number,e.type);
    context->vm.globals[context->vm.exports[index].index]=result;finishEntry(*context);
  });
}
void zinc_vm_interrupt(ZincVM* context) {if(context)context->vm.interrupted.store(true,std::memory_order_relaxed);}
size_t zinc_vm_memory_used(const ZincVM* context) {return context?context->vm.heapBytes:0;}
void zinc_vm_destroy(ZincVM* context) {delete context;}
}
