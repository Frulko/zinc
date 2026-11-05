// display-gl: a decoder's dmabufs as a texture (zgl.h zgl_picture_texture), on the EGL of the Linux backends. EGL_EXT_image_dma_buf_import.
#define EGL_NO_X11
#include "hal.h"
#include "zgl.h"
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <GLES2/gl2ext.h>
#include <stdio.h>
#include <string.h>

extern "C" bool zgl_picture_texture(const HalPicture* pic, GLuint tex, void** image) {
  static const auto bindImage = (PFNGLEGLIMAGETARGETTEXTURE2DOESPROC)eglGetProcAddress("glEGLImageTargetTexture2DOES");
  static const auto create = (PFNEGLCREATEIMAGEKHRPROC)eglGetProcAddress("eglCreateImageKHR");
  static const auto destroy = (PFNEGLDESTROYIMAGEKHRPROC)eglGetProcAddress("eglDestroyImageKHR");
  if (!bindImage || !create || !destroy) return false;
  const EGLDisplay display = eglGetCurrentDisplay();
  EGLImageKHR made = EGL_NO_IMAGE_KHR;
  if (pic) {
    static const EGLint PLANE[4][3] = {{EGL_DMA_BUF_PLANE0_FD_EXT, EGL_DMA_BUF_PLANE0_OFFSET_EXT, EGL_DMA_BUF_PLANE0_PITCH_EXT},
                                       {EGL_DMA_BUF_PLANE1_FD_EXT, EGL_DMA_BUF_PLANE1_OFFSET_EXT, EGL_DMA_BUF_PLANE1_PITCH_EXT},
                                       {EGL_DMA_BUF_PLANE2_FD_EXT, EGL_DMA_BUF_PLANE2_OFFSET_EXT, EGL_DMA_BUF_PLANE2_PITCH_EXT},
                                       {EGL_DMA_BUF_PLANE3_FD_EXT, EGL_DMA_BUF_PLANE3_OFFSET_EXT, EGL_DMA_BUF_PLANE3_PITCH_EXT}};
    static const EGLint MODIFIER[4][2] = {{EGL_DMA_BUF_PLANE0_MODIFIER_LO_EXT, EGL_DMA_BUF_PLANE0_MODIFIER_HI_EXT},
                                          {EGL_DMA_BUF_PLANE1_MODIFIER_LO_EXT, EGL_DMA_BUF_PLANE1_MODIFIER_HI_EXT},
                                          {EGL_DMA_BUF_PLANE2_MODIFIER_LO_EXT, EGL_DMA_BUF_PLANE2_MODIFIER_HI_EXT},
                                          {EGL_DMA_BUF_PLANE3_MODIFIER_LO_EXT, EGL_DMA_BUF_PLANE3_MODIFIER_HI_EXT}};
    const uint64_t NO_MODIFIER = 0x00FFFFFFFFFFFFFFull;   // DRM_FORMAT_MOD_INVALID
    static const bool modifiers = strstr(eglQueryString(display, EGL_EXTENSIONS), "EGL_EXT_image_dma_buf_import_modifiers") != nullptr;
    EGLint at[64];
    int n = 0;
    at[n++] = EGL_WIDTH; at[n++] = pic->w;
    at[n++] = EGL_HEIGHT; at[n++] = pic->h;
    at[n++] = EGL_LINUX_DRM_FOURCC_EXT; at[n++] = (EGLint)pic->format;
    at[n++] = EGL_YUV_COLOR_SPACE_HINT_EXT; at[n++] = pic->bt709 ? EGL_ITU_REC709_EXT : EGL_ITU_REC601_EXT;
    at[n++] = EGL_SAMPLE_RANGE_HINT_EXT; at[n++] = pic->full_range ? EGL_YUV_FULL_RANGE_EXT : EGL_YUV_NARROW_RANGE_EXT;
    for (int i = 0; i < pic->nplanes && i < 4; i++) {
      at[n++] = PLANE[i][0]; at[n++] = pic->fd[i];
      at[n++] = PLANE[i][1]; at[n++] = (EGLint)pic->offset[i];
      at[n++] = PLANE[i][2]; at[n++] = (EGLint)pic->pitch[i];
      if (modifiers && pic->modifier != NO_MODIFIER) {
        at[n++] = MODIFIER[i][0]; at[n++] = (EGLint)(pic->modifier & 0xFFFFFFFFu);
        at[n++] = MODIFIER[i][1]; at[n++] = (EGLint)(pic->modifier >> 32);
      }
    }
    at[n] = EGL_NONE;
    made = create(display, EGL_NO_CONTEXT, EGL_LINUX_DMA_BUF_EXT, nullptr, at);
    if (made == EGL_NO_IMAGE_KHR) { fprintf(stderr, "display-gl: eglCreateImage of a %.4s picture %dx%d, %d planes: error 0x%x\n", (const char*)&pic->format, pic->w, pic->h, pic->nplanes, eglGetError()); return false; }
    glBindTexture(GL_TEXTURE_EXTERNAL_OES, tex);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_EXTERNAL_OES, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    bindImage(GL_TEXTURE_EXTERNAL_OES, (GLeglImageOES)made);
  }
  if (*image) destroy(display, (EGLImageKHR)*image);
  *image = made;
  return true;
}
