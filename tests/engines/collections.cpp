#include "../../runtime/zrt.h"
#include <cassert>
#include <cstring>
#include <initializer_list>
struct Tracked : zrt::Object { static int live; Tracked(){++live;} ~Tracked(){--live;} };
int Tracked::live=0;
int main(){
  auto numbers=zrt::Map<double,int32_t>::make();
  for(uint64_t bits: {0x7ff8000000000001ull,0xfff8000000000002ull,0x7ff0000000000001ull}){double nan;memcpy(&nan,&bits,8);numbers.set(nan,7);assert(numbers.get(nan)==7);}
  assert(numbers.size()==1);numbers.set(-0.0,3);assert(numbers.size()==2);assert(1/numbers.key_at(1)>0);
  auto map=zrt::Map<int32_t,zrt::Ref<Tracked>>::make();
  for(int i=0;i<6;i++)map.set(i,zrt::make<Tracked>());
  assert(Tracked::live==6);
  {
    auto iteration=map.iterate();auto nested=map.iterate();assert(map.m->iterators==2);
    map.del(1);assert(Tracked::live==5);
    for(int i=6;i<20;i++)map.set(i,zrt::make<Tracked>());
    assert(!map.live_at(1) && map.key_at(2)==2 && map.slots()==20);
    map.clear();assert(Tracked::live==0 && map.size()==0 && map.slots()==20);
    map.set(40,zrt::make<Tracked>());assert(map.slots()==21 && map.key_at(20)==40);
  }
  assert(map.m->iterators==0);map.clear();assert(Tracked::live==0 && map.slots()==0 && map.m->cap==0);
  for(int i=0;i<3000;i++){map.set(i,zrt::make<Tracked>());map.del(i);}
  assert(Tracked::live==0 && map.m->cap==8);
}
