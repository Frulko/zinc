# The console core (ZN-454, ZN-455): the interpreter, src/rt, the console system host and an entry that loads program.zbc, built by a console's own SDK
# (its CMake toolchain file) or, for the tests, by this machine's compiler with the headless HAL. No libuv, no mimalloc, no dlopen.
#
#   cmake -S targets/console -B build-core                                             # this machine, headless HAL (the T0 tests)
#   cmake -S targets/console -B build-psp -DCMAKE_TOOLCHAIN_FILE=$PSPDEV/psp/share/pspdev.cmake -DZN_CONSOLE=psp -DZN_CONSOLE_HAL=<hal.cpp>
#
# ZN_CONSOLE names the platform (zinc:sys platform(), default "console"); ZN_CONSOLE_HAL the HAL source of the console (runtime/include/hal.h; default
# the headless HAL of targets/null with the POSIX helpers of targets/common); ZN_CONSOLE_GFX OFF builds the pure core (no zinc:gfx);
# ZN_CONSOLE_EMBED a program.zbc linked into the binary (then it reads no file: a console whose emulator gives no file system).
cmake_minimum_required(VERSION 3.16)
project(zinc_console C CXX)

set(ZN_CONSOLE "console" CACHE STRING "the platform name of the core")
set(ZN_CONSOLE_HAL "" CACHE FILEPATH "the HAL of the console (runtime/include/hal.h)")
option(ZN_CONSOLE_GFX "link the graphics host (zinc:gfx)" ON)
set(ZN_CONSOLE_EMBED "" CACHE FILEPATH "a program.zbc to link into the core")
set(ZN_CONSOLE_EMBED_RES "" CACHE FILEPATH "the resources.bin that goes with it")
set(ZN_CONSOLE_EMBED_PACK "" CACHE FILEPATH "the asset pack (zinc pack's packs/default.zpk) that goes with it")
set(ZN_CONSOLE_SIZE "" CACHE STRING "the surface, WxH (the screen of the console: psp 480x272, vita 960x544, ps2 640x448); ZINC_SIZE at run time wins")
set(ZN_CONSOLE_FRAMES "0" CACHE STRING "a frame budget built into the HAL (ZINC_FRAMES of the emulator tests); 0: until the program ends")
set(ZN_CONSOLE_TITLE "Zinc" CACHE STRING "the name the console's menu shows (PSP, Vita, 3DS)")
set(ZN_CONSOLE_ID "ZINC00001" CACHE STRING "the Vita title id (four letters, five digits): one per program, or they replace each other")
set(ZN_CONSOLE_INPUT "" CACHE STRING "a pad session built into the HAL (console_pad.h: frame+Name,frame-Name,...)")
set(ZN_CONSOLE_ENV "" CACHE STRING "environment of the program, NAME=VALUE,... (ZINC_PROFILE=1: the frame times at exit)")

get_filename_component(ZN_NEXT ${CMAKE_CURRENT_SOURCE_DIR}/../.. ABSOLUTE)
get_filename_component(ZN_RUNTIME ${ZN_NEXT}/runtime ABSOLUTE)
get_filename_component(ZN_TARGETS ${ZN_NEXT}/targets ABSOLUTE)
if(NOT ZN_CONSOLE_HAL AND EXISTS ${ZN_TARGETS}/${ZN_CONSOLE}/hal_${ZN_CONSOLE}.cpp)   # targets/<console>/hal_<console>.cpp, shared with the prototype
  set(ZN_CONSOLE_HAL ${ZN_TARGETS}/${ZN_CONSOLE}/hal_${ZN_CONSOLE}.cpp)
endif()
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()

# the engine (C++20): the same files as the WASI build (tools/build-wasm), the plain allocator
add_library(zn_console_engine STATIC ${ZN_NEXT}/src/rt/alloc.cpp ${ZN_NEXT}/src/rt/machine.cpp ${ZN_NEXT}/src/rt/program.cpp ${ZN_NEXT}/src/rt/rtcalls.cpp
  ${ZN_NEXT}/src/rt/unicode.cpp ${ZN_NEXT}/src/zbc/zbc.cpp ${ZN_NEXT}/src/vm/vm.cpp ${ZN_NEXT}/third_party/quickjs-ng/libunicode.c)
