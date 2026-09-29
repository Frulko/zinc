#pragma once
#include "../zrt.h"

namespace zinc {
// Release native callbacks while their guest engine is still alive.
struct RunnerHost {
  bool closed=false;
  RunnerHost(int argc,char** argv) {
#if ZINC_ENGINE_GFX
    zrt::start({ZINC_ENGINE_WIDTH,ZINC_ENGINE_HEIGHT,ZINC_ENGINE_TITLE,1},argc,argv);
#endif
  }
  void finish() { if(!closed){closed=true;zrt::finish();} }
  ~RunnerHost() { finish(); }
};
}
