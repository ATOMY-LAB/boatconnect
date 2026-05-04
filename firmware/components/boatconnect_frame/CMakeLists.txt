# ESP-IDF component wrapper around the canonical reference sources
# kept at firmware/boatconnect_frame_v1.h and firmware/boatconnect_crc32.c
# so they remain the single source of truth for the BTC1 wire format.
idf_component_register(
    SRCS "../../boatconnect_crc32.c"
    INCLUDE_DIRS "../.."
)
