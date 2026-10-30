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
set(ZN_CONSOLE_ART "${CMAKE_CURRENT_SOURCE_DIR}/art" CACHE PATH "the menu art: psp/ICON0.PNG, PIC1.PNG and vita/icon0.png, bg.png, startup.png (palette PNGs), each optional")
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

# ZN_CONSOLE_AOT: a directory with the program's C++ for the console's profile (ZN_AOT_CPP_ONLY=1 zinc build --profile <console>: program.cpp and
# its program.partN.cpp, ZN-480): the program runs compiled, and its C++ provides Machine::exec in place of the interpreter (src/vm stays out)
set(ZN_CONSOLE_AOT "" CACHE PATH "the program compiled to C++ (tools/build-console-core --aot)")
set(ZN_ENGINE_EXEC ${ZN_NEXT}/src/vm/vm.cpp)
if(ZN_CONSOLE_AOT)
  set(ZN_ENGINE_EXEC "")
endif()
# the engine (C++20): the same files as the WASI build (tools/build-wasm), the plain allocator
add_library(zn_console_engine STATIC ${ZN_NEXT}/src/rt/alloc.cpp ${ZN_NEXT}/src/rt/machine.cpp ${ZN_NEXT}/src/rt/program.cpp ${ZN_NEXT}/src/rt/worker.cpp ${ZN_NEXT}/src/rt/rtcalls.cpp
  ${ZN_NEXT}/src/rt/unicode.cpp ${ZN_NEXT}/src/zbc/zbc.cpp ${ZN_ENGINE_EXEC} ${ZN_NEXT}/third_party/quickjs-ng/libunicode.c)
