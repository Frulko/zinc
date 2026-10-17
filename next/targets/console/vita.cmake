# PS Vita (VitaSDK: -DCMAKE_TOOLCHAIN_FILE=$VITASDK/share/vita.toolchain.cmake, VITASDK set): targets/vita/hal_vita.cpp's libraries, eboot.bin (a
# SELF) and zinc.vpk, the package Vita3K and VitaShell install (title id ZINC00001).
include("$ENV{VITASDK}/share/vita.cmake" REQUIRED)
target_link_libraries(zinc-core PRIVATE SceDisplay_stub SceCtrl_stub SceLibKernel_stub SceSysmem_stub SceKernelThreadMgr_stub SceProcessmgr_stub)
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=1048576 ZN_CONSOLE_MAX_DEPTH=4000)   # 8 MiB of registers, 4000 calls deep
vita_create_self(eboot.bin zinc-core UNSAFE)
vita_create_vpk(zinc.vpk ZINC00001 eboot.bin VERSION 01.00 NAME "Zinc")
