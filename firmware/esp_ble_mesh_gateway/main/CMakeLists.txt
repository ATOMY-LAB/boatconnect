idf_component_register(
    SRCS "boatconnect_gateway_main.c"
    INCLUDE_DIRS "."
    REQUIRES bt nvs_flash driver boatconnect_frame
)
