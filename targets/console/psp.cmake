# Sony PSP (pspdev: -DCMAKE_TOOLCHAIN_FILE=$PSPDEV/psp/share/pspdev.cmake, PSPDEV set): targets/psp/hal_psp.cpp's libraries and EBOOT.PBP as a PRX
# (current firmware runs PRX; PPSSPP runs either). Small-data off (-G0): the core is larger than the 64 KiB a $gp-relative access reaches.
target_link_libraries(zinc-core PRIVATE pspdisplay pspctrl psppower pspaudio pspwlan atomic)   # libatomic: the runtime's 64-bit counters on a 32-bit MIPS
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=262144 ZN_CONSOLE_MAX_DEPTH=1000)   # 2 MiB of registers, 1000 calls deep
target_compile_options(zn_console_engine PRIVATE -G0)
target_compile_options(zinc-core PRIVATE -G0)
if(TARGET zn_console_gfx)
  target_compile_options(zn_console_gfx PRIVATE -G0)
endif()
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_CONSOLE_AUDIO_RATE=44100;ZN_CONSOLE_AUDIO_NAME=\"sceAudio\"")
create_pbp_file(TARGET zinc-core TITLE "${ZN_CONSOLE_TITLE}" BUILD_PRX)
# the GPU path (ZN-468): the command lists replayed on the GE (targets/console/ff_replay.cpp, the replay shared with the 3DS)
if(ZN_CONSOLE_GFX)
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/psp/gu_psp.cpp ${CMAKE_CURRENT_SOURCE_DIR}/ff_replay.cpp)
  set_source_files_properties(${ZN_TARGETS}/psp/gu_psp.cpp ${CMAKE_CURRENT_SOURCE_DIR}/ff_replay.cpp PROPERTIES COMPILE_OPTIONS "-w;-fpermissive" INCLUDE_DIRECTORIES "${ZN_RUNTIME}")
  target_link_libraries(zinc-core PRIVATE pspgu pspge pspdisplay)
endif()
