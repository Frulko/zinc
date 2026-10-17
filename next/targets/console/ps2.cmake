# PlayStation 2 (ps2dev: -DCMAKE_TOOLCHAIN_FILE=$PS2DEV/share/ps2dev.cmake, PS2DEV and PS2SDK set): targets/ps2/hal_ps2.cpp (the prototype's HAL:
# gsKit display, libpad) and its libraries; the core is an ELF that PCSX2 boots with the user's BIOS (-elf) and Play! without one (--elf).
target_link_libraries(zinc-core PRIVATE gskit dmakit pad patches atomic)
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=262144 ZN_CONSOLE_MAX_DEPTH=1000)   # 2 MiB of registers of the 32 MiB, 1000 calls deep