set_target_properties(zn_console_engine PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
target_include_directories(zn_console_engine PUBLIC ${ZN_NEXT}/include ${ZN_NEXT}/src ${ZN_NEXT}/third_party/quickjs-ng)
target_compile_definitions(zn_console_engine PUBLIC ZN_NO_MIMALLOC $<$<BOOL:${CMAKE_CROSSCOMPILING}>:ZN_NO_MMAP>)   # a console has no mmap
target_compile_options(zn_console_engine PRIVATE -fwrapv -ffp-contract=off $<$<COMPILE_LANGUAGE:C>:-w>)

set(ZN_CORE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/core_main.cpp ${CMAKE_CURRENT_SOURCE_DIR}/host_console.cpp ${CMAKE_CURRENT_SOURCE_DIR}/stubs.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp   # zinc:audio's mixer (ZN-759): the one native module a core links
  ${ZN_NEXT}/plugins/audio/vendor/stb_vorbis.c)   # its Ogg Vorbis decoder, the one plugins/audio vendors (stb_vorbis 1.22, public domain)
set_source_files_properties(${ZN_NEXT}/plugins/audio/vendor/stb_vorbis.c PROPERTIES COMPILE_OPTIONS "-w")
if(ZN_CONSOLE_HAL)
  list(APPEND ZN_CORE_SRC ${ZN_CONSOLE_HAL})
else()
  list(APPEND ZN_CORE_SRC ${ZN_TARGETS}/null/hal_null.cpp ${ZN_TARGETS}/common/hal_posix.cpp)
endif()
if(ZN_CONSOLE_EMBED)   # program.zbc (and resources.bin) as arrays in a generated C file
  set(ZN_EMBED_C ${CMAKE_CURRENT_BINARY_DIR}/embedded_program.c)
  add_custom_command(OUTPUT ${ZN_EMBED_C} COMMAND ${CMAKE_COMMAND} -DZBC=${ZN_CONSOLE_EMBED} -DRES=${ZN_CONSOLE_EMBED_RES} -DPACK=${ZN_CONSOLE_EMBED_PACK} -DOUT=${ZN_EMBED_C}
    -P ${CMAKE_CURRENT_SOURCE_DIR}/embed.cmake DEPENDS ${ZN_CONSOLE_EMBED} ${ZN_CONSOLE_EMBED_RES} ${ZN_CONSOLE_EMBED_PACK} ${CMAKE_CURRENT_SOURCE_DIR}/embed.cmake)
  list(APPEND ZN_CORE_SRC ${ZN_EMBED_C})
endif()
add_executable(zinc-core ${ZN_CORE_SRC})
target_link_libraries(zinc-core PRIVATE zn_console_engine)
# the reader of ZPK packs (zinc:assets, ZN-759) with its decoders: lz4, zstd's decompressor, SHA-256 (the entries' checksums)
file(GLOB ZN_CONSOLE_ZSTD ${ZN_NEXT}/third_party/zstd/common/*.c ${ZN_NEXT}/third_party/zstd/decompress/*.c)
add_library(zn_console_zpk STATIC ${ZN_NEXT}/src/zpk/zpk.cpp ${ZN_NEXT}/third_party/lz4/lz4.c ${ZN_NEXT}/third_party/sha256/sha256.c ${ZN_CONSOLE_ZSTD})
set_target_properties(zn_console_zpk PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON C_STANDARD 99)
target_include_directories(zn_console_zpk PUBLIC ${ZN_NEXT}/src ${ZN_NEXT}/include PRIVATE ${ZN_NEXT}/third_party/lz4 ${ZN_NEXT}/third_party/zstd ${ZN_NEXT}/third_party/sha256)
target_compile_definitions(zn_console_zpk PRIVATE ZSTD_DISABLE_ASM)
target_compile_options(zn_console_zpk PRIVATE -w -O2)
target_link_libraries(zinc-core PRIVATE zn_console_zpk)
target_include_directories(zinc-core PRIVATE ${ZN_RUNTIME}/include ${CMAKE_CURRENT_SOURCE_DIR})   # console_pad.h for the HALs
target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_PLATFORM="${ZN_CONSOLE}")
target_compile_options(zinc-core PRIVATE -Wall -Wextra)
set_target_properties(zinc-core PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS ON)   # gnu++20: newlib shows setenv and gettimeofday only then

if(ZN_CONSOLE_GFX)
  # the graphics host over the old runtime (zrt, raster, gfx), compiled with the runtime's own flags as in CMakeLists.txt
  add_library(zn_console_gfx STATIC ${ZN_NEXT}/src/host/gfx_host.cpp ${ZN_NEXT}/src/host/resources.cpp ${CMAKE_CURRENT_SOURCE_DIR}/gfx_stubs.cpp
    ${ZN_RUNTIME}/zrt.cpp ${ZN_RUNTIME}/host.cpp ${ZN_RUNTIME}/raster.cpp ${ZN_RUNTIME}/ttf.cpp ${ZN_RUNTIME}/gfx.cpp)
  set_target_properties(zn_console_gfx PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
  target_include_directories(zn_console_gfx PRIVATE ${ZN_NEXT}/include ${ZN_NEXT}/src ${ZN_RUNTIME} ${ZN_RUNTIME}/include)
  target_compile_options(zn_console_gfx PRIVATE -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -w)
  target_compile_definitions(zn_console_gfx PRIVATE ZRT_PLATFORM="${ZN_CONSOLE}" $<$<BOOL:${ZN_CONSOLE_HAL}>:ZN_CONSOLE_LIVE=1>)
  if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")   # newlib of the PSP, PS2 and 3DS makes int32_t a long: the runtime mixes int* and int32_t* (the same 32 bits)
    target_compile_options(zn_console_gfx PRIVATE -fpermissive)
  endif()
  target_link_libraries(zinc-core PRIVATE zn_console_gfx)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_WITH_GFX)
endif()
# zinc:3d (its native module Render3D) when tools/build-console-core generated its bindings (ZN_CONSOLE_GEN): the console's GPU renderer,
# plugins/3d/native/render3d.<console>.cpp (it includes the software one and falls back to it), else the software renderer alone
set(ZN_CONSOLE_GEN "" CACHE PATH "the zinc:3d bindings made by zinc native-gen (zinc_native_render3d.h and its thunk)")
if(ZN_CONSOLE_GFX AND ZN_CONSOLE_GEN AND EXISTS ${ZN_CONSOLE_GEN}/zinc_native_render3d_thunk.cpp)
  set(ZN_3D_SRC ${ZN_NEXT}/plugins/3d/native/render3d.host.cpp)
  if(EXISTS ${ZN_NEXT}/plugins/3d/native/render3d.${ZN_CONSOLE}.cpp)
    set(ZN_3D_SRC ${ZN_NEXT}/plugins/3d/native/render3d.${ZN_CONSOLE}.cpp)
  endif()
  add_library(zn_console_3d STATIC ${ZN_3D_SRC} ${ZN_CONSOLE_GEN}/zinc_native_render3d_thunk.cpp)
  set_target_properties(zn_console_3d PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS ON)
  target_include_directories(zn_console_3d PRIVATE ${ZN_CONSOLE_GEN} ${ZN_NEXT}/plugins/3d/native ${ZN_NEXT}/include ${ZN_NEXT}/src ${ZN_RUNTIME} ${ZN_RUNTIME}/include
    ${CMAKE_CURRENT_SOURCE_DIR})
  target_compile_options(zn_console_3d PRIVATE -fno-exceptions -fno-rtti -fwrapv -fno-threadsafe-statics -w $<$<CXX_COMPILER_ID:GNU>:-fpermissive>)
  target_link_libraries(zinc-core PRIVATE zn_console_3d)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_WITH_3D)
  set_source_files_properties(${CMAKE_CURRENT_SOURCE_DIR}/stubs.cpp PROPERTIES COMPILE_DEFINITIONS ZN_CONSOLE_WITH_3D)
endif()
if(ZN_CONSOLE_SIZE)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_SIZE="${ZN_CONSOLE_SIZE}")
endif()
if(ZN_CONSOLE_ENV)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_ENV="${ZN_CONSOLE_ENV}")
endif()
if(ZN_CONSOLE_HAL)
  set_source_files_properties(${ZN_CONSOLE_HAL} PROPERTIES COMPILE_DEFINITIONS "ZINC_FRAMES=${ZN_CONSOLE_FRAMES};ZN_CONSOLE_INPUT=\"${ZN_CONSOLE_INPUT}\"" COMPILE_OPTIONS "-w")   # a console SDK's headers are not warning-free
endif()

# the console's own part (<console>.cmake here): its SDK libraries and the packing of the binary (EBOOT.PBP, VPK, ELF)
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/${ZN_CONSOLE}.cmake)
  include(${CMAKE_CURRENT_SOURCE_DIR}/${ZN_CONSOLE}.cmake)
endif()