set_target_properties(zn_console_engine PROPERTIES CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
target_include_directories(zn_console_engine PUBLIC ${ZN_NEXT}/include ${ZN_NEXT}/src ${ZN_NEXT}/third_party/quickjs-ng)
target_compile_definitions(zn_console_engine PUBLIC ZN_NO_MIMALLOC $<$<BOOL:${CMAKE_CROSSCOMPILING}>:ZN_NO_MMAP>)   # a console has no mmap
target_compile_options(zn_console_engine PRIVATE -fwrapv -ffp-contract=off $<$<COMPILE_LANGUAGE:C>:-w>)

set(ZN_CORE_SRC ${CMAKE_CURRENT_SOURCE_DIR}/core_main.cpp ${CMAKE_CURRENT_SOURCE_DIR}/host_console.cpp ${CMAKE_CURRENT_SOURCE_DIR}/stubs.cpp
  ${CMAKE_CURRENT_SOURCE_DIR}/audio_console.cpp   # zinc:audio's mixer (ZN-759), a native module linked into the core
  ${ZN_NEXT}/plugins/lan/native/lan.abi.cpp       # zinc:lan, polled sockets (ZN-791); the network comes up in targets/<console>/net_<console>.cpp
  ${ZN_NEXT}/plugins/audio/vendor/stb_vorbis.c)   # its Ogg Vorbis decoder, the one plugins/audio vendors (stb_vorbis 1.22, public domain)
set_source_files_properties(${ZN_NEXT}/plugins/audio/vendor/stb_vorbis.c PROPERTIES COMPILE_OPTIONS "-w")
if(ZN_CONSOLE_HAL)
  list(APPEND ZN_CORE_SRC ${ZN_CONSOLE_HAL})
else()
  list(APPEND ZN_CORE_SRC ${ZN_TARGETS}/null/hal_null.cpp ${ZN_TARGETS}/common/hal_posix.cpp)
endif()
if(ZN_CONSOLE_EMBED OR ZN_CONSOLE_EMBED_PACK)   # program.zbc (and resources.bin, the asset pack) as arrays in a generated C file; a compiled program: the pack alone
  set(ZN_EMBED_C ${CMAKE_CURRENT_BINARY_DIR}/embedded_program.c)
  add_custom_command(OUTPUT ${ZN_EMBED_C} COMMAND ${CMAKE_COMMAND} -DZBC=${ZN_CONSOLE_EMBED} -DRES=${ZN_CONSOLE_EMBED_RES} -DPACK=${ZN_CONSOLE_EMBED_PACK} -DOUT=${ZN_EMBED_C}
    -P ${CMAKE_CURRENT_SOURCE_DIR}/embed.cmake DEPENDS ${ZN_CONSOLE_EMBED} ${ZN_CONSOLE_EMBED_RES} ${ZN_CONSOLE_EMBED_PACK} ${CMAKE_CURRENT_SOURCE_DIR}/embed.cmake)
  list(APPEND ZN_CORE_SRC ${ZN_EMBED_C})
endif()
add_executable(zinc-core ${ZN_CORE_SRC})
target_link_libraries(zinc-core PRIVATE zn_console_engine)
if(ZN_CONSOLE_AOT)   # the compiled program: zinc build's flags (-O2, no fused multiply-add, no exceptions) and the console's CPU
  file(GLOB ZN_AOT_SRC CONFIGURE_DEPENDS ${ZN_CONSOLE_AOT}/program*.cpp)
  set(ZN_AOT_CPU "")
  if(ZN_CONSOLE STREQUAL "psp")
    set(ZN_AOT_CPU "-march=allegrex;-G0")
  elseif(ZN_CONSOLE STREQUAL "vita")
    set(ZN_AOT_CPU "-mcpu=cortex-a9;-mfpu=neon")
  elseif(ZN_CONSOLE STREQUAL "n3ds")
    set(ZN_AOT_CPU "-march=armv6k;-mtune=mpcore")
  endif()
  target_sources(zinc-core PRIVATE ${ZN_AOT_SRC})
  set_source_files_properties(${ZN_AOT_SRC} PROPERTIES COMPILE_DEFINITIONS ZN_CONSOLE_CORE
    COMPILE_OPTIONS "-O2;-ffp-contract=off;-fno-exceptions;-fno-rtti;-fwrapv;-w;${ZN_AOT_CPU}")
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_AOT)
endif()
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
if(ZN_CONSOLE_GFX AND ZN_CONSOLE_GEN AND EXISTS ${ZN_CONSOLE_GEN}/zinc_native_physics2d_thunk.cpp)
  add_library(zn_console_physics2d STATIC
    ${ZN_NEXT}/plugins/physics2d/native/physics2d.host.cpp
    ${ZN_NEXT}/plugins/physics2d/vendor/box2d.c
    ${ZN_CONSOLE_GEN}/zinc_native_physics2d_thunk.cpp)
  set_target_properties(zn_console_physics2d PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON C_STANDARD 11 C_STANDARD_REQUIRED ON)
  target_include_directories(zn_console_physics2d PRIVATE ${ZN_CONSOLE_GEN} ${ZN_NEXT}/plugins/physics2d/vendor/box2d/include
    ${ZN_NEXT}/include ${ZN_NEXT}/src ${ZN_RUNTIME} ${ZN_RUNTIME}/include)
  target_compile_definitions(zn_console_physics2d PRIVATE NDEBUG BOX2D_DISABLE_SIMD)
  target_compile_options(zn_console_physics2d PRIVATE -ffp-contract=off $<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions;-fno-rtti>)
  target_link_libraries(zinc-core PRIVATE zn_console_physics2d)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_WITH_PHYSICS2D)
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

