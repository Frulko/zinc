#include "../../runtime/vm/abi.h"
#include <cassert>
static ZincValue field{}, result{};
static int32_t record(void*,const ZincValue*,uint32_t,ZincValue* out,ZincError*){*out=result;return ZINC_OK;}
template<class F> void rejects(F f){bool failed=false;try{f();}catch(const std::runtime_error&){failed=true;}assert(failed);}
int main(){
  ZincField fields[]={{"value",ZINC_STRING}};
  ZincRecord shape={fields,1};
  ZincExport fn={"record",nullptr,0,ZINC_RECORD,record,nullptr,&shape};
  ZincModule module={ZINC_ABI_VERSION,sizeof(ZincModule),"records",&fn,1};
  zinc::Modules registry;registry.add(module);
  char text[]="data";field.type=ZINC_STRING;field.as.string=text;field.length=4;
  result.type=ZINC_RECORD;result.as.record=&field;result.length=1;
  zinc::RecordSnapshot copied(zinc::Modules::call(fn,nullptr,0));text[0]='X';field.as.string="other";
  assert(std::string(copied.fields[0].as.string,copied.fields[0].length)=="data");
  result.length=0;rejects([&]{zinc::Modules::call(fn,nullptr,0);});
  result.length=1;result.as.record=nullptr;rejects([&]{zinc::Modules::call(fn,nullptr,0);});
  result.as.record=&field;field.type=ZINC_I32;rejects([&]{zinc::Modules::call(fn,nullptr,0);});
  field.type=ZINC_STRING;field.as.string=nullptr;rejects([&]{zinc::Modules::call(fn,nullptr,0);});
  shape.fields=nullptr;rejects([&]{zinc::Modules other;other.add(module);});shape.fields=fields;
  shape.field_count=257;rejects([&]{zinc::Modules other;other.add(module);});
  shape.field_count=1;fields[0].type=ZINC_RECORD;rejects([&]{zinc::Modules other;other.add(module);});
  fields[0].type=ZINC_VOID;rejects([&]{zinc::Modules other;other.add(module);});
  fields[0].type=ZINC_STRING;fields[0].name=nullptr;rejects([&]{zinc::Modules other;other.add(module);});
  fields[0].name="";rejects([&]{zinc::Modules other;other.add(module);});
  fields[0].name="value";fn.result=ZINC_STRING;rejects([&]{zinc::Modules other;other.add(module);});fn.result=ZINC_RECORD;
  fn.result_record=nullptr;rejects([&]{zinc::Modules other;other.add(module);});
  ZincField duplicate[]={{"same",ZINC_STRING},{"same",ZINC_I32}};shape={duplicate,2};fn.result_record=&shape;
  rejects([&]{zinc::Modules other;other.add(module);});
  shape={fields,1};ZincField wrongField={"other",ZINC_STRING};ZincRecord wrongShape={&wrongField,1};ZincExport wrong=fn;wrong.result_record=&wrongShape;
  rejects([&]{registry.require("records",wrong);});
  wrongField={"value",ZINC_I32};rejects([&]{registry.require("records",wrong);});
  wrongShape.field_count=0;rejects([&]{registry.require("records",wrong);});
  shape={nullptr,0};result.as.record=nullptr;result.length=0;
  {zinc::Modules empty;empty.add(module);assert(zinc::RecordSnapshot(zinc::Modules::call(fn,nullptr,0)).fields.empty());}
  shape={fields,1};
  const uint32_t recordParameter[]={ZINC_RECORD};fn.parameters=recordParameter;fn.parameter_count=1;
  rejects([&]{zinc::Modules other;other.add(module);});fn.parameters=nullptr;fn.parameter_count=0;
}
