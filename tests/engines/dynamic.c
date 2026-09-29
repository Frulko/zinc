#include "../../runtime/include/zinc_abi.h"
#include <stdlib.h>
#include <stdio.h>

typedef struct {
  int led;
  ZincExport exports[3];
  ZincModule module;
} Sensor;
static int32_t temperature(void* context,const ZincValue* args,uint32_t count,ZincValue* out,ZincError* error) {
  (void)args;(void)count;(void)error;
  out->type=ZINC_F64;out->as.number=40.25+((Sensor*)context)->led;return ZINC_OK;
}
static int32_t serial(void* context,const ZincValue* args,uint32_t count,ZincValue* out,ZincError* error) {
  (void)context;(void)args;(void)count;(void)error;
  out->type=ZINC_STRING;out->as.string="DYNAMIC";out->length=7;return ZINC_OK;
}
static int32_t led(void* context,const ZincValue* args,uint32_t count,ZincValue* out,ZincError* error) {
  (void)count;(void)error;
  ((Sensor*)context)->led=args[0].as.unsigned_integer!=0;out->type=ZINC_VOID;return ZINC_OK;
}
static void dispose(void* context) { fputs("dispose\n",stderr);free(context); }
__attribute__((destructor)) static void unloaded(void) { fputs("unload\n",stderr); }
#ifdef NO_ENTRY
#define zinc_module_open wrong_entry
#endif
int32_t zinc_module_open(uint32_t version,const ZincHost* host,const ZincModule** out,ZincError* error) {
  (void)host;
  if(version!=ZINC_ABI_VERSION) {*error=(ZincError){"ABI version mismatch",20};return ZINC_BAD_ARGUMENT;}
#ifdef FAIL_OPEN
  *error=(ZincError){"initialization failed",21};return ZINC_HOST_ERROR;
#endif
  Sensor* s=calloc(1,sizeof(*s));if(!s)return ZINC_HOST_ERROR;
  static const uint32_t params[]={ZINC_BOOL};
  s->exports[0]=(ZincExport){"temperature",NULL,0,ZINC_F64,temperature,s};
  s->exports[1]=(ZincExport){"serial",NULL,0,ZINC_STRING,serial,s};
  s->exports[2]=(ZincExport){"setLed",params,1,ZINC_VOID,led,s};
#ifdef BAD_SIGNATURE
  s->exports[0].result=ZINC_I32;
#endif
  s->module=(ZincModule){ZINC_ABI_VERSION,sizeof(ZincModule),"zinc:native/Sensor",s->exports,3,s,dispose};
  *out=&s->module;return ZINC_OK;
}
