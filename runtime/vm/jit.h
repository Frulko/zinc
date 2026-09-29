#pragma once
// Baseline AArch64 JIT for the verified typed bytecode. Native operations remain
// behind the same ABI. No C++ exception may unwind through a generated frame.
#if defined(__aarch64__) && (defined(__APPLE__) || defined(__linux__))
#include <sys/mman.h>
#include <unistd.h>
#ifdef __APPLE__
#include <pthread.h>
#endif
namespace {
using JitHelper=int (*)(VM*,const Ins*,Reg*);
template<int O,int T> int jitHelper(VM* vm,const Ins* ip,Reg* fp) {
  try {
    if constexpr(O==RET) { vm->result=T==ZINC_VOID?Reg():fp[ip->a];vm->resultType=T; }
    else if constexpr(O==CALL || O==CALLF || O==METHOD) {
      const uint32_t target=O==CALLF?closureTarget(vm,ip,fp):O==METHOD?methodTarget(vm,ip,fp):ip->b;
      const auto args=O==METHOD?ip->b:ip->c;
      if(vm->fns[target].gen) { generatorCall(*vm,ip,fp,target,args,O==CALLF?fp[ip->b].h:nullptr);return 0; }
      if(vm->fns[target].async) { startAsync(vm,ip,fp,target,args,O==CALLF?fp[ip->b].h:nullptr);return 0; }
      vm->poll();
      if(vm->depth>=1024)throw std::runtime_error("JIT call stack overflow");
      const auto& f=vm->fns[target];Reg* next=fp+vm->fns[vm->fn].types.size();
      if(f.types.size()>(size_t)(vm->stack.data()+vm->stack.size()-next))throw std::runtime_error("VM register stack overflow");
      for(auto j:f.refs)next[j].h=nullptr;
      for(size_t j=0;j<f.params.size();j++)next[f.params[j]]=fp[args+j];
      if constexpr(O==CALLF)for(size_t j=0;j<f.captures.size();j++)next[f.captures[j]]=fp[ip->b].h->slots[j];
      const auto old=vm->fn;vm->frames[vm->depth]={ip+1,fp,ip->a,old};vm->fn=target;++vm->depth;
      int status=vm->jit[target](vm,next,0);--vm->depth;vm->fn=old;
      if(status)return status;
      if constexpr(T!=ZINC_VOID)fp[ip->a]=vm->result;
    } else { step<O,T>(vm,ip,fp); }
    return O==AWAIT || O==YIELD?3:0;
  } catch(const GuestThrow&) { return 2; } catch(const std::exception& e) { snprintf(vm->jitError,sizeof(vm->jitError),"%s",e.what());return 1; }
}
template<int O> JitHelper jitTyped(uint32_t t) {
  switch(t) {
#define T(n) case n:return jitHelper<O,n>;
    T(0) T(1) T(2) T(3) T(4) T(5) T(6) T(7)
#undef T
  } throw std::runtime_error("invalid JIT type");
}
JitHelper jitHelperFor(const Ins& i) {
  switch(i.op) {
#define O(n) case n:return jitTyped<n>(i.t);
    O(K) O(MOV) O(LOAD) O(STORE) O(ADD) O(SUB) O(MUL) O(DIV) O(MOD) O(LT) O(LE) O(GT) O(GE) O(EQ) O(NE) O(AND) O(OR) O(XOR) O(SHL) O(SHR) O(USHR) O(NEG) O(NOT) O(BITNOT) O(CONV) O(CALL) O(RET) O(PRINT) O(SPACE) O(NEWLINE) O(SQRT) O(ABS) O(FLOOR) O(CEIL) O(TRUNC) O(NATIVE) O(ALLOC) O(INIT) O(FIELDGET) O(FIELDSET) O(INDEXGET) O(INDEXSET) O(LENGTH) O(PUSH) O(POP) O(CONCAT) O(TRUTHY) O(CLOSURE) O(CALLF) O(FNREF) O(METHOD) O(THROW) O(EXCEPTION) O(PROMISE) O(AWAIT) O(PENDING) O(SETTLE) O(MICROTASK) O(TIMER) O(CANCELTIMER) O(YIELD) O(GENSTEP) O(GENVALUE) O(STRING) O(MATH) O(SPLICE) O(JOIN) O(COLLECTION) O(GENCONTROL) O(METHODREF) O(DYNAMIC)
#undef O
  } throw std::runtime_error("invalid JIT helper opcode");
}
int jitPoll(VM* vm,const Ins*,Reg*) {
  if(vm->interrupted.load(std::memory_order_relaxed)){strcpy(vm->jitError,"execution interrupted");return 1;}
  if(std::chrono::steady_clock::now()<=vm->deadline)return 0;
  strcpy(vm->jitError,"execution timed out");return 1;
}
struct Jit {
  void* memory=nullptr;size_t size=0;
  Jit(const Jit&)=delete;Jit& operator=(const Jit&)=delete;
  ~Jit(){if(memory)munmap(memory,size);}
  explicit Jit(VM& vm) {
    std::vector<std::vector<uint32_t>> functions;
    size_t total=0;
    for(const auto& f:vm.fns){functions.push_back(compile(vm,f));total+=(functions.back().size()*4+15)&~size_t(15);if(total>(64u<<20))throw std::runtime_error("JIT code size exceeds limit");}
    const size_t page=(size_t)sysconf(_SC_PAGESIZE);size=(total+page-1)&~(page-1);
    int flags=MAP_PRIVATE|MAP_ANON, protection=PROT_READ|PROT_WRITE;
#ifdef __APPLE__
    flags|=MAP_JIT;protection|=PROT_EXEC;
#endif
    vm.jit.resize(functions.size());
    void* p=mmap(nullptr,size,protection,flags,-1,0);
    if(p==MAP_FAILED)throw std::runtime_error("cannot allocate JIT memory (check platform entitlements)");memory=p;
    // No throwing operations inside the write window.
#ifdef __APPLE__
    pthread_jit_write_protect_np(0);
#endif
    size_t offset=0;
    for(size_t j=0;j<functions.size();j++) {
      auto& code=functions[j];void* dst=(char*)memory+offset;
      memcpy(dst,code.data(),code.size()*4);vm.jit[j]=(JitFn)dst;offset+=(code.size()*4+15)&~size_t(15);
    }
#ifdef __APPLE__
    pthread_jit_write_protect_np(1);
#else
    if(mprotect(memory,size,PROT_READ|PROT_EXEC)){munmap(memory,size);memory=nullptr;throw std::runtime_error("cannot protect JIT code");}
#endif
    __builtin___clear_cache((char*)memory,(char*)memory+size);
  }
  static std::vector<uint32_t> compile(VM& vm,const Fn& f) {
    std::vector<uint32_t> code;
    const auto emit=[&](uint32_t x){if(code.size()>=(16u<<20))throw std::runtime_error("JIT code size exceeds limit");code.push_back(x);};
    const auto imm=[&](int reg,uint64_t n){emit(0xD2800000|((n&65535)<<5)|reg);for(int k=1;k<4;k++)emit(0xF2800000|(uint32_t(k)<<21)|(((n>>(16*k))&65535)<<5)|reg);};
    std::vector<int> map(f.types.size(),-1);
    // Pin leaf scalar slots; calls spill through the verified register frame. A full allocator is not needed yet.
    const bool leaf=std::none_of(f.code.begin(),f.code.end(),[](auto& i){return i.op==CALL || i.op==CALLF || i.op==METHOD;});
    int nx=21,nd=8;
    if(leaf) {
      // ponytail: static back-edge weights approximate hotness; replace with measured block counts for tier-up.
      std::vector<uint32_t> weight(f.code.size(),1), order(f.types.size());
      std::vector<uint64_t> score(f.types.size());
      std::vector<int32_t> depthDelta(f.code.size()+1);
      for(size_t pc=0;pc<f.code.size();pc++) if(f.code[pc].op==JMP && (int32_t)f.code[pc].a<0) {
        ++depthDelta[(size_t)((int64_t)pc+(int32_t)f.code[pc].a)];--depthDelta[pc+1];
      }
      int depth=0;
      for(size_t pc=0;pc<f.code.size();pc++) {
        depth+=depthDelta[pc];weight[pc]=depth>=3?1000:depth==2?100:depth==1?10:1;
        const auto& i=f.code[pc];auto use=[&](uint32_t r){score[r]+=weight[pc];};
        if(i.op==JMP||i.op==SPACE||i.op==NEWLINE||(i.op==RET&&!i.t))continue;
        use(i.a);
        if(i.op==MOV||(i.op>=ADD&&i.op<=CONV)||(i.op>=SQRT&&i.op<=TRUNC))use(i.b);
        if(i.op>=ADD&&i.op<=USHR)use(i.c);
        if(i.op==NATIVE)for(uint32_t j=0;j<vm.imports[i.b]->parameter_count;j++)use(i.c+j);
        if(i.op==MATH)for(uint32_t j=0;j<(i.c>>8);j++)use(i.b+j);
        if(i.op==SPLICE)for(uint32_t j=0;j<i.c;j++)use(i.b+j);
      }
      for(size_t j=0;j<order.size();j++)order[j]=(uint32_t)j;
      std::stable_sort(order.begin(),order.end(),[&](auto a,auto b){return score[a]>score[b];});
      for(auto j:order) {
        if(!score[j])continue;
        if(f.types[j]>=ZINC_BOOL&&f.types[j]<=ZINC_U32&&nx<29)map[j]=nx++;
        if(f.types[j]==ZINC_F64&&nd<16)map[j]=nd++;
      }
    }
    const auto mem=[&](bool load,bool fp64,int reg,uint32_t slot){
      // Large frames use a materialized offset, avoiding truncated AArch64 immediates.
      const bool wide=fp64||f.types[slot]>=ZINC_F32;int base=20;uint32_t units=slot*(wide?1:2);
      if(units>4095){imm(16,uint64_t(slot)*8);emit(0x8B100290);base=16;units=0;} // add x16,x20,x16
      emit((fp64?(load?0xFD400000:0xFD000000):wide?(load?0xF9400000:0xF9000000):(load?0xB9400000:0xB9000000))|(units<<10)|(base<<5)|reg);
    };
    const auto src=[&](uint32_t slot,int tmp){if(map[slot]>=0)return map[slot];mem(true,f.types[slot]==ZINC_F64,tmp,slot);return tmp;};
    const auto dst=[&](uint32_t slot,int tmp){return map[slot]>=0?map[slot]:tmp;};
    const auto put=[&](uint32_t slot,int reg){if(map[slot]<0)mem(false,f.types[slot]==ZINC_F64,reg,slot);};
    const auto sync=[&](bool load){for(size_t j=0;j<map.size();j++)if(map[j]>=0)mem(load,f.types[j]==ZINC_F64,map[j],j);};
    // Preserve integer and FP callee-saved registers. Only the low 64 bits of d8..d15 are used.
    emit(0xA9B67BFD);emit(0x910003FD);
    for(int j=0;j<5;j++)emit(0xA9000000|((2+2*j)<<15)|((20+2*j)<<10)|(31<<5)|(19+2*j));
    for(int j=0;j<4;j++)emit(0x6D000000|((12+2*j)<<15)|((9+2*j)<<10)|(31<<5)|(8+2*j));
    emit(0xAA0003F3);emit(0xAA0103F4); // x19=VM, x20=register frame
    // All slots have initialized storage; reload after helpers uses the same layout.
    sync(true);
    struct Patch{size_t at;int target;uint32_t kind;};std::vector<Patch> patches;
    std::vector<size_t> labels(f.code.size()+4);
    const int success=(int)f.code.size(), failure=success+1, unhandled=failure+1, suspended=unhandled+1;
    const auto branch=[&](uint32_t kind,int target){patches.push_back({code.size(),target,kind});emit(kind);};
    // w2 is a checked bytecode PC. The table contains signed offsets relative
    // to itself, never executable addresses supplied by the bytecode bundle.
    size_t table=0;
    if(f.async || f.gen) {
      branch(0x34000002,0); // cbz w2, initial entry
      imm(9,f.code.size());emit(0x6B09005F);branch(0x54000002,failure); // cmp w2,w9; b.hs
      emit(0x10000090); // adr x16, table (16 bytes ahead)
      emit(0xB8A25A09); // ldrsw x9,[x16,w2,uxtw #2]
      emit(0x8B090210);emit(0xD61F0200); // add x16,x16,x9; br x16
      table=code.size();for(size_t pc=0;pc<f.code.size();pc++)emit(0);
    }
    const auto helper=[&](JitHelper fn,const Ins* ins){
      sync(false);emit(0xAA1303E0);imm(1,(uintptr_t)ins);emit(0xAA1403E2);imm(16,(uintptr_t)fn);emit(0xD63F0200);
      if(ins && (ins->op==AWAIT || ins->op==YIELD)) { emit(0x71000C1F);branch(0x54000000,suspended); }
      emit(0x7100081F);branch(0x54000000,ins && ins->catchPc!=UINT32_MAX?(int)ins->catchPc:unhandled);
      branch(0x35000000,failure);sync(true);
    };
    const auto poll=[&](){
      imm(16,(uintptr_t)&vm.jitBudget);emit(0xB9400209);emit(0x71000529);emit(0xB9000209);
      const auto skip=code.size();emit(0x54000001); // b.ne, patched past slow poll
      emit(0x52820009);emit(0xB9000209);helper(jitPoll,nullptr);
      const auto delta=code.size()-skip;if(delta>262143)throw std::runtime_error("JIT poll branch out of range");code[skip]|=(uint32_t)delta<<5;
    };
    for(size_t pc=0;pc<f.code.size();pc++) {
      if((pc&4095)==0 && std::chrono::steady_clock::now()>vm.deadline)throw std::runtime_error("JIT compilation timed out");
      const auto& i=f.code[pc];const uint32_t a=i.a,b=i.b,c=i.c,t=i.t;labels[pc]=code.size();
      if(i.op==JMP){if((int32_t)a<=0)poll();branch(0x14000000,(int)pc+(int32_t)a);continue;}
      if(i.op==BR){if((int32_t)b<=0||(int32_t)c<=0)poll();int r=src(a,9);branch(0x35000000|r,(int)pc+(int32_t)b);branch(0x14000000,(int)pc+(int32_t)c);continue;}
      if(i.op==RET){helper(jitHelperFor(i),&i);branch(0x14000000,success);continue;}
      if(i.op==K||i.op==LOAD||i.op==STORE) {
        const Reg* ptr=i.op==K?&vm.constants[b]:&vm.globals[b];imm(16,(uintptr_t)ptr);
        const bool fl=t==ZINC_F64;const int r=i.op==STORE?src(a,fl?0:9):dst(a,fl?0:9);
        // src() for a large unpinned frame can use x16; materialize the address again for stores.
        if(i.op==STORE)imm(16,(uintptr_t)ptr);
        const bool wide=t>=ZINC_F32;
        emit((fl?(i.op==STORE?0xFD000000:0xFD400000):wide?(i.op==STORE?0xF9000000:0xF9400000):(i.op==STORE?0xB9000000:0xB9400000))|(16<<5)|r);
        if(i.op!=STORE)put(a,r);continue;
      }
      if(i.op==MOV){const bool fl=t==ZINC_F64;int n=src(b,fl?0:9),d=dst(a,fl?1:10);emit((fl?0x1E604000:t>=ZINC_F32?0xAA0003E0:0x2A0003E0)|(n<<(fl?5:16))|d);put(a,d);continue;}
      if((t==ZINC_I32||t==ZINC_U32||t==ZINC_BOOL) && ((i.op>=ADD&&i.op<=MUL)||(i.op>=LT&&i.op<=USHR))) {
        int n=src(b,9),m=src(c,10),d=dst(a,11);
        if(i.op>=LT&&i.op<=NE){
          emit(0x6B00001F|(m<<16)|(n<<5));
          const int signedConditions[]={11,13,12,10,0,1},unsignedConditions[]={3,9,8,2,0,1};
          int cond=(t==ZINC_U32?unsignedConditions:signedConditions)[i.op-LT];emit(0x1A9F07E0|((cond^1)<<12)|d);
        } else {
          uint32_t op=i.op==ADD?0x0B000000:i.op==SUB?0x4B000000:i.op==MUL?0x1B007C00:i.op==AND?0x0A000000:i.op==OR?0x2A000000:i.op==XOR?0x4A000000:i.op==SHL?0x1AC02000:i.op==SHR?0x1AC02800:0x1AC02400;
          emit(op|(m<<16)|(n<<5)|d);
        }put(a,d);continue;
      }
      if(t==ZINC_F64 && i.op>=ADD&&i.op<=DIV){int n=src(b,0),m=src(c,1),d=dst(a,2);const uint32_t base[]={0x1E602800,0x1E603800,0x1E600800,0x1E601800};emit(base[i.op-ADD]|(m<<16)|(n<<5)|d);put(a,d);continue;}
      if(t==ZINC_F64 && i.op>=LT&&i.op<=NE){int n=src(b,0),m=src(c,1),d=dst(a,9);emit(0x1E602000|(m<<16)|(n<<5));const int cond[]={4,9,12,10,0,1};emit(0x1A9F07E0|((cond[i.op-LT]^1)<<12)|d);put(a,d);continue;}
      helper(jitHelperFor(i),&i);
    }
    labels[success]=code.size();emit(0x52800000); // success: mov w0,0
    emit(0x14000006);
    labels[suspended]=code.size();emit(0x52800060);emit(0x14000004);
    labels[unhandled]=code.size();emit(0x52800040);emit(0x14000002); // uncaught guest error: w0=2
    labels[failure]=code.size();emit(0x52800020); // failure: mov w0,1
    for(int j=0;j<4;j++)emit(0x6D400000|((12+2*j)<<15)|((9+2*j)<<10)|(31<<5)|(8+2*j));
    for(int j=0;j<5;j++)emit(0xA9400000|((2+2*j)<<15)|((20+2*j)<<10)|(31<<5)|(19+2*j));
    emit(0xA8CA7BFD);emit(0xD65F03C0);
    if(f.async || f.gen)for(size_t pc=0;pc<f.code.size();pc++)code[table+pc]=(uint32_t)(((int64_t)labels[pc]-(int64_t)table)*4);
    for(auto p:patches){if(p.target<0||(size_t)p.target>=labels.size())throw std::runtime_error("invalid JIT branch");int64_t d=(int64_t)labels[p.target]-(int64_t)p.at;
      if(p.kind==0x14000000){if(d<-(1<<25)||d>=(1<<25))throw std::runtime_error("JIT branch out of range");code[p.at]=p.kind|((uint32_t)d&0x3ffffff);}
      else {if(d<-(1<<18)||d>=(1<<18))throw std::runtime_error("JIT conditional branch out of range");code[p.at]=p.kind|(((uint32_t)d&0x7ffff)<<5);}
    }
    return code;
  }
};
}
#else
namespace {struct Jit {explicit Jit(VM&){throw std::runtime_error("JIT is currently available only on AArch64 macOS/Linux; use --vm-tier=0");}};}
#endif
