# Nintendo 3DS (devkitARM: -DCMAKE_TOOLCHAIN_FILE=$DEVKITPRO/cmake/3DS.cmake; tools/build-console-core runs it in devkitPro's pinned image):
# targets/n3ds/hal_n3ds.cpp with libctru, and zinc-core.3dsx, the homebrew format Azahar and the Homebrew Launcher start.
target_link_libraries(zinc-core PRIVATE ctru)
target_sources(zinc-core PRIVATE ${ZN_TARGETS}/n3ds/net_n3ds.cpp)   # the network (targets/console/console_net.h, ZN-791)
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_STACK_SLOTS=262144 ZN_CONSOLE_MAX_DEPTH=1000)   # 2 MiB of registers, 1000 calls deep
set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp PROPERTIES COMPILE_DEFINITIONS "ZN_CONSOLE_AUDIO_RATE=22050;ZN_CONSOLE_AUDIO_NAME=\"ndsp\"")
ctr_generate_smdh(zinc.smdh NAME "${ZN_CONSOLE_TITLE}" DESCRIPTION "Made with Zinc" AUTHOR "Zinc")   # the name the Homebrew Launcher shows
ctr_create_3dsx(zinc-core SMDH zinc.smdh)
# the GPU path (ZN-469): the command lists replayed on the PICA200 with citro3d (targets/console/ff_replay.cpp, the replay shared with the PSP),
# its vertex shader assembled by picasso and linked in
if(ZN_CONSOLE_GFX)
  ctr_add_shader_library(ff_shader ${ZN_TARGETS}/n3ds/ff.v.pica)
  dkp_add_embedded_binary_library(ff_shader_bin ff_shader)
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/n3ds/c3d_n3ds.cpp ${CMAKE_CURRENT_SOURCE_DIR}/ff_replay.cpp)
  set_source_files_properties(${ZN_TARGETS}/n3ds/c3d_n3ds.cpp ${CMAKE_CURRENT_SOURCE_DIR}/ff_replay.cpp PROPERTIES COMPILE_OPTIONS "-w;-fpermissive" INCLUDE_DIRECTORIES "${ZN_RUNTIME}")
  target_link_libraries(zinc-core PRIVATE ff_shader_bin citro3d ctru)
endif()
# zinc:3d on the PICA200 (plugins/3d/native/render3d.n3ds.cpp): its lighting vertex shader, assembled by picasso
if(TARGET zn_console_3d)
  ctr_add_shader_library(r3d_shader ${ZN_NEXT}/plugins/3d/native/render3d.n3ds.v.pica)
  dkp_add_embedded_binary_library(r3d_shader_bin r3d_shader)
  target_link_libraries(zn_console_3d PRIVATE r3d_shader_bin citro3d ctru)
endif()
# the device player (ZN-792): mbedTLS's entropy from the ps:ps service (targets/n3ds/player_n3ds.cpp)
if(ZN_CONSOLE_PLAYER)
  target_sources(zinc-core PRIVATE ${ZN_TARGETS}/n3ds/player_n3ds.cpp)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_OWN_ENTROPY)
endif()
