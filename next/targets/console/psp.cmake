# Sony PSP (pspdev: -DCMAKE_TOOLCHAIN_FILE=$PSPDEV/psp/share/pspdev.cmake, PSPDEV set): targets/psp/hal_psp.cpp's libraries and EBOOT.PBP as a PRX
# (current firmware runs PRX; PPSSPP runs either). Small-data off (-G0): the core is larger than the 64 KiB a $gp-relative access reaches.
target_link_libraries(zinc-core PRIVATE pspdisplay pspctrl psppower atomic)   # libatomic: the runtime's 64-bit counters on a 32-bit MIPS
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=262144 ZN_CONSOLE_MAX_DEPTH=1000)   # 2 MiB of registers, 1000 calls deep
target_compile_options(zn_console_engine PRIVATE -G0)
target_compile_options(zinc-core PRIVATE -G0)
if(TARGET zn_console_gfx)
  target_compile_options(zn_console_gfx PRIVATE -G0)
endif()
create_pbp_file(TARGET zinc-core TITLE "${ZN_CONSOLE_TITLE}" BUILD_PRX)
