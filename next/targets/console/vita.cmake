# PS Vita (VitaSDK: -DCMAKE_TOOLCHAIN_FILE=$VITASDK/share/vita.toolchain.cmake, VITASDK set): targets/vita/hal_vita.cpp's libraries, eboot.bin (a
# SELF) and zinc.vpk, the package Vita3K and VitaShell install (title id ZN_CONSOLE_ID, ZINC00001 by default).
include("$ENV{VITASDK}/share/vita.cmake" REQUIRED)
target_link_libraries(zinc-core PRIVATE SceDisplay_stub SceCtrl_stub SceLibKernel_stub SceSysmem_stub SceKernelThreadMgr_stub SceProcessmgr_stub ScePower_stub
  SceAudio_stub SceTouch_stub SceMotion_stub SceNet_stub SceNetCtl_stub SceSysmodule_stub SceCamera_stub SceAppMgr_stub SceGxm_stub)
# the GPU path (ZN-471): the command lists replayed with GXM, SDL3's precompiled GXP programs (zlib) from the vendored SDL3
if(ZN_CONSOLE_GFX)
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/vita/gxm_vita.cpp)
  set_source_files_properties(${ZN_TARGETS}/vita/gxm_vita.cpp PROPERTIES COMPILE_OPTIONS "-w" INCLUDE_DIRECTORIES "${ZN_RUNTIME};${ZN_NEXT}/third_party/SDL3/src/render/vitagxm")
endif()
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=1048576 ZN_CONSOLE_MAX_DEPTH=4000)   # 8 MiB of registers, 4000 calls deep
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_CONSOLE_AUDIO_RATE=48000;ZN_CONSOLE_AUDIO_NAME=\"sceAudioOut\"")
vita_create_self(eboot.bin zinc-core UNSAFE)
vita_create_vpk(zinc.vpk ${ZN_CONSOLE_ID} eboot.bin VERSION 01.00 NAME "${ZN_CONSOLE_TITLE}")
