#include "gl_paint_cache.h"
#include <cassert>
#include <cstdio>
namespace zrt::raster { uint32_t font_gen = 0; }
int main() {
  using namespace zrt::raster;
  Cmd cmds[3]{};
  for (auto& c : cmds) { c.kind=RECT; c.alpha=255; c.x=10.25f; c.y=20.75f; c.w=200; c.h=120; }
  cmds[0].grad=1; cmds[1].alpha=80; cmds[2].r=20;
  Frame f{cmds,3,nullptr,nullptr}; zn_gl::PaintBatch a,b;
  assert(zn_gl::paintBatch(f,0,a));
  for (auto& c : cmds) { c.x+=11.5f; c.y-=15.25f; }
  assert(zn_gl::paintBatch(f,0,b) && zn_gl::samePaint(a,b));
  cmds[1].c1=123; assert(zn_gl::paintBatch(f,0,b) && !zn_gl::samePaint(a,b));
  cmds[1].kind=IMAGE; assert(!zn_gl::paintBatch(f,0,b));
  cmds[1].kind=RECT; cmds[0].w=1e8f; assert(!zn_gl::paintBatch(f,0,b));
  cmds[0].w=200; cmds[1].x=__builtin_nanf(""); assert(!zn_gl::paintBatch(f,0,b));
  Cmd tree[6]{};
  for (auto& c : tree) { c.x=10; c.y=10; c.w=200; c.h=150; c.alpha=255; }
  tree[0].kind=RECT; tree[0].r=14; tree[1].kind=BORDER; tree[2].kind=CLIP;
  tree[3].kind=RECT; tree[3].grad=1; tree[4].kind=TEXT; tree[4].n=1;
  tree[5] = Cmd{}; tree[5].kind=UNCLIP;
  Frame t{tree,6,"A",nullptr}; assert(zn_gl::paintBatch(t,0,a));
  for (int i=0;i<5;++i) { tree[i].x+=17; tree[i].y-=5; }
  assert(zn_gl::paintBatch(t,0,b) && zn_gl::samePaint(a,b));
  ++font_gen; assert(zn_gl::paintBatch(t,0,b) && !zn_gl::samePaint(a,b));
  tree[3].kind=CLIP; assert(!zn_gl::paintBatch(t,0,b));
  puts("gl_paint_cache: translation-independent identity and invalidation passed");
}
