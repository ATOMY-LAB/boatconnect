idf_component_register(
    SRCS "boatconnect_node_main.c"
    INCLUDE_DIRS "."
    REQUIRES bt nvs_flash boatconnect_frame
)
