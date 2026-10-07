// The evdev ABI of Linux (linux/input.h), the part display-fbdev uses (ZN-129). Values are the kernel's.
#pragma once
#include <cstdint>
#include <sys/ioctl.h>
#include <sys/time.h>
struct input_event { struct timeval time; uint16_t type, code; int32_t value; };
struct input_absinfo { int32_t value, minimum, maximum, fuzz, flat, resolution; };
#define EV_SYN 0x00
#define EV_KEY 0x01
#define EV_REL 0x02
#define EV_ABS 0x03
#define SYN_REPORT 0
#define REL_X 0x00
#define REL_Y 0x01
#define REL_WHEEL 0x08
#define ABS_X 0x00
#define ABS_Y 0x01
#define ABS_MT_SLOT 0x2f
#define ABS_MT_POSITION_X 0x35
#define ABS_MT_POSITION_Y 0x36
#define ABS_MT_TRACKING_ID 0x39
#define ABS_MAX 0x3f
#define KEY_MAX 0x2ff
#define KEY_ESC 1
#define KEY_Q 16
#define KEY_W 17
#define KEY_E 18
#define KEY_ENTER 28
#define KEY_A 30
#define KEY_S 31
#define KEY_D 32
#define KEY_Z 44
#define KEY_X 45
#define KEY_C 46
#define KEY_V 47
#define KEY_TAB 15
#define KEY_SPACE 57
#define KEY_KPENTER 96
#define KEY_UP 103
#define KEY_LEFT 105
#define KEY_RIGHT 106
#define KEY_DOWN 108
#define BTN_LEFT 0x110
#define BTN_TOUCH 0x14a
#define EVIOCGBIT(ev, len) (0x80000000u | ((unsigned)(len) << 16) | ('E' << 8) | (0x20 + (ev)))
#define EVIOCGABS(abs) (0x80000000u | (sizeof(input_absinfo) << 16) | ('E' << 8) | (0x40 + (abs)))
#define EVIOCGRAB 0x40044590
