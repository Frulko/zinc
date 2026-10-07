cmake_minimum_required(VERSION 3.20)
project(zinc_next C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)  # benchmarks and the speed gates need -O2
endif()

option(ZN_SANITIZE "Build with ASan and UBSan" OFF)

add_compile_options(-Wall -Wextra -ffp-contract=off)  # no fused multiply-add: the interpreter, the AOT programs and every host must round the same way
if(ZN_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
endif()

# Dependency direction: include/zn <- frontend <- ir <- zbc <- rt <- vm (see ARCHITECTURE.md).
add_library(zn_yyjson STATIC third_party/yyjson/yyjson.c)
target_include_directories(zn_yyjson PUBLIC third_party/yyjson)
set_target_properties(zn_yyjson PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_yyjson PRIVATE -w -O2)

# libuv (third_party/libuv, the source list of zn-sources.txt): the event loop of the host (timers, child processes, IO)
file(STRINGS third_party/libuv/zn-sources.txt ZN_UV_LINES)
set(ZN_UV_SOURCES "")
set(ZN_UV_SECTION "")
foreach(line IN LISTS ZN_UV_LINES)
  if(line MATCHES "^#" OR line STREQUAL "")
    continue()
  elseif(line MATCHES "^\\[(.*)\\]$")
    set(ZN_UV_SECTION "${CMAKE_MATCH_1}")
  elseif(ZN_UV_SECTION STREQUAL "common" OR ZN_UV_SECTION STREQUAL "unix" OR (ZN_UV_SECTION STREQUAL "darwin" AND APPLE) OR (ZN_UV_SECTION STREQUAL "linux" AND CMAKE_SYSTEM_NAME STREQUAL "Linux"))
    list(APPEND ZN_UV_SOURCES third_party/libuv/${line})
  endif()
endforeach()
add_library(zn_uv STATIC ${ZN_UV_SOURCES})
target_include_directories(zn_uv PUBLIC third_party/libuv/include PRIVATE third_party/libuv/src)
target_compile_definitions(zn_uv PRIVATE _FILE_OFFSET_BITS=64 _LARGEFILE_SOURCE)
if(APPLE)
  target_compile_definitions(zn_uv PRIVATE _DARWIN_UNLIMITED_SELECT=1 _DARWIN_USE_64_BIT_INODE=1)
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  target_compile_definitions(zn_uv PRIVATE _GNU_SOURCE _POSIX_C_SOURCE=200112)
  target_link_libraries(zn_uv PUBLIC dl rt)
endif()
find_package(Threads REQUIRED)
target_link_libraries(zn_uv PUBLIC Threads::Threads)
set_target_properties(zn_uv PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_uv PRIVATE -fno-strict-aliasing -w -O2)

add_library(zn_frontend STATIC src/frontend/plugin_manifest.cpp src/frontend/tsconfig.cpp src/frontend/project.cpp src/frontend/lexer.cpp src/frontend/parser.cpp src/frontend/diagnostics.cpp src/frontend/check.cpp src/frontend/modules.cpp src/frontend/inspect.cpp src/frontend/snippet.cpp src/frontend/desugar.cpp src/frontend/dyn.cpp src/frontend/jsx.cpp)
target_include_directories(zn_frontend PUBLIC include src)
target_link_libraries(zn_frontend PUBLIC zn_yyjson)

add_library(zn_ir STATIC src/ir/ir.cpp src/ir/parse.cpp src/ir/lower.cpp src/ir/rc.cpp src/ir/opt.cpp)
target_link_libraries(zn_ir PUBLIC zn_frontend)

add_library(zn_zbc STATIC src/zbc/zbc.cpp src/zbc/emit.cpp)
target_link_libraries(zn_zbc PUBLIC zn_ir)
target_include_directories(zn_zbc PUBLIC include src)

# mimalloc (third_party/): the runtime allocates many small objects; it also serves global operator new/delete.
add_library(zn_mimalloc STATIC third_party/mimalloc/src/static.c)
target_include_directories(zn_mimalloc PUBLIC third_party/mimalloc/include)
target_compile_definitions(zn_mimalloc PRIVATE MI_STATIC_LIB)
set_target_properties(zn_mimalloc PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_mimalloc PRIVATE -w -O2)

add_library(zn_rt STATIC src/rt/machine.cpp src/rt/rtcalls.cpp src/rt/program.cpp)
target_link_libraries(zn_rt PUBLIC zn_zbc zn_mimalloc)
if(ZN_SANITIZE)
  target_compile_definitions(zn_rt PUBLIC ZN_NO_MIMALLOC)   # keep ASan's own allocator checks
else()
  target_sources(zn_rt PRIVATE src/rt/alloc.cpp)            # mimalloc serves global operator new/delete
endif()

add_library(zn_vm STATIC src/vm/vm.cpp)
target_link_libraries(zn_vm PUBLIC zn_rt)

add_library(zn_aot STATIC src/aot/aot.cpp)
target_link_libraries(zn_aot PUBLIC zn_zbc)

# The graphics host (ZN-027): the existing runtime (runtime/: zrt, raster, gfx) behind the zn::host::Gfx table, headless.
# Built with the runtime's own flags so its pixels match the old builds. Off where the runtime does not build.
option(ZN_HOST_GFX "link the graphics host (zinc:gfx)" ON)
set(ZN_RUNTIME_DIR ${CMAKE_SOURCE_DIR}/../runtime)
if(ZN_HOST_GFX AND EXISTS ${ZN_RUNTIME_DIR}/gfx.cpp)
  add_library(zn_host_gfx STATIC src/host/loop.cpp src/host/osc.cpp src/host/sys_host.cpp src/host/gfx_host.cpp src/host/resources.cpp
    ${ZN_RUNTIME_DIR}/zrt.cpp ${ZN_RUNTIME_DIR}/host.cpp ${ZN_RUNTIME_DIR}/raster.cpp ${ZN_RUNTIME_DIR}/ttf.cpp ${ZN_RUNTIME_DIR}/gfx.cpp
    src/host/hal_dispatch.cpp ${CMAKE_SOURCE_DIR}/../targets/null/hal_null.cpp ${CMAKE_SOURCE_DIR}/../targets/common/hal_posix.cpp)
  # the headless and the window HAL live in one binary: their hal_* functions are renamed, src/host/hal_dispatch.cpp picks one at run time
  set(ZN_HAL_FUNCS init shutdown frame_begin frame_end poll_input present surface_size fixed_dt)
  set(ZN_NULL_DEFS "")
  foreach(f ${ZN_HAL_FUNCS})
    list(APPEND ZN_NULL_DEFS "hal_${f}=null_hal_${f}")
  endforeach()
  set_source_files_properties(${CMAKE_SOURCE_DIR}/../targets/null/hal_null.cpp PROPERTIES COMPILE_DEFINITIONS "${ZN_NULL_DEFS}")
  find_package(SDL3 CONFIG QUIET)
  if(SDL3_FOUND)
    set(ZN_SDL_FUNCS init shutdown frame_begin frame_end poll_input present surface_size fixed_dt text_input clipboard_get clipboard_set set_cursor escape_by_app escape pixel_scale window_handle)
    set(ZN_SDL_DEFS "")
    foreach(f ${ZN_SDL_FUNCS})
      list(APPEND ZN_SDL_DEFS "hal_${f}=sdl_hal_${f}")
    endforeach()
    target_sources(zn_host_gfx PRIVATE ${CMAKE_SOURCE_DIR}/../targets/macos/hal_sdl.cpp)
    set_source_files_properties(${CMAKE_SOURCE_DIR}/../targets/macos/hal_sdl.cpp PROPERTIES COMPILE_DEFINITIONS "${ZN_SDL_DEFS}")
    target_compile_definitions(zn_host_gfx PRIVATE ZN_HOST_SDL)
    target_link_libraries(zn_host_gfx PUBLIC SDL3::SDL3)
    get_target_property(ZN_SDL_LIB SDL3::SDL3 LOCATION)
    message(STATUS "zinc: window support through SDL3 (${ZN_SDL_LIB})")
  else()
    message(STATUS "zinc: SDL3 not found, apps run headless only")
  endif()
  target_link_libraries(zn_host_gfx PUBLIC zn_uv)
  set_target_properties(zn_host_gfx PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
  target_include_directories(zn_host_gfx PUBLIC include PRIVATE ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include)
  target_compile_options(zn_host_gfx PRIVATE -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -O2 -w)
  target_compile_definitions(zn_host_gfx PRIVATE ZRT_HEAP_BYTES=536870912u ZRT_PLATFORM="macos" ZRT_POINT_POOL=262144 ZRT_GROW_DRAW_CMDS)
endif()

add_library(zn_res STATIC src/res/res.cpp)
target_include_directories(zn_res PUBLIC include src PRIVATE third_party/stb)

add_library(zn_dev STATIC src/dev/core.cpp src/dev/client.cpp)
target_include_directories(zn_dev PUBLIC include src)
target_link_libraries(zn_dev PUBLIC zn_vm)

add_library(zn_tc STATIC src/tc/tc.cpp third_party/sha256/sha256.c)
target_include_directories(zn_tc PUBLIC src PRIVATE third_party/sha256)
set_source_files_properties(third_party/sha256/sha256.c PROPERTIES COMPILE_OPTIONS "-w")

add_library(zn_prof STATIC src/prof/prof.cpp)
target_link_libraries(zn_prof PUBLIC zn_vm)

# QuickJS-ng (third_party/): the second engine of ZN-051, plain JavaScript and stripped TypeScript behind the same host calls.
add_library(zn_quickjs STATIC third_party/quickjs-ng/quickjs-amalgam.c)
target_include_directories(zn_quickjs PUBLIC third_party/quickjs-ng)
target_compile_definitions(zn_quickjs PRIVATE QUICKJS_NG_BUILD)
set_target_properties(zn_quickjs PROPERTIES C_STANDARD 11 POSITION_INDEPENDENT_CODE ON)
target_compile_options(zn_quickjs PRIVATE -w -O2)
add_library(zn_qjs STATIC src/qjs/qjs.cpp src/qjs/strip.cpp src/qjs/prelude.cpp)
target_link_libraries(zn_qjs PUBLIC zn_quickjs zn_frontend)
target_include_directories(zn_qjs PUBLIC include src)

add_executable(zinc src/main.cpp)
target_compile_definitions(zinc PRIVATE ZN_SOURCE_DIR="${CMAKE_SOURCE_DIR}")
target_link_libraries(zinc PRIVATE zn_qjs zn_res zn_dev zn_tc zn_prof zn_vm zn_aot zn_rt zn_zbc zn_ir zn_frontend)
if(TARGET zn_host_gfx)
  target_compile_definitions(zinc PRIVATE ZN_HOST_GFX)
  if(ZN_SDL_LIB)
    target_compile_definitions(zinc PRIVATE ZN_HOST_LIBS="${ZN_SDL_LIB}")  # linked into the programs zinc build writes
  endif()
  target_link_libraries(zinc PRIVATE zn_host_gfx)
endif()

add_executable(ir_test tests/unit/ir_test.cpp)
target_link_libraries(ir_test PRIVATE zn_ir)

add_executable(ops_test tests/unit/ops_test.cpp)
target_include_directories(ops_test PRIVATE include)

add_executable(zbc_test tests/unit/zbc_test.cpp)
target_link_libraries(zbc_test PRIVATE zn_zbc)
