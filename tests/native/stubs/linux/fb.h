// The framebuffer ioctl ABI of Linux (linux/fb.h), the part display-fbdev uses, so the driver builds on a Mac for the ZINC_FBDEV_SIM test (ZN-129).
#pragma once
#include <cstdint>
#define FBIOGET_VSCREENINFO 0x4600
#define FBIOGET_FSCREENINFO 0x4602
#define FBIO_WAITFORVSYNC 0x40044620
struct fb_bitfield { uint32_t offset, length, msb_right; };
struct fb_var_screeninfo {
  uint32_t xres, yres, xres_virtual, yres_virtual, xoffset, yoffset, bits_per_pixel, grayscale;
  fb_bitfield red, green, blue, transp;
  uint32_t nonstd, activate, height, width, accel_flags, pixclock, left_margin, right_margin, upper_margin, lower_margin, hsync_len, vsync_len, sync, vmode, rotate, colorspace, reserved[4];
};
struct fb_fix_screeninfo {
  char id[16];
  unsigned long smem_start;
  uint32_t smem_len, type, type_aux, visual;
  uint16_t xpanstep, ypanstep, ywrapstep;
  uint32_t line_length;
  unsigned long mmio_start;
  uint32_t mmio_len, accel;
  uint16_t capabilities, reserved[2];
};
