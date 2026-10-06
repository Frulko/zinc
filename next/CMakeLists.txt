cmake_minimum_required(VERSION 3.20)
project(zinc_next CXX)

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
add_library(zn_frontend STATIC src/frontend/lexer.cpp src/frontend/parser.cpp src/frontend/diagnostics.cpp src/frontend/check.cpp src/frontend/modules.cpp src/frontend/inspect.cpp src/frontend/snippet.cpp src/frontend/desugar.cpp src/frontend/dyn.cpp)
target_include_directories(zn_frontend PUBLIC include src)

add_library(zn_ir STATIC src/ir/ir.cpp src/ir/lower.cpp src/ir/rc.cpp)
target_link_libraries(zn_ir PUBLIC zn_frontend)

add_library(zn_zbc STATIC src/zbc/zbc.cpp src/zbc/emit.cpp)
target_link_libraries(zn_zbc PUBLIC zn_ir)
target_include_directories(zn_zbc PUBLIC include src)

add_library(zn_rt STATIC src/rt/machine.cpp src/rt/rtcalls.cpp src/rt/program.cpp)
target_link_libraries(zn_rt PUBLIC zn_zbc)

add_library(zn_vm STATIC src/vm/vm.cpp)
target_link_libraries(zn_vm PUBLIC zn_rt)

add_library(zn_aot STATIC src/aot/aot.cpp)
target_link_libraries(zn_aot PUBLIC zn_zbc)

add_executable(zinc src/main.cpp)
target_compile_definitions(zinc PRIVATE ZN_SOURCE_DIR="${CMAKE_SOURCE_DIR}")
target_link_libraries(zinc PRIVATE zn_vm zn_aot zn_rt zn_zbc zn_ir zn_frontend)

add_executable(ir_test tests/unit/ir_test.cpp)
target_link_libraries(ir_test PRIVATE zn_ir)

add_executable(ops_test tests/unit/ops_test.cpp)
target_include_directories(ops_test PRIVATE include)

add_executable(zbc_test tests/unit/zbc_test.cpp)
target_link_libraries(zbc_test PRIVATE zn_zbc)
