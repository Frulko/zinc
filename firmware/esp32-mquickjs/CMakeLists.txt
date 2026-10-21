# mquickjs on the ESP32-2432S022 (README.md), built with the ESP-IDF 5.5 that tools/build-esp32-core installs into ~/.zinc.
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)   # only main and the components it requires are built
project(zinc-mquickjs)
