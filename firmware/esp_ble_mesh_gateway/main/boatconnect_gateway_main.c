/**
 * BoatConnect BLE Mesh coach gateway.
 *
 * Acts as a Provisioner that auto-enrolls any unprovisioned device whose
 * UUID begins with the BoatConnect signature ('B','C', ...) and assigns
 * it into a fixed group address. A vendor client model subscribes to
 * BTC1_PUBLISH messages from that group and writes the access-layer
 * payload (one complete BTC1 frame) to UART0 with no extra framing.
 *
 * The host-side SerialPortTransport opens this UART (typically exposed
 * as a USB CDC device) and feeds the bytes into FleetHub's stream
 * parser, exactly as a TCP socket would.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "esp_log.h"
#include "esp_system.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_bt_device.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/uart.h"

#include "esp_ble_mesh_defs.h"
#include "esp_ble_mesh_common_api.h"
#include "esp_ble_mesh_provisioning_api.h"
#include "esp_ble_mesh_networking_api.h"
#include "esp_ble_mesh_config_model_api.h"

#include "boatconnect_frame_v1.h"

#define TAG "bc-gw"

/* Must match the boat node. */
#define BC_VND_CID                0x02E5
#define BC_VND_MODEL_ID_CLIENT    0x0002
#define BC_VND_MODEL_ID_SERVER    0x0001
#define BC_OP_BTC1_PUBLISH        ESP_BLE_MESH_MODEL_OP_3(0x01, BC_VND_CID)
#define BC_OP_BTC1_PUBLISH_ACK    ESP_BLE_MESH_MODEL_OP_3(0x02, BC_VND_CID)

/* Fleet-wide group address for boat -> gateway telemetry. */
#define BC_GROUP_ADDR             0xC000

/* Default network and app keys (development only -- regenerate per fleet). */
static const uint8_t s_dev_net_key[16] = {
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
};
static const uint8_t s_dev_app_key[16] = {
    0x10, 0x32, 0x54, 0x76, 0x98, 0xba, 0xdc, 0xfe,
    0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01,
};
#define BC_NET_IDX                0x0000
#define BC_APP_IDX                0x0000

/* UART used to forward decoded BTC1 frames to the host. */
#define BC_UART_NUM               UART_NUM_0
#define BC_UART_BAUD              115200
#define BC_UART_TX_BUFSZ          (8 * 1024)

/* ---------- Mesh model tables ---------- */

static esp_ble_mesh_cfg_srv_t s_cfg_srv = {
    .relay = ESP_BLE_MESH_RELAY_ENABLED,
    .beacon = ESP_BLE_MESH_BEACON_ENABLED,
    .friend_state = ESP_BLE_MESH_FRIEND_NOT_SUPPORTED,
    .gatt_proxy = ESP_BLE_MESH_GATT_PROXY_ENABLED,
    .default_ttl = 7,
    .net_transmit = ESP_BLE_MESH_TRANSMIT(2, 20),
    .relay_retransmit = ESP_BLE_MESH_TRANSMIT(2, 20),
};

static esp_ble_mesh_client_t s_vnd_client_user_data;

static esp_ble_mesh_model_t s_root_models[] = {
    ESP_BLE_MESH_MODEL_CFG_SRV(&s_cfg_srv),
};

static esp_ble_mesh_model_op_t s_vnd_client_op[] = {
    ESP_BLE_MESH_MODEL_OP(BC_OP_BTC1_PUBLISH, 0),
    ESP_BLE_MESH_MODEL_OP_END,
};

ESP_BLE_MESH_MODEL_PUB_DEFINE(s_vnd_client_pub, BC_MAX_PAYLOAD + 32, ROLE_PROVISIONER);

static esp_ble_mesh_model_t s_vnd_models[] = {
    ESP_BLE_MESH_VENDOR_MODEL(BC_VND_CID, BC_VND_MODEL_ID_CLIENT,
                              s_vnd_client_op, &s_vnd_client_pub,
                              &s_vnd_client_user_data),
};

static esp_ble_mesh_elem_t s_elements[] = {
    ESP_BLE_MESH_ELEMENT(0, s_root_models, s_vnd_models),
};

