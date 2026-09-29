#include "../../runtime/vm/resources.h"
#include <cassert>
static int destroyed=0;
struct Value { int refs=1; };
static void release(void* p){auto* v=(Value*)p;if(!--v->refs){++destroyed;delete v;}}
template<class F> void rejects(F f){bool rejected=false;try{f();}catch(const std::runtime_error&){rejected=true;}assert(rejected);}
int main(){
  zinc::Resources a,b;
  auto* value=new Value;
  const auto first=a.add(value,42,release);
  ++value->refs;const auto alias=a.add(value,42,release);assert(first==alias);
  a.release(first);assert(destroyed==0);assert(a.get(alias,42)==value);
  rejects([&]{a.get(alias,43);});rejects([&]{b.get(alias,42);});
  a.release(alias);assert(destroyed==1);rejects([&]{a.get(first,42);});rejects([&]{a.release(first);});
  const auto next=a.add(new Value,42,release);assert(next!=first);rejects([&]{a.get(first,42);});
  a.retain(next);a.release(next);assert(destroyed==1);
  a.close();assert(destroyed==2);rejects([&]{a.get(next,42);});a.close();assert(destroyed==2);
  assert(b.get(0,42)==nullptr);b.retain(0);b.release(0);
}
