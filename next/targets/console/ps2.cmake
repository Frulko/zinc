# PlayStation 2 (ps2dev: -DCMAKE_TOOLCHAIN_FILE=$PS2DEV/share/ps2dev.cmake, PS2DEV and PS2SDK set): targets/ps2/hal_ps2.cpp (the prototype's HAL:
# gsKit display, libpad) and its libraries; the core is an ELF that PCSX2 boots with the user's BIOS (-elf) and Play! without one (--elf).
target_link_libraries(zinc-core PRIVATE gskit dmakit pad audsrv mc patches atomic)
# audsrv's IOP modules linked in as arrays (ps2sdk's bin2c): the core reads no file (ZN-759)
foreach(irx libsd audsrv)
  add_custom_command(OUTPUT ${CMAKE_CURRENT_BINARY_DIR}/${irx}_irx.c COMMAND $ENV{PS2SDK}/bin/bin2c $ENV{PS2SDK}/iop/irx/${irx}.irx ${CMAKE_CURRENT_BINARY_DIR}/${irx}_irx.c ${irx}_irx
    DEPENDS $ENV{PS2SDK}/iop/irx/${irx}.irx)
  target_sources(zinc-core PRIVATE ${CMAKE_CURRENT_BINARY_DIR}/${irx}_irx.c)
endforeach()
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_CONSOLE_AUDIO_RATE=48000;ZN_CONSOLE_AUDIO_NAME=\"audsrv (SPU2)\"")
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=262144 ZN_CONSOLE_MAX_DEPTH=1000)   # 2 MiB of registers of the 32 MiB, 1000 calls deep