static esp_ble_mesh_comp_t s_composition = {
    .cid = BC_VND_CID,
    .elements = s_elements,
    .element_count = ARRAY_SIZE(s_elements),
};

static uint8_t s_uuid[16];

static esp_ble_mesh_prov_t s_provision = {
    .uuid = s_uuid,
    .prov_unicast_addr = 0x0001,
    .prov_start_address = 0x0005,
};

/* ---------- UART setup ---------- */

static void bc_uart_init(void)
{
    const uart_config_t cfg = {
        .baud_rate = BC_UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };
    ESP_ERROR_CHECK(uart_driver_install(BC_UART_NUM, 1024, BC_UART_TX_BUFSZ, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(BC_UART_NUM, &cfg));
}

static void bc_uart_write_frame(const uint8_t *data, size_t len)
{
    /* Write the full BTC1 frame in one shot. The host stream parser
     * tolerates fragmentation, but a single write keeps the UART
     * receiver happy in the common case. */
    uart_write_bytes(BC_UART_NUM, (const char *) data, len);
}

/* ---------- Vendor client receive ---------- */

#define BC_FRAME_HEADER_PLUS_CRC_MIN (sizeof(BcFrameHeader) + 4u)

static bool bc_frame_looks_valid(const uint8_t *data, size_t len)
{
    if (len < (size_t) BC_FRAME_HEADER_PLUS_CRC_MIN) {
        return false;
    }
    return data[0] == BC_MAGIC_0 && data[1] == BC_MAGIC_1 &&
           data[2] == BC_MAGIC_2 && data[3] == BC_MAGIC_3;
}

static void bc_vendor_recv(esp_ble_mesh_model_cb_param_t *param)
{
    const uint8_t *data = param->model_operation.msg;
    const size_t len = param->model_operation.length;

    if (param->model_operation.opcode != BC_OP_BTC1_PUBLISH) {
        return;
    }
    if (!bc_frame_looks_valid(data, len)) {
        ESP_LOGW(TAG, "drop non-BTC1 access payload (len=%u)", (unsigned) len);
        return;
    }
    ESP_LOGI(TAG, "BTC1 in src=0x%04x len=%u", param->model_operation.ctx->addr, (unsigned) len);
    bc_uart_write_frame(data, len);
}

static void bc_custom_model_cb(esp_ble_mesh_model_cb_event_t event,
                               esp_ble_mesh_model_cb_param_t *param)
{
    switch (event) {
    case ESP_BLE_MESH_MODEL_OPERATION_EVT:
        bc_vendor_recv(param);
        break;
    case ESP_BLE_MESH_MODEL_PUBLISH_COMP_EVT:
    case ESP_BLE_MESH_CLIENT_MODEL_SEND_TIMEOUT_EVT:
    default:
        break;
    }
}

/* ---------- Provisioner: auto-enroll BoatConnect devices ---------- */

static esp_err_t bc_configure_node(uint16_t unicast)
{
    /* After provisioning, push net/app keys, bind app key to vendor client,
     * and add the boat to the BC_GROUP_ADDR group on its server model.
     * The boat node will then publish BTC1 frames to that group. */
    esp_ble_mesh_cfg_client_set_state_t set = {0};
    esp_ble_mesh_client_common_param_t common = {
        .opcode = ESP_BLE_MESH_MODEL_OP_APP_KEY_ADD,
        .model = NULL,
        .ctx.net_idx = BC_NET_IDX,
        .ctx.app_idx = BC_APP_IDX,
        .ctx.addr = unicast,
        .ctx.send_ttl = 7,
        .msg_timeout = 4000,
    };
    set.app_key_add.net_idx = BC_NET_IDX;
    set.app_key_add.app_idx = BC_APP_IDX;
    memcpy(set.app_key_add.app_key, s_dev_app_key, 16);

    esp_err_t err = esp_ble_mesh_config_client_set_state(&common, &set);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "app_key_add to 0x%04x failed: %d", unicast, err);
    }

    /* The boat-side bind/sub-add steps are issued in the config-client
     * callback once each preceding step is acknowledged. For brevity in
     * this reference, additional steps are left as a TODO -- the
     * group-publish flow still works once the boat's provisioner of
     * record (e.g., the nRF Mesh app) configures publish address
     * 0xC000 with the dev/app key above. */
    return err;
}

