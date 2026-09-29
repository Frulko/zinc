#pragma once
#include "../include/zinc_abi.h"
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>
#include <memory>
#include <dlfcn.h>
#include "resources.h"

namespace zinc {
struct RecordSnapshot {
  std::vector<ZincValue> fields;std::vector<std::string> strings;
  explicit RecordSnapshot(const ZincValue& value) {
    if(value.length)fields.assign(value.as.record,value.as.record+value.length);
    strings.reserve(fields.size());
    for(auto& field:fields)if(field.type==ZINC_STRING){strings.emplace_back(field.as.string?field.as.string:"",field.length);field.as.string=strings.back().data();}
  }
};
struct NativeFailure : std::runtime_error {using std::runtime_error::runtime_error;};
constexpr uint64_t callbackKind=ZINC_RESOURCE_CALLBACK;
struct Callback {
  void* context;
  int32_t (*invoke)(void*,const ZincValue*,uint32_t,uint32_t,ZincValue*,ZincError*);
  void (*destroy)(void*);
  ~Callback(){destroy(context);}
};
struct CallbackLifetime { const ZincHost* host; };
struct CallbackRef {
  std::shared_ptr<CallbackLifetime> lifetime;ZincHandle handle;
  CallbackRef(std::shared_ptr<CallbackLifetime> owner,ZincHandle value):lifetime(std::move(owner)),handle(value) {
    const auto* host=lifetime->host;
    if(!host || host->resource_retain(host->context,handle,nullptr)!=ZINC_OK)throw std::runtime_error("invalid native callback");
  }
  ~CallbackRef(){if(const auto* host=lifetime->host)host->resource_release(host->context,handle,nullptr);}
  CallbackRef(const CallbackRef&)=delete;
  ZincValue call(const ZincValue* args,uint32_t count,uint32_t result) const {
    const auto* host=lifetime->host;if(!host)throw std::runtime_error("native callback runtime is disposed");
    ZincValue out{};ZincError error{};
    if(host->callback_invoke(host->context,handle,args,count,result,&out,&error)!=ZINC_OK)
      throw std::runtime_error(error.data?std::string(error.data,error.length):"native callback failed");
    return out;
  }
};
struct HandleScope {
  const ZincHost& host;std::vector<ZincHandle> handles;
  ~HandleScope(){for(auto h:handles)host.resource_release(host.context,h,nullptr);}
  void add(ZincHandle handle) {
    try {handles.push_back(handle);}catch(...){host.resource_release(host.context,handle,nullptr);throw;}
  }
};
// Per-runtime allow-list. Imports can only see modules explicitly registered by the host.
class Modules {
  struct Entry { const ZincModule* module; void* library; };
  std::vector<Entry> modules;
  template<class F> static int32_t resourceOperation(ZincError* error,F&& f) noexcept {
    try { f();return ZINC_OK; }
    catch(const std::bad_alloc&) { if(error)*error={"native resource allocation failed",33};return ZINC_HOST_ERROR; }
    catch(...) { if(error)*error={"invalid native resource operation",33};return ZINC_BAD_ARGUMENT; }
  }
public:
  Resources resources;
  const ZincHost host={ZINC_ABI_VERSION,sizeof(ZincHost),this,
    [](void* p,void* value,uint64_t type,void(*destroy)(void*),ZincHandle* out,ZincError* error)->int32_t {
      if(!out || type==callbackKind)return ZINC_BAD_ARGUMENT;
      return resourceOperation(error,[&]{*out=((Modules*)p)->resources.add(value,type,destroy);});
    },
    [](void* p,ZincHandle handle,uint64_t type,void** out,ZincError* error)->int32_t {
      if(!out || type==callbackKind)return ZINC_BAD_ARGUMENT;
      return resourceOperation(error,[&]{*out=((Modules*)p)->resources.get(handle,type);});
    },
    [](void* p,ZincHandle handle,ZincError* error)->int32_t {return resourceOperation(error,[&]{((Modules*)p)->resources.retain(handle);});},
    [](void* p,ZincHandle handle,ZincError* error)->int32_t {return resourceOperation(error,[&]{((Modules*)p)->resources.release(handle);});},
    [](void* p,ZincHandle handle,const ZincValue* args,uint32_t count,uint32_t result,ZincValue* out,ZincError* error)->int32_t {
      ZincError ignored{};if(!error)error=&ignored;
      int32_t status=ZINC_BAD_ARGUMENT;
      const auto checked=resourceOperation(error,[&]{
        if(!handle || !out || (count && !args) || result>ZINC_STRING)throw std::runtime_error("invalid callback signature");
        for(uint32_t j=0;j<count;j++)if(!args[j].type || args[j].type>ZINC_STRING || (args[j].type==ZINC_STRING && args[j].length && !args[j].as.string))throw std::runtime_error("invalid callback argument");
        auto& registry=*(Modules*)p;HandleScope active{registry.host};
        registry.resources.retain(handle);active.add(handle);
        auto* callback=(Callback*)registry.resources.get(handle,callbackKind);
        status=callback->invoke(callback->context,args,count,result,out,error);
        // A callback can cancel itself. Copy borrowed bytes before releasing the
        // active reference, which may destroy its last engine root.
        static thread_local std::string bytes;
        if(status==ZINC_OK) {
          if(out->type!=result || (result==ZINC_STRING && out->length && !out->as.string))throw std::runtime_error("invalid callback result");
          if(result==ZINC_STRING){bytes.assign(out->as.string?out->as.string:"",out->length);out->as.string=bytes.data();}
        } else if(error && error->data) {bytes.assign(error->data,error->length);error->data=bytes.data();}
      });return checked==ZINC_OK?status:checked;
    }
  };
  const std::shared_ptr<CallbackLifetime> callbackLifetime=std::make_shared<CallbackLifetime>(CallbackLifetime{&host});
  Modules()=default;
  Modules(const Modules&)=delete;Modules& operator=(const Modules&)=delete;
  ~Modules() {
    resources.close();
    while(!modules.empty()) {
      const auto entry=modules.back();modules.pop_back();
      if(entry.module->dispose)entry.module->dispose(entry.module->context);
      if(entry.library)dlclose(entry.library);
    }
    callbackLifetime->host=nullptr;
  }
  void add(const ZincModule& m) {
    if (m.version != ZINC_ABI_VERSION || m.size != sizeof(ZincModule) || !m.name || !*m.name || (m.export_count && !m.exports))
      throw std::runtime_error("invalid native module ABI");
    if (find(m.name)) throw std::runtime_error("duplicate native module");
    for (uint32_t i = 0; i < m.export_count; ++i) {
      const auto& f = m.exports[i];
      if (!f.name || !*f.name || !f.invoke || (f.result > ZINC_RESOURCE && f.result != ZINC_BYTES && f.result != ZINC_RECORD) || (f.parameter_count && !f.parameters))
        throw std::runtime_error("invalid native export");
      if ((f.result==ZINC_RECORD) != (f.result_record!=nullptr))throw std::runtime_error("invalid native record descriptor");
      if(f.result_record) {
        const auto& record=*f.result_record;
        if(record.field_count>256 || (record.field_count && !record.fields))throw std::runtime_error("invalid native record descriptor");
        for(uint32_t j=0;j<record.field_count;j++) {
          const auto& field=record.fields[j];
          if(!field.name || !*field.name || !field.type || field.type>ZINC_STRING)throw std::runtime_error("invalid native record field");
          for(uint32_t k=0;k<j;k++)if(!strcmp(field.name,record.fields[k].name))throw std::runtime_error("duplicate native record field");
        }
      }
      for (uint32_t j = 0; j < f.parameter_count; ++j)
        if (!f.parameters[j] || (f.parameters[j] > ZINC_BYTES && f.parameters[j] != ZINC_NUMBERS)) throw std::runtime_error("invalid native parameter type");
      for (uint32_t j = 0; j < i; ++j)
        if (!strcmp(f.name, m.exports[j].name)) throw std::runtime_error("duplicate native export");
    }
    modules.push_back({&m,nullptr});
  }
  const ZincModule* find(const char* name) const {
    for (auto entry : modules) if (!strcmp(entry.module->name, name)) return entry.module;
    return nullptr;
  }
  const ZincExport& resolve(const char* module, const char* name) const {
    if (const auto* m = find(module)) for (uint32_t i = 0; i < m->export_count; ++i)
      if (!strcmp(m->exports[i].name, name)) return m->exports[i];
    throw std::runtime_error(std::string("native import not registered: ") + module + "/" + name);
  }
  void require(const char* module,const ZincExport& expected) const {
    const auto& actual=resolve(module,expected.name);
    if(actual.result!=expected.result || actual.parameter_count!=expected.parameter_count)
      throw std::runtime_error("native import signature mismatch");
    if(expected.result==ZINC_RECORD) {
      if(!actual.result_record || !expected.result_record || actual.result_record->field_count!=expected.result_record->field_count)throw std::runtime_error("native record signature mismatch");
      for(uint32_t j=0;j<actual.result_record->field_count;j++) {
        const auto& a=actual.result_record->fields[j];const auto& b=expected.result_record->fields[j];
        if(a.type!=b.type || strcmp(a.name,b.name))throw std::runtime_error("native record signature mismatch");
      }
    }
    for(uint32_t j=0;j<actual.parameter_count;j++)if(actual.parameters[j]!=expected.parameters[j])throw std::runtime_error("native import signature mismatch");
  }
  void load(const char* path) {
    struct Library { void* handle;~Library(){if(handle)dlclose(handle);} } library{dlopen(path,RTLD_NOW|RTLD_LOCAL)};
    if(!library.handle)throw std::runtime_error(std::string("cannot load native library: ")+dlerror());
    dlerror();auto open=reinterpret_cast<ZincModuleOpen>(dlsym(library.handle,"zinc_module_open"));
    if(const char* error=dlerror())throw std::runtime_error(std::string("native library entry: ")+error);
    if(!open)throw std::runtime_error("native library entry is null");
    const ZincModule* module=nullptr;ZincError error{};
    if(open(ZINC_ABI_VERSION,&host,&module,&error)!=ZINC_OK)throw std::runtime_error(error.data?std::string(error.data,error.length):"native module initialization failed");
    if(!module)throw std::runtime_error("native module initialization returned null");
    try { add(*module); }
    catch(...) { if(module->version==ZINC_ABI_VERSION && module->size==sizeof(ZincModule) && module->dispose)module->dispose(module->context);throw; }
    modules.back().library=library.handle;library.handle=nullptr;
  }
  static ZincValue call(const ZincExport& f, const ZincValue* args, uint32_t count) {
    if (count != f.parameter_count || (count && !args)) throw std::runtime_error("native argument count mismatch");
    for (uint32_t i = 0; i < count; ++i)
      if (args[i].type != f.parameters[i] || (args[i].type == ZINC_STRING && args[i].length && !args[i].as.string) || ((args[i].type == ZINC_RESOURCE || args[i].type == ZINC_CALLBACK) && !args[i].as.handle) || (args[i].type == ZINC_BYTES && (args[i].length > INT32_MAX || (args[i].length && !args[i].as.bytes))) || (args[i].type == ZINC_NUMBERS && (args[i].length > INT32_MAX || (args[i].length && !args[i].as.numbers))))
        throw std::runtime_error("native argument type mismatch");
    ZincValue result{}; ZincError error{};
    if (f.invoke(f.context, args, count, &result, &error) != ZINC_OK)
      throw NativeFailure(error.data ? std::string(error.data, error.length) : "native call failed");
    if (result.type != f.result || (result.type == ZINC_STRING && result.length && !result.as.string) || (result.type == ZINC_BYTES && (result.length > INT32_MAX || (result.length && !result.as.bytes))))
      throw std::runtime_error("native result type mismatch");
    if(result.type==ZINC_RECORD) {
      if(!f.result_record || result.length!=f.result_record->field_count || (result.length && !result.as.record))throw std::runtime_error("native record result mismatch");
      for(uint32_t j=0;j<result.length;j++) {
        const auto& field=result.as.record[j];
        if(field.type!=f.result_record->fields[j].type || (field.type==ZINC_STRING && field.length && !field.as.string))throw std::runtime_error("native record field type mismatch");
      }
    }
    return result;
  }
};
struct RunnerOptions {
  bool jit=false;
  std::vector<const char*> libraries;
  RunnerOptions(int argc,char** argv,bool supportsJit) {
    if(argc<2)throw std::runtime_error("runner requires a program path");
    for(int j=2;j<argc;j++) {
      if(supportsJit && !strcmp(argv[j],"--jit"))jit=true;
      else if(!strcmp(argv[j],"--native-library") && j+1<argc)libraries.push_back(argv[++j]);
      else throw std::runtime_error(std::string("invalid runner option: ")+argv[j]);
    }
  }
  void load(Modules& modules)const { for(auto* file:libraries)modules.load(file); }
};
}
