// Host-side QuickJS runner. Shares the native module registry and C ABI with Zinc VM.
#include "abi.h"
#include "execution_limits.h"
#include "../zrt.h"
#include "host_loop.h"
#include "../../plugins/script/vendor/quickjs/quickjs.h"
#include <fstream>
#include <iterator>
#include <chrono>
#include <thread>
#include <cstdio>
#include <cmath>
#include <cstdlib>
#include <algorithm>
#include <unordered_map>
#include <memory>
#ifdef ZINC_GENERATED_ABI
#include ZINC_GENERATED_ABI
#else
static void registerGeneratedModules(zinc::Modules&) {}
#endif
extern char** environ;
namespace {
using Clock=std::chrono::steady_clock;
struct Timer { int id; JSValue fn; Clock::time_point at; double repeat; };
struct Host {
  int nativeDepth=0;
  bool pumpingNative=false;
  zinc::Modules modules;
  JSClassID resourceClass=0;
  // Non-owning cache: each wrapper removes itself in its finalizer.
  std::unordered_map<ZincHandle,JSValue> resourceObjects;
  std::vector<const ZincExport*> exports;
  std::vector<Timer> timers;
  std::vector<std::pair<JSValue,JSValue>> rejected;
  int next=0, exitCode=0; bool exiting=false;
  Clock::time_point start=Clock::now(), deadline=start+std::chrono::seconds(60);
};
Host& host(JSContext* c) { return *(Host*)JS_GetContextOpaque(c); }
std::string read(const char* file) {
  std::ifstream in(file,std::ios::binary);
  if(!in) throw std::runtime_error(std::string("cannot load module: ")+file);
  return std::string(std::istreambuf_iterator<char>(in),{});
}
struct Resource { Host* host;ZincHandle handle; };
void finalizeResource(JSRuntime* rt,JSValue value) {
  auto& h=*(Host*)JS_GetRuntimeOpaque(rt);
  auto* resource=(Resource*)JS_GetOpaque(value,h.resourceClass);
  if(!resource)return;
  h.resourceObjects.erase(resource->handle);
  h.modules.host.resource_release(h.modules.host.context,resource->handle,nullptr);delete resource;
}
JSValue resourceValue(JSContext* ctx,ZincHandle handle) {
  auto& h=host(ctx);
  struct Incoming { const ZincHost& host;ZincHandle handle;~Incoming(){if(handle)host.resource_release(host.context,handle,nullptr);} } incoming{h.modules.host,handle};
  h.modules.resources.check(handle);
  if(!handle)return JS_NULL;
  if(auto found=h.resourceObjects.find(handle);found!=h.resourceObjects.end())return JS_DupValue(ctx,found->second);
  auto resource=std::make_unique<Resource>(Resource{&h,handle});
  JSValue object=JS_NewObjectClass(ctx,h.resourceClass);
  if(JS_IsException(object))return object;
  try { h.resourceObjects.emplace(handle,object); }
  catch(...) { JS_FreeValue(ctx,object);throw; }
  JS_SetOpaque(object,resource.release());incoming.handle=0;return object;
}
struct GuestCallback {
  JSContext* ctx;JSValue fn;std::string text,error;
  ~GuestCallback(){JS_FreeValue(ctx,fn);}
};
int32_t invokeCallback(void* context,const ZincValue* args,uint32_t count,uint32_t type,ZincValue* out,ZincError* error) {
  auto& callback=*(GuestCallback*)context;auto* ctx=callback.ctx;
  struct Values { JSContext* ctx;std::vector<JSValue> args;JSValue result=JS_UNDEFINED;~Values(){for(auto v:args)JS_FreeValue(ctx,v);JS_FreeValue(ctx,result);} } values{ctx};
  try {
    values.args.reserve(count);
    for(uint32_t j=0;j<count;j++) {
      const auto& a=args[j];JSValue value;
      switch(a.type) {
        case ZINC_STRING:value=JS_NewStringLen(ctx,a.as.string?a.as.string:"",a.length);break;
        case ZINC_BOOL:value=JS_NewBool(ctx,a.as.unsigned_integer!=0);break;
        case ZINC_I32:value=JS_NewInt32(ctx,a.as.integer);break;
        case ZINC_U32:value=JS_NewUint32(ctx,a.as.unsigned_integer);break;
        default:value=JS_NewFloat64(ctx,a.type==ZINC_F32?(float)a.as.number:a.as.number);break;
      }
      values.args.push_back(value);if(JS_IsException(value))throw std::runtime_error("callback argument allocation failed");
    }
    values.result=JS_Call(ctx,callback.fn,JS_UNDEFINED,count,values.args.data());
    if(JS_IsException(values.result)) {
      JSValue exception=JS_GetException(ctx),message=JS_GetPropertyStr(ctx,exception,"message");
      const char* text=JS_ToCString(ctx,JS_IsUndefined(message)?exception:message);
      try {callback.error=text?text:"guest callback threw";}catch(...){JS_FreeCString(ctx,text);JS_FreeValue(ctx,message);JS_FreeValue(ctx,exception);throw;}
      JS_FreeCString(ctx,text);JS_FreeValue(ctx,message);JS_FreeValue(ctx,exception);
      *error={callback.error.data(),(uint32_t)callback.error.size()};return ZINC_HOST_ERROR;
    }
    if(JS_PromiseState(ctx,values.result)!=JS_PROMISE_NOT_A_PROMISE)throw std::runtime_error("async native callbacks are not supported");
    out->type=type;
    if(type==ZINC_STRING) {
      size_t length;const char* text=JS_ToCStringLen(ctx,&length,values.result);if(!text)throw std::runtime_error("callback result conversion failed");
      try{callback.text.assign(text,length);}catch(...){JS_FreeCString(ctx,text);throw;}JS_FreeCString(ctx,text);
      out->as.string=callback.text.data();out->length=(uint32_t)callback.text.size();
    } else if(type==ZINC_BOOL) {const int v=JS_ToBool(ctx,values.result);if(v<0)throw std::runtime_error("callback result conversion failed");out->as.unsigned_integer=v;}
    else if(type==ZINC_I32) {if(JS_ToInt32(ctx,&out->as.integer,values.result))throw std::runtime_error("callback result conversion failed");}
    else if(type==ZINC_U32) {if(JS_ToUint32(ctx,&out->as.unsigned_integer,values.result))throw std::runtime_error("callback result conversion failed");}
    else if(type!=ZINC_VOID) {if(JS_ToFloat64(ctx,&out->as.number,values.result))throw std::runtime_error("callback result conversion failed");if(type==ZINC_F32)out->as.number=(float)out->as.number;}
    if(host(ctx).pumpingNative && !host(ctx).nativeDepth) {
      const auto text=callback.text;JSContext* job=ctx;int n;
      while((n=JS_ExecutePendingJob(JS_GetRuntime(ctx),&job))>0 && !host(ctx).exiting){}
      if(n<0)throw std::runtime_error("guest callback microtask failed");
      if(type==ZINC_STRING){callback.text=text;out->as.string=callback.text.data();out->length=(uint32_t)callback.text.size();}
    }
    return ZINC_OK;
  } catch(const std::exception& e) {
    JSValue exception=JS_GetException(ctx);JS_FreeValue(ctx,exception);
    callback.error=e.what();*error={callback.error.data(),(uint32_t)callback.error.size()};return ZINC_HOST_ERROR;
  }
}
ZincHandle callbackHandle(JSContext* ctx,JSValueConst fn) {
  if(!JS_IsFunction(ctx,fn))throw std::runtime_error("native callback must be a function");
  auto value=std::make_unique<GuestCallback>();value->ctx=ctx;value->fn=JS_DupValue(ctx,fn);
  auto callback=std::unique_ptr<zinc::Callback>(new zinc::Callback{value.get(),invokeCallback,[](void* p){delete (GuestCallback*)p;}});
  value.release();
  const auto handle=host(ctx).modules.resources.add(callback.get(),zinc::callbackKind,[](void* p){delete (zinc::Callback*)p;});callback.release();return handle;
}
JSValue nativeCall(JSContext* ctx,JSValueConst,int argc,JSValueConst* argv,int,JSValue* data) {
  try {
    int32_t id; JS_ToInt32(ctx,&id,data[0]);
    auto& h=host(ctx); if(id<0 || (size_t)id>=h.exports.size()) return JS_ThrowInternalError(ctx,"invalid native export");
    const auto& f=*h.exports[id];
    struct NativeDepth { Host& host;NativeDepth(Host& h):host(h){++host.nativeDepth;}~NativeDepth(){--host.nativeDepth;} } depth(h);
    if((uint32_t)argc!=f.parameter_count) return JS_ThrowTypeError(ctx,"%s: expected %u arguments",f.name,f.parameter_count);
    std::vector<std::vector<double>> numberArgs;numberArgs.reserve(argc);
    std::vector<std::vector<uint8_t>> byteArgs;byteArgs.reserve(argc);
    std::vector<ZincValue> args(argc);std::vector<std::string> strings;strings.reserve(argc);zinc::HandleScope callbacks{h.modules.host};
    for(int i=0;i<argc;i++) {
      auto& a=args[i]; a.type=f.parameters[i];
      if(a.type==ZINC_NUMBERS) {
        if(!JS_IsArray(argv[i]))return JS_ThrowTypeError(ctx,"native numeric argument must be number[]");
        JSValue length=JS_GetPropertyStr(ctx,argv[i],"length");uint32_t count=0;const int status=JS_ToUint32(ctx,&count,length);JS_FreeValue(ctx,length);
        if(status)return JS_EXCEPTION;if(count>INT32_MAX)return JS_ThrowRangeError(ctx,"native numeric array too large");
        numberArgs.emplace_back();auto& numbers=numberArgs.back();numbers.reserve(count);
        for(uint32_t j=0;j<count;j++) {
          JSValue item=JS_GetPropertyUint32(ctx,argv[i],j);double value;
          if(JS_IsException(item))return item;
          if(!JS_IsNumber(item)){JS_FreeValue(ctx,item);return JS_ThrowTypeError(ctx,"native numeric array contains a nonnumber");}
          const int error=JS_ToFloat64(ctx,&value,item);JS_FreeValue(ctx,item);if(error)return JS_EXCEPTION;numbers.push_back(value);
        }
        a.as.numbers=numbers.data();a.length=count;
      } else if(a.type==ZINC_BYTES) {
        if(!JS_IsArray(argv[i]))return JS_ThrowTypeError(ctx,"native byte argument must be u8[]");
        JSValue length=JS_GetPropertyStr(ctx,argv[i],"length");uint32_t count=0;const int status=JS_ToUint32(ctx,&count,length);JS_FreeValue(ctx,length);
        if(status)return JS_EXCEPTION;if(count>INT32_MAX)return JS_ThrowRangeError(ctx,"native byte array too large");
        byteArgs.emplace_back();auto& bytes=byteArgs.back();bytes.reserve(count);
        for(uint32_t j=0;j<count;j++) {
          JSValue item=JS_GetPropertyUint32(ctx,argv[i],j);double number=0;
          const int error=JS_ToFloat64(ctx,&number,item);JS_FreeValue(ctx,item);if(error)return JS_EXCEPTION;
          if(!(number>=0 && number<=255 && trunc(number)==number))return JS_ThrowTypeError(ctx,"native byte argument outside u8 range");
          bytes.push_back((uint8_t)number);
        }
        a.as.bytes=bytes.data();a.length=count;
      } else if(a.type==ZINC_CALLBACK) { a.as.handle=callbackHandle(ctx,argv[i]);callbacks.add(a.as.handle); } else if(a.type==ZINC_RESOURCE) {
        if(JS_IsNull(argv[i]))a.as.handle=0;
        else { auto* resource=(Resource*)JS_GetOpaque2(ctx,argv[i],h.resourceClass);if(!resource)return JS_EXCEPTION;a.as.handle=resource->handle; }
        h.modules.resources.check(a.as.handle);
      } else if(a.type==ZINC_STRING) {
        size_t n; const char* s=JS_ToCStringLen(ctx,&n,argv[i]); if(!s)return JS_EXCEPTION;
        strings.emplace_back(s,n);JS_FreeCString(ctx,s);a.as.string=strings.back().data();a.length=(uint32_t)n;
      } else if(a.type==ZINC_BOOL) { int v=JS_ToBool(ctx,argv[i]);if(v<0)return JS_EXCEPTION;a.as.unsigned_integer=v; }
      else if(a.type==ZINC_I32) { if(JS_ToInt32(ctx,&a.as.integer,argv[i]))return JS_EXCEPTION; }
      else if(a.type==ZINC_U32) { if(JS_ToUint32(ctx,&a.as.unsigned_integer,argv[i]))return JS_EXCEPTION; }
      else { if(JS_ToFloat64(ctx,&a.as.number,argv[i]))return JS_EXCEPTION;if(a.type==ZINC_F32)a.as.number=(float)a.as.number; }
    }
    const auto r=zinc::Modules::call(f,args.data(),argc);
    switch(r.type) {
      case ZINC_RECORD: {
        zinc::RecordSnapshot record(r);JSValue object=JS_NewObject(ctx);if(JS_IsException(object))return object;
        for(uint32_t j=0;j<record.fields.size();j++) {
          const auto field=record.fields[j];JSValue value;
          if(field.type==ZINC_STRING)value=JS_NewStringLen(ctx,field.as.string,field.length);
          else if(field.type==ZINC_BOOL)value=JS_NewBool(ctx,field.as.unsigned_integer!=0);
          else if(field.type==ZINC_I32)value=JS_NewInt32(ctx,field.as.integer);
          else if(field.type==ZINC_U32)value=JS_NewUint32(ctx,field.as.unsigned_integer);
          else value=JS_NewFloat64(ctx,field.as.number);
          if(JS_IsException(value) || JS_DefinePropertyValueStr(ctx,object,f.result_record->fields[j].name,value,JS_PROP_C_W_E)<0){JS_FreeValue(ctx,object);return JS_EXCEPTION;}
        }
        return object;
      }
      case ZINC_BYTES: {
        std::vector<uint8_t> bytes;if(r.length)bytes.assign(r.as.bytes,r.as.bytes+r.length);
        JSValue array=JS_NewArray(ctx);if(JS_IsException(array))return array;
        for(uint32_t j=0;j<bytes.size();j++)if(JS_SetPropertyUint32(ctx,array,j,JS_NewUint32(ctx,bytes[j]))<0){JS_FreeValue(ctx,array);return JS_EXCEPTION;}
        return array;
      }
      case ZINC_RESOURCE:return resourceValue(ctx,r.as.handle);
      case ZINC_VOID:return JS_UNDEFINED;
      case ZINC_BOOL:return JS_NewBool(ctx,r.as.unsigned_integer!=0);
      case ZINC_I32:return JS_NewInt32(ctx,r.as.integer);
      case ZINC_U32:return JS_NewUint32(ctx,r.as.unsigned_integer);
      case ZINC_STRING:return JS_NewStringLen(ctx,r.as.string?r.as.string:"",r.length);
      default:return JS_NewFloat64(ctx,r.as.number);
    }
  } catch(const zinc::NativeFailure& e) {
    JSValue error=JS_NewError(ctx);JS_SetPropertyStr(ctx,error,"message",JS_NewString(ctx,e.what()));return JS_Throw(ctx,error);
  } catch(const std::exception& e) { return JS_ThrowInternalError(ctx,"%s",e.what()); }
}
int initModule(JSContext* ctx,JSModuleDef* m) {
  auto atom=JS_GetModuleName(ctx,m);const char* name=JS_AtomToCString(ctx,atom);
  const auto* mod=name?host(ctx).modules.find(name):nullptr; JS_FreeCString(ctx,name);JS_FreeAtom(ctx,atom);
  if(!mod)return -1;
  JSValue object=JS_NewObject(ctx);
  for(uint32_t i=0;i<mod->export_count;i++) {
    const auto& f=mod->exports[i];auto& list=host(ctx).exports;
    JSValue id=JS_NewInt32(ctx,(int)list.size());list.push_back(&f);
    JSValue fn=JS_NewCFunctionData(ctx,nativeCall,f.parameter_count,0,1,&id);
    if(JS_IsException(fn) || JS_SetPropertyStr(ctx,object,f.name,JS_DupValue(ctx,fn))<0 || JS_SetModuleExport(ctx,m,f.name,fn)<0) { JS_FreeValue(ctx,object);return -1; }
  }
  return JS_SetModuleExport(ctx,m,"default",object);
}
JSModuleDef* loader(JSContext* ctx,const char* name,void*) {
  try {
    if(const auto* mod=host(ctx).modules.find(name)) {
      auto* m=JS_NewCModule(ctx,name,initModule);if(!m)return nullptr;
      for(uint32_t i=0;i<mod->export_count;i++) if(JS_AddModuleExport(ctx,m,mod->exports[i].name)<0)return nullptr;
      if(JS_AddModuleExport(ctx,m,"default")<0)return nullptr;return m;
    }
    if(strchr(name,':')) { JS_ThrowReferenceError(ctx,"module not registered in the native ABI: %s",name);return nullptr; }
    const auto src=read(name);
    JSValue v=JS_Eval(ctx,src.data(),src.size(),name,JS_EVAL_TYPE_MODULE|JS_EVAL_FLAG_COMPILE_ONLY);
    if(JS_IsException(v))return nullptr;
    auto* m=(JSModuleDef*)JS_VALUE_GET_PTR(v);JS_FreeValue(ctx,v);return m;
  } catch(const std::exception& e) { JS_ThrowReferenceError(ctx,"%s",e.what());return nullptr; }
}
JSValue service(JSContext* ctx,JSValueConst,int argc,JSValueConst* argv,int magic) {
  auto& h=host(ctx);
  if(magic==0 || magic==1) {
    if(argc) {size_t n;const char* s=JS_ToCStringLen(ctx,&n,argv[0]);if(!s)return JS_EXCEPTION;if(magic)hal_log_err(s,n);else hal_log(s,n);JS_FreeCString(ctx,s);}return JS_UNDEFINED;
  }
  if(magic==2)return JS_NewFloat64(ctx,zrt::now_ms());
  if(magic==3) { int32_t code=0;if(argc&&JS_ToInt32(ctx,&code,argv[0]))return JS_EXCEPTION;h.exitCode=code;h.exiting=true;return JS_ThrowInternalError(ctx,"process exited"); }
  if(magic==4) {
    if(!argc||!JS_IsFunction(ctx,argv[0]))return JS_ThrowTypeError(ctx,"timer callback must be a function");
    double ms=0;if(argc>1&&JS_ToFloat64(ctx,&ms,argv[1]))return JS_EXCEPTION;
    if(!std::isfinite(ms)||ms<0)ms=0;ms=std::min(ms,2147483647.);
    const bool repeat=argc>2&&JS_ToBool(ctx,argv[2])>0;if(repeat&&ms<1)ms=1;
    h.timers.push_back({++h.next,JS_DupValue(ctx,argv[0]),Clock::now()+std::chrono::milliseconds((int64_t)ms),repeat?ms:-1});
    return JS_NewInt32(ctx,h.next);
  }
  int32_t id=0;if(argc&&JS_ToInt32(ctx,&id,argv[0]))return JS_EXCEPTION;
  for(auto it=h.timers.begin();it!=h.timers.end();++it)if(it->id==id){JS_FreeValue(ctx,it->fn);h.timers.erase(it);break;}
  return JS_UNDEFINED;
}
void rejection(JSContext* c,JSValueConst p,JSValueConst reason,bool handled,void*) {
  auto& list=host(c).rejected;
  for(auto it=list.begin();it!=list.end();++it)if(JS_VALUE_GET_PTR(it->first)==JS_VALUE_GET_PTR(p)){JS_FreeValue(c,it->first);JS_FreeValue(c,it->second);list.erase(it);break;}
  if(!handled)list.emplace_back(JS_DupValue(c,p),JS_DupValue(c,reason));
}
void report(JSContext* c,JSValueConst e) {
  const char* s=JS_ToCString(c,e);fprintf(stderr,"quickjs: %s\n",s?s:"exception");JS_FreeCString(c,s);
  JSValue stack=JS_GetPropertyStr(c,e,"stack");if(JS_IsString(stack)){s=JS_ToCString(c,stack);if(s)fputs(s,stderr);JS_FreeCString(c,s);}JS_FreeValue(c,stack);
}
}
int main(int argc,char** argv) {
  if(argc<2){fputs("usage: zinc-quickjs program.mjs\n",stderr);return 2;}
  Host h;JSRuntime* rt=JS_NewRuntime();if(!rt)return 1;
  JS_SetRuntimeOpaque(rt,&h);JS_NewClassID(rt,&h.resourceClass);
  JSClassDef resourceClass{};resourceClass.class_name="NativeResource";resourceClass.finalizer=finalizeResource;
  if(JS_NewClass(rt,h.resourceClass,&resourceClass)<0){JS_FreeRuntime(rt);return 1;}
  JS_SetMemoryLimit(rt,512u<<20);JS_SetMaxStackSize(rt,1u<<20);
  JS_SetInterruptHandler(rt,[](JSRuntime*,void* p){auto& h=*(Host*)p;return int(h.exiting||Clock::now()>h.deadline);},&h);
  JSContext* c=JS_NewContext(rt);if(!c){JS_FreeRuntime(rt);return 1;}JS_SetContextOpaque(c,&h);
  JS_SetModuleLoaderFunc(rt,nullptr,loader,nullptr);JS_SetHostPromiseRejectionTracker(rt,rejection,nullptr);
  int status=0; JSValue result=JS_UNDEFINED;
  zinc::RunnerHost runnerHost(argc,argv);
  try {
    h.deadline=zinc::deadline();
    zinc::RunnerOptions options(argc,argv,false);options.load(h.modules);
    registerGeneratedModules(h.modules);
    JSValue g=JS_GetGlobalObject(c), env=JS_NewObject(c), hostObj=JS_NewObject(c);
    for(char** e=environ;*e;e++){const char* sep=strchr(*e,'=');if(sep){std::string k(*e,(size_t)(sep-*e));JS_SetPropertyStr(c,env,k.c_str(),JS_NewString(c,sep+1));}}
    JS_SetPropertyStr(c,hostObj,"env",env);
    const char* names[]={"write","writeErr","now","exit","timer","clear"};
    for(int i=0;i<6;i++)JS_SetPropertyStr(c,hostObj,names[i],JS_NewCFunctionMagic(c,service,names[i],1,JS_CFUNC_generic_magic,i));
    JS_SetPropertyStr(c,g,"__zincHost",hostObj);JS_FreeValue(c,g);
    const char* bootstrap=R"JS(
const H=globalThis.__zincHost;
globalThis.process={env:H.env,stdout:{isTTY:false,write:H.write},stderr:{isTTY:false,write:H.writeErr},on(){},exit:H.exit,getActiveResourcesInfo:()=>[]};
globalThis.performance={now:H.now};
Date.now=H.now;
globalThis.setTimeout=(f,ms,...args)=>H.timer(()=>f(...args),ms,false);
globalThis.setInterval=(f,ms,...args)=>H.timer(()=>f(...args),ms,true);
globalThis.setImmediate=(f,...args)=>H.timer(()=>f(...args),0,false);
globalThis.clearTimeout=globalThis.clearInterval=globalThis.clearImmediate=H.clear;
globalThis.queueMicrotask=f=>Promise.resolve().then(f);
globalThis.console={log:(...a)=>H.write(a.join(' ')+'\n'),error:(...a)=>H.writeErr(a.join(' ')+'\n')};
)JS";
    JSValue boot=JS_Eval(c,bootstrap,strlen(bootstrap),"<zinc-host>",JS_EVAL_TYPE_GLOBAL);
    if(JS_IsException(boot))throw std::runtime_error("bootstrap failed");JS_FreeValue(c,boot);
    auto source=read(argv[1]);result=JS_Eval(c,source.data(),source.size(),argv[1],JS_EVAL_TYPE_MODULE);
    if(JS_IsException(result)){if(!h.exiting){auto e=JS_GetException(c);report(c,e);JS_FreeValue(c,e);status=1;}}
    while(!status&&!h.exiting) {
      JSContext* jobContext=c;int n;
      while((n=JS_ExecutePendingJob(rt,&jobContext))>0&&!h.exiting){}
      if(n<0&&!h.exiting){auto e=JS_GetException(jobContext);report(jobContext,e);JS_FreeValue(jobContext,e);status=1;break;}
      h.pumpingNative=true;
      bool nativeFrame=false;
      const bool active=zrt::poll_host(nativeFrame);h.pumpingNative=false;
      if(nativeFrame && !active)break;
      if(JS_IsJobPending(rt))continue;
      if(h.timers.empty() && !active)break;
      const auto now=Clock::now();
      if(now>=h.deadline)throw std::runtime_error("execution timed out");
      auto it=std::min_element(h.timers.begin(),h.timers.end(),[](auto& a,auto& b){return a.at<b.at;});
      if(it==h.timers.end() || it->at>now) {
        if(active && nativeFrame)continue; // loop_once already paces graphics.
        auto wake=std::min(h.deadline,now+std::chrono::milliseconds(active?1:10));
        if(it!=h.timers.end())wake=std::min(wake,it->at);
        std::this_thread::sleep_until(wake);continue;
      }
      Timer t=*it;if(t.repeat<0)h.timers.erase(it);else{it->at+=std::chrono::milliseconds((int64_t)t.repeat);t.fn=JS_DupValue(c,t.fn);}
      if(t.at>h.deadline){JS_FreeValue(c,t.fn);throw std::runtime_error("timer exceeds execution deadline");}
      std::this_thread::sleep_until(t.at);auto r=JS_Call(c,t.fn,JS_UNDEFINED,0,nullptr);JS_FreeValue(c,t.fn);
      if(JS_IsException(r)&&!h.exiting){auto e=JS_GetException(c);report(c,e);JS_FreeValue(c,e);status=1;}JS_FreeValue(c,r);
    }
    if(!h.exiting&&!status) {
      if(JS_PromiseState(c,result)==JS_PROMISE_PENDING)throw std::runtime_error("module has an unresolved top-level await");
      if(!h.rejected.empty()){report(c,h.rejected.front().second);status=1;}
    }
  } catch(const std::exception& e){fprintf(stderr,"quickjs: %s\n",e.what());status=1;}
  runnerHost.finish();
  JS_FreeValue(c,result);
  for(auto& t:h.timers)JS_FreeValue(c,t.fn);
  for(auto& r:h.rejected){JS_FreeValue(c,r.first);JS_FreeValue(c,r.second);}
  h.modules.resources.close();
  JS_FreeContext(c);JS_FreeRuntime(rt);return h.exiting?h.exitCode:status;
}