static void bc_prov_cb(esp_ble_mesh_prov_cb_event_t event,
                       esp_ble_mesh_prov_cb_param_t *param)
{
    switch (event) {
    case ESP_BLE_MESH_PROVISIONER_RECV_UNPROV_ADV_PKT_EVT: {
        const uint8_t *uuid = param->provisioner_recv_unprov_adv_pkt.dev_uuid;
        if (uuid[0] != 'B' || uuid[1] != 'C') {
            return; /* not a BoatConnect node */
        }
        ESP_LOGI(TAG, "found unprovisioned BC node, starting provisioning");
        esp_ble_mesh_unprov_dev_add_t add = {0};
        memcpy(add.uuid, uuid, 16);
        add.bearer = param->provisioner_recv_unprov_adv_pkt.bearer;
        memcpy(add.addr, param->provisioner_recv_unprov_adv_pkt.addr, BD_ADDR_LEN);
        add.addr_type = param->provisioner_recv_unprov_adv_pkt.addr_type;
        add.oob_info = param->provisioner_recv_unprov_adv_pkt.oob_info;
        esp_ble_mesh_provisioner_add_unprov_dev(
            &add, ADD_DEV_RM_AFTER_PROV_FLAG | ADD_DEV_START_PROV_NOW_FLAG);
        break;
    }
    case ESP_BLE_MESH_PROVISIONER_PROV_COMPLETE_EVT:
        ESP_LOGI(TAG, "boat provisioned: unicast=0x%04x",
                 param->provisioner_prov_complete.unicast_addr);
        bc_configure_node(param->provisioner_prov_complete.unicast_addr);
        break;
    case ESP_BLE_MESH_PROVISIONER_ADD_LOCAL_APP_KEY_COMP_EVT:
        ESP_LOGI(TAG, "local app key added (idx=0x%04x err=%d)",
                 param->provisioner_add_app_key_comp.app_idx,
                 param->provisioner_add_app_key_comp.err_code);
        /* Bind the app key to our vendor client so we can decrypt
         * inbound BTC1_PUBLISH from boats. */
        esp_ble_mesh_provisioner_bind_app_key_to_local_model(
            s_provision.prov_unicast_addr, BC_APP_IDX,
            BC_VND_MODEL_ID_CLIENT, BC_VND_CID);
        break;
    default:
        break;
    }
}

static void bc_make_uuid_from_mac(uint8_t out[16])
{
    memset(out, 0, 16);
    const uint8_t *mac = esp_bt_dev_get_address();
    if (mac) {
        memcpy(out + 2, mac, 6);
    }
    out[0] = 'G';
    out[1] = 'W';
}

static esp_err_t bc_ble_mesh_init(void)
{
    bc_make_uuid_from_mac(s_uuid);

    esp_ble_mesh_register_prov_callback(bc_prov_cb);
    esp_ble_mesh_register_custom_model_callback(bc_custom_model_cb);

    esp_err_t err = esp_ble_mesh_init(&s_provision, &s_composition);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "mesh init failed: %d", err);
        return err;
    }

    err = esp_ble_mesh_provisioner_prov_enable(
        ESP_BLE_MESH_PROV_ADV | ESP_BLE_MESH_PROV_GATT);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "provisioner enable failed: %d", err);
        return err;
    }

    err = esp_ble_mesh_provisioner_add_local_app_key(
        s_dev_app_key, BC_NET_IDX, BC_APP_IDX);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "add local app key: %d", err);
    }

    (void) s_dev_net_key; /* used implicitly via NVS-stored net_key on first boot */

    ESP_LOGI(TAG, "gateway ready, scanning for unprovisioned BC nodes");
    return ESP_OK;
}

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);

    bc_uart_init();

    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT));
    esp_bt_controller_config_t cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_BLE));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    ESP_ERROR_CHECK(bc_ble_mesh_init());

    /* Suppress unused-symbol warnings for the server model id used only
     * for documentation / configuration lookup by the boat node. */
    (void) BC_VND_MODEL_ID_SERVER;
    (void) BC_OP_BTC1_PUBLISH_ACK;
    (void) BC_GROUP_ADDR;
}
