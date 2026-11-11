// Driver spies prove explicit uploads even on drivers that happen to return zero memory.
#include <cassert>
#include <map>
#include "gl/zero_upload.h"
static std::map<GLenum, GLint> state;
static int allocations = 0, uploads = 0, nextY = 0;
static bool failAllocation = false, failed = false;
static void get(GLenum key, GLint* value) { *value = state[key]; }
static void bind(GLenum, GLuint v) { state[GL_PIXEL_UNPACK_BUFFER_BINDING] = v; }
static void store(GLenum k, GLint v) { state[k] = v; }
static void image(GLenum, GLint, GLint, GLsizei, GLsizei, GLint, GLenum, GLenum, const void* data) {
  assert(!data && state[GL_PIXEL_UNPACK_BUFFER_BINDING] == 0);
  ++allocations; failed = failAllocation;
}
static void sub(GLenum, GLint, GLint x, GLint y, GLsizei w, GLsizei h, GLenum, GLenum, const void* p) {
  assert(x == 0 && y == nextY && w == 3 && h > 0 && w * h * 4 <= 65536);
  nextY += h;
  assert(state[GL_UNPACK_ALIGNMENT] == 1 && state[GL_UNPACK_ROW_LENGTH] == 0 && state[GL_PIXEL_UNPACK_BUFFER_BINDING] == 0);
  for (int i=0;i<w*h*4;++i) assert(static_cast<const unsigned char*>(p)[i] == 0);
  ++uploads;
}
int main() {
  glad_glGetIntegerv = get; glad_glBindBuffer = bind; glad_glPixelStorei = store;
  glad_glTexImage2D = image; glad_glTexSubImage2D = sub;
  for (auto key : zn::gl::ZeroUpload::names) state[key] = 7;
  state[GL_PIXEL_UNPACK_BUFFER_BINDING] = 19;
  const auto before = state;
  assert(zn::gl::zeroImage(GL_TEXTURE_2D,0,GL_RGBA8,3,2,1,GL_RGBA,GL_UNSIGNED_BYTE,4,false,[] { return !failed; }));
  assert(allocations == 1 && uploads == 1 && state == before);
  nextY = 0;
  assert(zn::gl::zeroImage(GL_TEXTURE_2D,0,GL_RGBA8,3,10000,1,GL_RGBA,GL_UNSIGNED_BYTE,4,false,[] { return !failed; }));
  assert(allocations == 2 && uploads == 3 && nextY == 10000 && state == before);
  failAllocation = true;
  assert(!zn::gl::zeroImage(GL_TEXTURE_2D,0,GL_RGBA8,3,2,1,GL_RGBA,GL_UNSIGNED_BYTE,4,false,[] { return !failed; }));
  assert(allocations == 3 && uploads == 3 && state == before);
}
