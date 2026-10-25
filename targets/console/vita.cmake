# PS Vita (VitaSDK: -DCMAKE_TOOLCHAIN_FILE=$VITASDK/share/vita.toolchain.cmake, VITASDK set): targets/vita/hal_vita.cpp's libraries, eboot.bin (a
# SELF) and zinc.vpk, the package Vita3K and VitaShell install (title id ZN_CONSOLE_ID, ZINC00001 by default).
include("$ENV{VITASDK}/share/vita.cmake" REQUIRED)
target_link_libraries(zinc-core PRIVATE SceDisplay_stub SceCtrl_stub SceLibKernel_stub SceSysmem_stub SceKernelThreadMgr_stub SceProcessmgr_stub ScePower_stub
  SceAudio_stub SceTouch_stub SceMotion_stub SceNet_stub SceNetCtl_stub SceSysmodule_stub SceCamera_stub SceAppMgr_stub SceGxm_stub)
target_sources(zinc-core PRIVATE ${ZN_TARGETS}/vita/net_vita.cpp)   # the network (targets/console/console_net.h, ZN-791)
# the vitaGL path (owner, 2026-10-24): the GLES 2 replay of runtime/gl_replay.cpp on vitaGL (third_party/vitagl, LGPL-3.0, its GLSL compiled
# at run time by the console's SceShaccCg: the user extracts ur0:data/libshacccg.suprx), instead of the GXM replay below
option(ZN_VITA_GL "replay zinc:gfx through vitaGL and the GLES 2 replay instead of GXM (needs libshacccg.suprx on the console)" OFF)
if(ZN_CONSOLE_GFX AND ZN_VITA_GL)
  set(VGL ${ZN_NEXT}/third_party/vitagl)
  set(VGL_FLAGS -O3 -ffast-math -mtune=cortex-a9 -mfpu=neon -w "$<$<COMPILE_LANGUAGE:C>:-std=gnu11;-Wno-incompatible-pointer-types;-Wno-int-conversion>")   # its Makefile's, for GCC 15
  file(GLOB VGL_SRC ${VGL}/vitaGL/source/*.c ${VGL}/vitaGL/source/utils/*.c ${VGL}/vitaGL/source/utils/preprocessor/*.c
    ${VGL}/vitaGL/source/utils/*.cpp ${VGL}/vitaGL/source/utils/preprocessor/*.cpp)   # the GLSL preprocessor throws: exceptions on
  file(GLOB VGL_NEON ${VGL}/math-neon/source/*.c)
  add_library(zn_vitagl STATIC ${VGL_SRC} ${VGL_NEON} ${VGL}/vitaShaRK/source/vitashark.c ${VGL}/SceShaccCgExt/src/shacccg_ext.c ${VGL}/SceShaccCgExt/src/shacccg_ext_oop.cpp)
  target_include_directories(zn_vitagl PUBLIC ${VGL}/vitaGL/source ${VGL}/vitaShaRK/source ${VGL}/math-neon/source ${VGL}/SceShaccCgExt/include ${VGL}/taihen/include)
  target_compile_options(zn_vitagl PRIVATE ${VGL_FLAGS} -mfp16-format=ieee)
  set_source_files_properties(${VGL}/SceShaccCgExt/src/shacccg_ext_oop.cpp PROPERTIES COMPILE_OPTIONS "-fno-exceptions;-fno-rtti;-fpermissive;-std=gnu++11")   # its CMakeLists'
  target_compile_definitions(zn_vitagl PRIVATE VGL_GIT_HASH="76f43e6" SKIP_SPLASHSCREEN
    HAVE_SHADER_CACHE)   # the GXP of each compiled program in ux0:data/shader_cache/<title id>: the Cg compile (0.7 to 1.7 s a program) only once
  target_link_libraries(zn_vitagl PUBLIC ${VGL}/taihen/lib/libtaihen_stub.a SceShaccCg_stub SceKernelDmacMgr_stub SceCommonDialog_stub SceAppMgr_stub
    SceKernelModuleMgr_stub SceGxm_stub SceDisplay_stub SceSysmodule_stub SceLibKernel_stub SceKernelThreadMgr_stub SceRtc_stub pthread m)   # after the archive: GNU ld reads left to right
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/vita/gl_vita.cpp)
  set_source_files_properties(${ZN_TARGETS}/vita/gl_vita.cpp PROPERTIES COMPILE_OPTIONS "-w" INCLUDE_DIRECTORIES "${ZN_RUNTIME}")
  target_link_libraries(zinc-core PRIVATE zn_vitagl)
elseif(ZN_CONSOLE_GFX)
# the GPU path (ZN-471): the command lists replayed with GXM, SDL3's precompiled GXP programs (zlib) from the vendored SDL3
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/vita/gxm_vita.cpp ${CMAKE_CURRENT_SOURCE_DIR}/ff_replay.cpp)   # the replay shared with the PSP and the 3DS
  set_source_files_properties(${ZN_TARGETS}/vita/gxm_vita.cpp ${CMAKE_CURRENT_SOURCE_DIR}/ff_replay.cpp PROPERTIES COMPILE_OPTIONS "-w" INCLUDE_DIRECTORIES "${ZN_RUNTIME};${ZN_NEXT}/third_party/SDL3/src/render/vitagxm")
endif()
if(TARGET zn_console_3d)   # zinc:3d on GXM (plugins/3d/native/render3d.vita.cpp): SDL's texture fragment program and the vertex program of shaders/
  target_include_directories(zn_console_3d PRIVATE ${ZN_NEXT}/third_party/SDL3/src/render/vitagxm ${ZN_TARGETS}/vita/shaders)
endif()
# the 3D path (ZN-493, first milestone): gxm_3d.cpp's draw entrypoint, only with the compiled colour pair;
# default off, the 2D replay above builds and behaves unchanged (targets/vita/shaders/README.md).
set(ZN_VITA_GXP_3D OFF CACHE BOOL "compile the GXM 3D path (needs targets/vita/shaders/zn_gxp_3d.h, the generated GXP blob header)")
if(ZN_VITA_GXP_3D)
  if(NOT EXISTS "${ZN_TARGETS}/vita/shaders/zn_gxp_3d.h")
    message(FATAL_ERROR "ZN_VITA_GXP_3D=1 without targets/vita/shaders/zn_gxp_3d.h: compile the 3D colour pair with the Vita shader compiler (targets/vita/shaders/README.md)")
  endif()
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/vita/gxm_3d.cpp)
  set_source_files_properties(${ZN_TARGETS}/vita/gxm_3d.cpp PROPERTIES COMPILE_OPTIONS "-w" INCLUDE_DIRECTORIES "${ZN_TARGETS}/vita/shaders")
  target_compile_definitions(zinc-core PRIVATE ZN_VITA_GXP_3D=1)
endif()
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=1048576 ZN_CONSOLE_MAX_DEPTH=4000)   # 8 MiB of registers, 4000 calls deep
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_CONSOLE_AUDIO_RATE=48000;ZN_CONSOLE_AUDIO_NAME=\"sceAudioOut\"")
vita_create_self(eboot.bin zinc-core UNSAFE)
vita_create_vpk(zinc.vpk ${ZN_CONSOLE_ID} eboot.bin VERSION 01.00 NAME "${ZN_CONSOLE_TITLE}")
