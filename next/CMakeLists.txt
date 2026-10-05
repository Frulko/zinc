cmake_minimum_required(VERSION 3.20)
project(zinc_next CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(ZN_SANITIZE "Build with ASan and UBSan" OFF)

add_compile_options(-Wall -Wextra)
if(ZN_SANITIZE)
  add_compile_options(-fsanitize=address,undefined -fno-omit-frame-pointer)
  add_link_options(-fsanitize=address,undefined)
endif()

# Dependency direction: include/zn <- frontend <- ir <- zbc <- vm (see ARCHITECTURE.md).
add_library(zn_frontend STATIC src/frontend/lexer.cpp src/frontend/parser.cpp src/frontend/diagnostics.cpp)
target_include_directories(zn_frontend PUBLIC include src)

add_library(zn_zbc STATIC src/zbc/zbc.cpp)
target_include_directories(zn_zbc PUBLIC include src)

add_library(zn_vm STATIC src/vm/vm.cpp)
target_link_libraries(zn_vm PUBLIC zn_zbc)

add_executable(zinc src/main.cpp)
target_link_libraries(zinc PRIVATE zn_vm zn_zbc zn_frontend)
