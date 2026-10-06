cmake_minimum_required(VERSION 3.20)
project(zinc_next C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)  # benchmarks and the speed gates need -O2
endif()

option(ZN_SANITIZE "Build with ASan and UBSan" OFF)

add_compile_options(-Wall -Wextra)
if(ZN_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
endif()

# Dependency direction: include/zn <- frontend <- ir <- zbc <- rt <- vm (see ARCHITECTURE.md).
add_library(zn_frontend STATIC src/frontend/lexer.cpp src/frontend/parser.cpp src/frontend/diagnostics.cpp src/frontend/check.cpp src/frontend/modules.cpp src/frontend/inspect.cpp src/frontend/snippet.cpp src/frontend/desugar.cpp src/frontend/dyn.cpp src/frontend/jsx.cpp)
target_include_directories(zn_frontend PUBLIC include src)

add_library(zn_ir STATIC src/ir/ir.cpp src/ir/lower.cpp src/ir/rc.cpp src/ir/opt.cpp)
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
  add_library(zn_host_gfx STATIC src/host/gfx_host.cpp src/host/baked_resources.cpp
    ${ZN_RUNTIME_DIR}/zrt.cpp ${ZN_RUNTIME_DIR}/host.cpp ${ZN_RUNTIME_DIR}/raster.cpp ${ZN_RUNTIME_DIR}/ttf.cpp ${ZN_RUNTIME_DIR}/gfx.cpp
    ${CMAKE_SOURCE_DIR}/../targets/null/hal_null.cpp ${CMAKE_SOURCE_DIR}/../targets/common/hal_posix.cpp)
  set_target_properties(zn_host_gfx PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON CXX_EXTENSIONS OFF)
  target_include_directories(zn_host_gfx PUBLIC include PRIVATE ${ZN_RUNTIME_DIR} ${ZN_RUNTIME_DIR}/include)
  target_compile_options(zn_host_gfx PRIVATE -fno-exceptions -fno-rtti -fwrapv -ffp-contract=off -fno-threadsafe-statics -O2 -w)
  target_compile_definitions(zn_host_gfx PRIVATE ZRT_HEAP_BYTES=536870912u ZRT_PLATFORM="macos")
endif()

add_library(zn_dev STATIC src/dev/core.cpp src/dev/client.cpp)
target_include_directories(zn_dev PUBLIC include src)
target_link_libraries(zn_dev PUBLIC zn_vm)

add_library(zn_tc STATIC src/tc/tc.cpp third_party/sha256/sha256.c)
target_include_directories(zn_tc PUBLIC src PRIVATE third_party/sha256)
set_source_files_properties(third_party/sha256/sha256.c PROPERTIES COMPILE_OPTIONS "-w")

add_library(zn_prof STATIC src/prof/prof.cpp)
target_link_libraries(zn_prof PUBLIC zn_vm)

add_executable(zinc src/main.cpp)
target_compile_definitions(zinc PRIVATE ZN_SOURCE_DIR="${CMAKE_SOURCE_DIR}")
target_link_libraries(zinc PRIVATE zn_dev zn_tc zn_prof zn_vm zn_aot zn_rt zn_zbc zn_ir zn_frontend)
if(TARGET zn_host_gfx)
  target_compile_definitions(zinc PRIVATE ZN_HOST_GFX)
  target_link_libraries(zinc PRIVATE zn_host_gfx)
endif()

add_executable(ir_test tests/unit/ir_test.cpp)
target_link_libraries(ir_test PRIVATE zn_ir)

add_executable(ops_test tests/unit/ops_test.cpp)
target_include_directories(ops_test PRIVATE include)

add_executable(zbc_test tests/unit/zbc_test.cpp)
target_link_libraries(zbc_test PRIVATE zn_zbc)
