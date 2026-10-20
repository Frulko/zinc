# Cross-build zinc for Linux with the pinned zig, from macOS or another Linux (docs/targets/linux.md):
#   cmake -S next -B build-linux-aarch64 -DCMAKE_TOOLCHAIN_FILE=cmake/zig-linux.cmake -DZN_LINUX_ARCH=aarch64 -DCMAKE_BUILD_TYPE=Release
#   BUILD_DIR=build-linux-aarch64 tools/build zinc        (tools/build-linux --arch aarch64 does both and packs the result)
# ZN_LINUX_ARCH: aarch64 (Pi 3/4/5 on a 64-bit OS, ARM servers), armhf (ARMv6 + VFP: every 32-bit Raspberry Pi OS, the Pi 1 and Zero
# included), armv7 (ARMv7 + NEON: Pi 2 and later on a 32-bit OS), x86_64, x86 (i686).
# ZN_LINUX_LIBC: gnu (default, glibc 2.28 and newer: Debian 10 / Raspberry Pi OS Buster, Ubuntu 20.04, RHEL 8) or musl (one static file:
# no dlopen, so no plugin library, no window, no GPU; a server or a container). The CPU flags are those of src/tc/tc.cpp's targets.
# ZIG names the zig binary; by default the newest one `zinc toolchain` installed in $ZINC_HOME (~/.zinc).
set(CMAKE_SYSTEM_NAME Linux)
set(ZN_LINUX_ARCH aarch64 CACHE STRING "aarch64, armhf, armv7, x86_64 or x86")
set(ZN_LINUX_LIBC gnu CACHE STRING "gnu (glibc 2.28+) or musl (static)")
set(ZN_LINUX_GLIBC 2.28 CACHE STRING "the oldest glibc the binary runs on")
# CMake's checks (try_compile) read this file again in a project of their own: without these they would compile for the defaults
list(APPEND CMAKE_TRY_COMPILE_PLATFORM_VARIABLES ZN_LINUX_ARCH ZN_LINUX_LIBC ZN_LINUX_GLIBC ZN_LINUX_SYSROOT ZIG)

if(ZN_LINUX_ARCH STREQUAL "aarch64")
  set(CMAKE_SYSTEM_PROCESSOR aarch64)
  set(_triple aarch64-linux-${ZN_LINUX_LIBC})
  set(CMAKE_LIBRARY_ARCHITECTURE aarch64-linux-gnu)   # Debian's multiarch directory in the sysroot (usr/lib/<it>)
  set(_cpu "-mcpu=cortex_a53")        # ARMv8.0, the Pi 3's core; the A55, A72 and A76 run it
elseif(ZN_LINUX_ARCH STREQUAL "armhf")
  set(CMAKE_SYSTEM_PROCESSOR arm)
  set(_triple arm-linux-${ZN_LINUX_LIBC}eabihf)
  set(CMAKE_LIBRARY_ARCHITECTURE arm-linux-gnueabihf)
  set(_cpu "-mcpu=arm1176jzf_s")      # ARMv6KZ + VFPv2, what Raspberry Pi OS's own 32-bit packages target
elseif(ZN_LINUX_ARCH STREQUAL "armv7")
  set(CMAKE_SYSTEM_PROCESSOR arm)
  set(_triple arm-linux-${ZN_LINUX_LIBC}eabihf)
  set(CMAKE_LIBRARY_ARCHITECTURE arm-linux-gnueabihf)
  set(_cpu "-mcpu=cortex_a8")         # ARMv7-A + NEON + VFPv3 (Pi 2, Pi 3 on 32 bits, NTC CHIP)
elseif(ZN_LINUX_ARCH STREQUAL "x86_64")
  set(CMAKE_SYSTEM_PROCESSOR x86_64)
  set(_triple x86_64-linux-${ZN_LINUX_LIBC})
  set(CMAKE_LIBRARY_ARCHITECTURE x86_64-linux-gnu)
  set(_cpu "")                        # x86-64 baseline (SSE2): every 64-bit PC
elseif(ZN_LINUX_ARCH STREQUAL "x86")
  set(CMAKE_SYSTEM_PROCESSOR i686)
  set(_triple x86-linux-${ZN_LINUX_LIBC})
  set(CMAKE_LIBRARY_ARCHITECTURE i386-linux-gnu)
  set(_cpu "-mcpu=pentium4")          # i686 + SSE2: x87-only machines would round doubles differently from every other target
else()
  message(FATAL_ERROR "zig-linux.cmake: ZN_LINUX_ARCH is aarch64, armhf, armv7, x86_64 or x86, not '${ZN_LINUX_ARCH}'")