# The device player (ZN-792, docs/reports/device-player-consoles-mobiles.md): no program of its own, the agent's protocol on the console's network
# (src/agent/player.cpp, chan.cpp, src/host/tls.cpp, yyjson) and mbedTLS trimmed to its two kinds of session (mbedtls_console.h). The console's
# entropy is its <console>.cmake's (targets/<console>/player_<console>.cpp, ZN_CONSOLE_OWN_ENTROPY); the host build reads /dev/urandom.
option(ZN_CONSOLE_PLAYER "the device player: waits for zinc device and runs what it sends" OFF)
set(ZN_CONSOLE_VERSION "" CACHE STRING "the engine version the player reports (tools/build-console-core passes zinc's; empty: git describe)")
if(ZN_CONSOLE_PLAYER)
  set(_zn_ver "${ZN_CONSOLE_VERSION}")
  if(NOT _zn_ver)
    execute_process(COMMAND git describe --tags --match "v[0-9]*" WORKING_DIRECTORY "${ZN_NEXT}" OUTPUT_VARIABLE _zn_ver OUTPUT_STRIP_TRAILING_WHITESPACE ERROR_QUIET)
    string(REGEX REPLACE "^v" "" _zn_ver "${_zn_ver}")
    string(REGEX REPLACE "-([0-9]+)-g([0-9a-f]+)$" "+\\1.g\\2" _zn_ver "${_zn_ver}")
    if(NOT _zn_ver)
      set(_zn_ver "0.0.0-dev")
    endif()
  endif()
  set(MT ${ZN_NEXT}/third_party/mbedtls)
  file(GLOB ZN_PLAYER_TLS ${MT}/library/*.c ${MT}/tf-psa-crypto/core/*.c ${MT}/tf-psa-crypto/drivers/builtin/src/*.c)
  add_library(zn_console_mbedtls STATIC ${ZN_PLAYER_TLS} ${ZN_NEXT}/third_party/yyjson/yyjson.c)
  target_include_directories(zn_console_mbedtls PUBLIC ${MT}/include ${MT}/tf-psa-crypto/include ${MT}/tf-psa-crypto/drivers/builtin/include ${ZN_NEXT}/third_party/yyjson
    PRIVATE ${MT}/library ${MT}/tf-psa-crypto/core ${MT}/tf-psa-crypto/drivers/builtin/src)
  target_compile_definitions(zn_console_mbedtls PUBLIC "MBEDTLS_USER_CONFIG_FILE=\"${CMAKE_CURRENT_SOURCE_DIR}/mbedtls_console.h\""
    "TF_PSA_CRYPTO_USER_CONFIG_FILE=\"${CMAKE_CURRENT_SOURCE_DIR}/mbedtls_console.h\"")
  set_target_properties(zn_console_mbedtls PROPERTIES C_STANDARD 99)
  target_compile_options(zn_console_mbedtls PRIVATE -w -Os -ffunction-sections -fdata-sections)
  set(ZN_PLAYER_KIND "")
  set(ZN_PLAYER_ARCH "")
  if(ZN_CONSOLE STREQUAL "psp")
    set(ZN_PLAYER_KIND "PSP")
    set(ZN_PLAYER_ARCH "mips")
  elseif(ZN_CONSOLE STREQUAL "vita")
    set(ZN_PLAYER_KIND "PS Vita")
    set(ZN_PLAYER_ARCH "armv7")
  elseif(ZN_CONSOLE STREQUAL "n3ds")
    set(ZN_PLAYER_KIND "3DS")
    set(ZN_PLAYER_ARCH "arm11")
  endif()
  target_sources(zinc-core PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/player_console.cpp ${ZN_NEXT}/src/agent/player.cpp ${ZN_NEXT}/src/agent/chan.cpp ${ZN_NEXT}/src/host/tls.cpp)
  target_compile_definitions(zinc-core PRIVATE ZN_CONSOLE_PLAYER ZN_AGENT_NO_THREADS ZN_AGENT_SERVER_ONLY ZN_CONSOLE_VERSION="${_zn_ver}"
    ZN_CONSOLE_KIND="${ZN_PLAYER_KIND}" ZN_CONSOLE_ARCH="${ZN_PLAYER_ARCH}")
  target_link_libraries(zinc-core PRIVATE zn_console_mbedtls)
  # the waiting screen's gfx.text `grid` font, 8 and 16 px (player_font.zrs): without it the screen stays blank until a program comes
  set(ZN_FONT_C ${CMAKE_CURRENT_BINARY_DIR}/player_font.c)
  add_custom_command(OUTPUT ${ZN_FONT_C} COMMAND ${CMAKE_COMMAND} -DFONT=${CMAKE_CURRENT_SOURCE_DIR}/player_font.zrs -DOUT=${ZN_FONT_C}
    -P ${CMAKE_CURRENT_SOURCE_DIR}/embed.cmake DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/player_font.zrs ${CMAKE_CURRENT_SOURCE_DIR}/embed.cmake)
  target_sources(zinc-core PRIVATE ${ZN_FONT_C})
  if(CMAKE_CROSSCOMPILING)
    target_link_options(zinc-core PRIVATE -Wl,--gc-sections)
  endif()
endif()

# the console's own part (<console>.cmake here): its SDK libraries and the packing of the binary (EBOOT.PBP, VPK, ELF)
if(EXISTS ${CMAKE_CURRENT_SOURCE_DIR}/${ZN_CONSOLE}.cmake)
  include(${CMAKE_CURRENT_SOURCE_DIR}/${ZN_CONSOLE}.cmake)
endif()
