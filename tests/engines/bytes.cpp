#include "../../runtime/vm/abi.h"
#include <cassert>
#include <climits>
static const uint8_t payload[] = {0,128,255};
static int32_t echo(void*,const ZincValue* args,uint32_t,ZincValue* out,ZincError*){*out=args[0];return ZINC_OK;}
static int32_t invalid(void*,const ZincValue*,uint32_t,ZincValue* out,ZincError*){out->type=ZINC_BYTES;out->length=1;out->as.bytes=nullptr;return ZINC_OK;}
static int32_t sum(void*,const ZincValue* args,uint32_t,ZincValue* out,ZincError*){out->type=ZINC_F64;out->as.number=0;for(uint32_t j=0;j<args[0].length;j++)out->as.number+=args[0].as.numbers[j];return ZINC_OK;}
int main(){
  const uint32_t parameters[]={ZINC_BYTES};
  const ZincExport function={"echo",parameters,1,ZINC_BYTES,echo,nullptr};
  const ZincModule module={ZINC_ABI_VERSION,sizeof(ZincModule),"bytes",&function,1,nullptr,nullptr};
  zinc::Modules registry;registry.add(module);
  ZincValue arg{};arg.type=ZINC_BYTES;arg.as.bytes=payload;arg.length=3;
  auto result=zinc::Modules::call(function,&arg,1);assert(result.length==3 && result.as.bytes[2]==255);
  arg.as.bytes=nullptr;
  bool rejected=false;try{zinc::Modules::call(function,&arg,1);}catch(const std::runtime_error&){rejected=true;}assert(rejected);
  arg.length=0;assert(zinc::Modules::call(function,&arg,1).length==0);
  arg.as.bytes=payload;arg.length=UINT32_MAX;
  rejected=false;try{zinc::Modules::call(function,&arg,1);}catch(const std::runtime_error&){rejected=true;}assert(rejected);
  ZincExport broken=function;broken.invoke=invalid;arg.length=3;
  rejected=false;try{zinc::Modules::call(broken,&arg,1);}catch(const std::runtime_error&){rejected=true;}assert(rejected);
  const uint32_t numericParameters[]={ZINC_NUMBERS};
  const ZincExport numeric={"sum",numericParameters,1,ZINC_F64,sum,nullptr};
  const ZincModule numericModule={ZINC_ABI_VERSION,sizeof(ZincModule),"numbers",&numeric,1};zinc::Modules numericRegistry;numericRegistry.add(numericModule);
  const double numbers[]={1.25,2.5};arg.type=ZINC_NUMBERS;arg.as.numbers=numbers;arg.length=2;
  assert(zinc::Modules::call(numeric,&arg,1).as.number==3.75);
  arg.as.numbers=nullptr;rejected=false;try{zinc::Modules::call(numeric,&arg,1);}catch(const std::runtime_error&){rejected=true;}assert(rejected);
  arg.length=0;assert(zinc::Modules::call(numeric,&arg,1).as.number==0);
  arg.length=UINT32_MAX;arg.as.numbers=numbers;rejected=false;try{zinc::Modules::call(numeric,&arg,1);}catch(const std::runtime_error&){rejected=true;}assert(rejected);
}
