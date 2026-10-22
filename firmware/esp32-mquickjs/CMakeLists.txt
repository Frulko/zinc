# mquickjs on the ESP32-2432S022 (README.md), built with the ESP-IDF 5.5 that tools/build-esp32-core installs into ~/.zinc.
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)   # only main and the components it requires are built
# idf.py -DZN_NET=1 (build-net, sdkconfig.net): the network image, Wi-Fi, ESP-NOW and BLE, which zinc flashes for a program that imports
# them; without, the smallest image (the screen, the pins, the storage)
if(ZN_NATIVE_DIR)   # the plugins' native modules a program imports, the component zinc writes there (main/CMakeLists.txt)
  idf_build_set_property(ZN_NATIVE_DIR ${ZN_NATIVE_DIR})
  list(APPEND EXTRA_COMPONENT_DIRS ${ZN_NATIVE_DIR}/zn_plugins)
endif()
set(ZN_PROJECT zinc-mquickjs)
if(ZN_NET)
  idf_build_set_property(ZN_NET 1)   # main/CMakeLists.txt reads it, also while the requirements are expanded (cache variables are not there)
  list(APPEND EXTRA_COMPONENT_DIRS ${CMAKE_CURRENT_LIST_DIR}/../../third_party/esp-mdns)
  set(ZN_PROJECT zinc-mquickjs-net)
endif()
if(CMAKE_CURRENT_LIST_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
  project(${ZN_PROJECT})
else()   # included by the project zinc writes for a program's native modules in its cache (src/cli_mqjs.cpp): it calls project() there,
  # so that the packages of the registry go to its managed_components, not into this directory
  list(APPEND EXTRA_COMPONENT_DIRS ${CMAKE_CURRENT_LIST_DIR}/main ${CMAKE_CURRENT_LIST_DIR}/components)
endif()