endif()
if(ZN_LINUX_LIBC STREQUAL "gnu")
  set(_triple ${_triple}.${ZN_LINUX_GLIBC})
elseif(NOT ZN_LINUX_LIBC STREQUAL "musl")
  message(FATAL_ERROR "zig-linux.cmake: ZN_LINUX_LIBC is gnu or musl")
endif()

if(NOT ZIG)
  set(ZIG $ENV{ZIG})
endif()
set(_home $ENV{ZINC_HOME})
if(NOT _home)
  set(_home $ENV{HOME}/.zinc)
endif()
if(NOT ZIG)
  file(GLOB _zigs ${_home}/toolchains/zig-*/zig)
  list(SORT _zigs)
  list(POP_BACK _zigs ZIG)
endif()
if(NOT ZIG OR NOT EXISTS "${ZIG}")
  message(FATAL_ERROR "zig-linux.cmake: no zig (run `zinc toolchain install`, or pass -DZIG=/path/to/zig)")
endif()
set(ZIG ${ZIG} CACHE FILEPATH "the zig that cross-compiles" FORCE)

# CMake takes one program per tool: wrappers that name the zig command and the target (as src/tc/tc.cpp does for the cross libraries)
set(_wrap ${CMAKE_BINARY_DIR}/zig-wrap)
file(MAKE_DIRECTORY ${_wrap})
foreach(_tool cc c++ ar ranlib)
  set(_args ${_tool})
  if(_tool STREQUAL "cc" OR _tool STREQUAL "c++")
    # zig's clang makes __DATE__ an error (reproducible builds); the QuickJS transform cache keys on it (src/qjs/qjs.cpp)
    set(_args "${_tool} -target ${_triple} ${_cpu} -Wno-error=date-time")
  endif()
  file(WRITE ${_wrap}/${_tool} "#!/bin/sh\nexec '${ZIG}' ${_args} \"$@\"\n")
  file(CHMOD ${_wrap}/${_tool} PERMISSIONS OWNER_READ OWNER_WRITE OWNER_EXECUTE GROUP_READ GROUP_EXECUTE)
endforeach()
set(CMAKE_C_COMPILER ${_wrap}/cc)
set(CMAKE_CXX_COMPILER ${_wrap}/c++)
set(CMAKE_AR ${_wrap}/ar CACHE FILEPATH "" FORCE)
set(CMAKE_RANLIB ${_wrap}/ranlib CACHE FILEPATH "" FORCE)

# Headers and libraries of the target (X11, DRM, GBM, ALSA... for SDL3 and the plugins) come only from its sysroot, the usr/ tree of
# Debian's -dev packages that tools/linux-sysroot fetches; never from this machine (Homebrew's X11 would be taken for Linux's)
set(_sysname ${ZN_LINUX_ARCH})
if(ZN_LINUX_ARCH STREQUAL "armv7")
  set(_sysname armhf)   # the same Debian armhf libraries
endif()
set(ZN_LINUX_SYSROOT ${_home}/sysroots/${_sysname}-linux CACHE PATH "the target's headers and libraries (tools/linux-sysroot)")
set(CMAKE_FIND_ROOT_PATH ${ZN_LINUX_SYSROOT})
file(GLOB _pc ${ZN_LINUX_SYSROOT}/usr/lib/*/pkgconfig)
string(REPLACE ";" ":" _pc "${_pc}")
set(ENV{PKG_CONFIG_LIBDIR} "${_pc}:${ZN_LINUX_SYSROOT}/usr/lib/pkgconfig:${ZN_LINUX_SYSROOT}/usr/share/pkgconfig")
set(ENV{PKG_CONFIG_SYSROOT_DIR} ${ZN_LINUX_SYSROOT})
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)   # host tools (python, the wrappers) come from the build machine
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_PACKAGE ONLY)
set(CMAKE_LINK_DEPENDS_USE_LINKER FALSE)   # zig's linker does not take --dependency-file (CMake asks it for shared libraries)
# zig keeps the debug information by default: a Release build is stripped (186 MB to about 40 for zinc), RelWithDebInfo keeps it for gdb
foreach(_kind EXE SHARED MODULE)
  set(CMAKE_${_kind}_LINKER_FLAGS_RELEASE_INIT "-s")
endforeach()
# zig links its libc++ and libunwind statically: the binary needs only glibc, or nothing at all with musl
if(ZN_LINUX_LIBC STREQUAL "musl")
  set(CMAKE_EXE_LINKER_FLAGS_INIT "-static")
endif()
