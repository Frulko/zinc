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

add_executable(zinc src/main.cpp)
