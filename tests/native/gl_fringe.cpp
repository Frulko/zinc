#include <algorithm>
#include "gl_fringe.h"
#include <cassert>
#include <cstdio>
#include <vector>
struct V { float x,y,u,v; unsigned color; float z; };
static void check(uint32_t n, bool reverse, bool cull) {
  std::vector<V> points(n), miters(n), vertices;
  for (uint32_t i=0;i<n;++i) {
    // Alternating turns, repeated closing point and non-uniform coverage; no symmetry hides a side swap.
    points[i] = V{float(i), float((i*7)%19),0,0,0,0};
    miters[i] = V{float(int(i%5)-2),float(int(i%3)-1),float(i%7)/8,0,0,0};
  }
  if(n==31) { points[2]=points[1]; points[n-1]=points[0]; }
  if(reverse) { std::reverse(points.begin(),points.end()); std::reverse(miters.begin(),miters.end()); }
  size_t triangles=0;
  for(uint32_t start=0;start<n;start+=zn_gl::fringe_edges) {
    uint32_t count=std::min(n-start,zn_gl::fringe_edges);
    vertices.assign((count+1)*3,V{0,0,0,0.5f,0x7fabcdef,0.375f});
    for(uint32_t i=0;i<=count;++i) {
      uint32_t p=(start+i)%n;
      float m[]={miters[p].x,miters[p].y,miters[p].u};
      zn_gl::fringe_point(vertices.data()+i*3,points[p].x,points[p].y,m);
    }
    for(uint32_t i=0;i<count;++i) {
      if(cull && i%3==0) continue;
      uint32_t a=start+i,b=(a+1)%n;
      for(uint32_t side=1;side<=2;++side) {
        float sign=side==1?1.f:-1.f;
        // Legacy quad attributes, expanded using the old fixed quad index buffer.
        V q[]={ {points[a].x,points[a].y,0,.5f,0x7fabcdef,.375f},
                {points[b].x,points[b].y,0,.5f,0x7fabcdef,.375f},
                {points[b].x+sign*.5f*miters[b].x,points[b].y+sign*.5f*miters[b].y,miters[b].u,.5f,0x7fabcdef,.375f},
                {points[a].x+sign*.5f*miters[a].x,points[a].y+sign*.5f*miters[a].y,miters[a].u,.5f,0x7fabcdef,.375f} };
        unsigned old[]={0,1,2,0,2,3}; uint16_t idx[6]; zn_gl::fringe_indices(idx,i,i+1,side);
        for(int k=0;k<6;++k) {
          assert(idx[k]<vertices.size()); const V& v=vertices[idx[k]]; const V& w=q[old[k]];
          assert(v.x==w.x && v.y==w.y && v.u==w.u && v.v==w.v && v.color==w.color && v.z==w.z);
        }
        triangles+=2;
      }
    }
  }
  assert(triangles>0);
}
int main() {
  for(uint32_t n : {3u,4u,31u,zn_gl::fringe_edges-1,zn_gl::fringe_edges,zn_gl::fringe_edges+1,zn_gl::fringe_edges*2+7})
    for(bool reverse : {false,true}) for(bool cull : {false,true}) check(n,reverse,cull);
  uint16_t idx[6]; zn_gl::fringe_indices(idx,zn_gl::fringe_edges-1,zn_gl::fringe_edges,2); assert(idx[2]==65534);
  zn_gl::fringe_indices(idx,13,2,1);
  const uint16_t sparse[] = {39,6,7,39,7,40};
  assert(std::equal(idx,idx+6,sparse));
  zn_gl::fringe_indices(idx,13,0,2);
  const uint16_t close[] = {39,0,2,39,2,41};
  assert(std::equal(idx,idx+6,close));
  puts("gl_fringe: legacy triangles/attributes, winding, culled edges, closure and ushort chunk bounds passed");
}
