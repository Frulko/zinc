#include "../../runtime/include/zinc_abi.h"
#include <stdlib.h>
#include <stdio.h>

static const ZincHost* host;
static int alive;
static const uint64_t kind=0x53544f5245ull;
static void destroy(void* p) { --alive;free(p); }
static int32_t invoke(void* context,const ZincValue* args,uint32_t count,ZincValue* out,ZincError* error) {
  (void)count;
  const uintptr_t operation=(uintptr_t)context;
  if(operation==0) {
    int32_t* value=malloc(sizeof(*value));if(!value)return ZINC_HOST_ERROR;
    *value=args[0].as.integer;
    const int32_t status=host->resource_create(host->context,value,kind,destroy,&out->as.handle,error);
    if(status!=ZINC_OK){free(value);return status;}
    ++alive;out->type=ZINC_RESOURCE;
  } else if(operation==4) { out->type=ZINC_I32;out->as.integer=alive; }
  else {
    void* value=NULL;
    int32_t status=host->resource_get(host->context,args[0].as.handle,kind,&value,error);
    if(status!=ZINC_OK)return status;
    if(operation==1) {
      status=host->resource_retain(host->context,args[0].as.handle,error);
      if(status!=ZINC_OK)return status;
      out->type=ZINC_RESOURCE;out->as.handle=args[0].as.handle;
    } else if(operation==2) { out->type=ZINC_I32;out->as.integer=*(int32_t*)value; }
    else { *(int32_t*)value=args[1].as.integer;out->type=ZINC_VOID; }
  }
  return ZINC_OK;
}
static void dispose(void* context) { (void)context;fprintf(stderr,"dispose alive=%d\n",alive); }
__attribute__((destructor)) static void unloaded(void) { fputs("unload resources\n",stderr); }
int32_t zinc_module_open(uint32_t version,const ZincHost* api,const ZincModule** out,ZincError* error) {
  (void)error;
  if(version!=ZINC_ABI_VERSION || !api || api->version!=version || api->size!=sizeof(*api))return ZINC_BAD_ARGUMENT;
  host=api;
  static const uint32_t number[]={ZINC_I32},resource[]={ZINC_RESOURCE},set[]={ZINC_RESOURCE,ZINC_I32};
  static const ZincExport exports[]={
    {"create",number,1,ZINC_RESOURCE,invoke,(void*)0},
    {"alias",resource,1,ZINC_RESOURCE,invoke,(void*)1},
    {"get",resource,1,ZINC_I32,invoke,(void*)2},
    {"set",set,2,ZINC_VOID,invoke,(void*)3},
    {"live",NULL,0,ZINC_I32,invoke,(void*)4}
  };
  static const ZincModule module={ZINC_ABI_VERSION,sizeof(ZincModule),"zinc:native/Store",exports,5,NULL,dispose};
  *out=&module;return ZINC_OK;
}
