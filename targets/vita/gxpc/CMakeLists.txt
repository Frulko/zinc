# gxpc (targets/vita/gxpc/gxpc.c): a VPK that compiles zinc's Cg programs on a PS Vita with its SceShaccCg. VitaSDK:
#   cmake -S targets/vita/gxpc -B build/vita-gxpc -DCMAKE_TOOLCHAIN_FILE=$VITASDK/share/vita.toolchain.cmake && cmake --build build/vita-gxpc
cmake_minimum_required(VERSION 3.16)
include("$ENV{VITASDK}/share/vita.cmake" REQUIRED)
project(zinc-gxpc C)
add_executable(gxpc gxpc.c)
target_link_libraries(gxpc SceShaccCg_stub SceKernelModuleMgr_stub SceLibKernel_stub SceIofilemgr_stub SceKernelThreadMgr_stub SceProcessmgr_stub)
vita_create_self(eboot.bin gxpc UNSAFE)
vita_create_vpk(gxpc.vpk ZNGXPC001 eboot.bin VERSION 01.00 NAME "Zinc GXP compiler")
