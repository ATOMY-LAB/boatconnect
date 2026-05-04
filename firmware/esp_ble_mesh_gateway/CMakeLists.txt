# Top-level ESP-IDF project file for the BoatConnect BLE Mesh coach gateway.
# Build with:  idf.py set-target esp32 && idf.py build flash monitor
cmake_minimum_required(VERSION 3.16)

set(EXTRA_COMPONENT_DIRS "../components")

include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(boatconnect_ble_mesh_gateway)
