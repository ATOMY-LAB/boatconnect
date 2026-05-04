/**
 * BoatConnect BLE Mesh boat node.
 *
 * Acts as an ESP-BLE-Mesh node with a vendor server model that publishes
 * complete BTC1 frames (header + payload + CRC) as the access-layer payload
 * of a vendor opcode. The receiving gateway forwards those bytes verbatim
 * to its USB CDC / UART, where the host-side SerialPortTransport feeds
 * them into FleetHub via the standard FrameParser. The wire format never
 * changes between IP and BLE Mesh transports.
 *
 * Mesh Relay is enabled (sdkconfig.defaults) so intermediate boats can
 * hop frames toward the gateway when out of single-hop range.
 *
 * This file is a reference: sensor reads are stubbed. Replace
 * bc_collect_telemetry() with your real GPS / IMU pipeline.
 */

#include <stdio.h>
#include <string.h>
#include <inttypes.h>

#include "esp_log.h"
#include "esp_system.h"
#include "esp_random.h"
#include "esp_bt.h"
#include "esp_bt_main.h"
#include "esp_bt_device.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/timers.h"

#include "esp_ble_mesh_defs.h"
#include "esp_ble_mesh_common_api.h"
#include "esp_ble_mesh_provisioning_api.h"
#include "esp_ble_mesh_networking_api.h"
#include "esp_ble_mesh_config_model_api.h"

#include "boatconnect_frame_v1.h"

#define TAG "bc-node"

/* Vendor model identification.
 * 0x02E5 is Espressif's CID -- replace with your own registered Bluetooth
 * SIG company id before production. The model id and opcode space below
 * are private to BoatConnect. */
#define BC_VND_CID                0x02E5
#define BC_VND_MODEL_ID_SERVER    0x0001

/* 3-byte vendor opcode wrapped with the CID. */
#define BC_OP_BTC1_PUBLISH        ESP_BLE_MESH_MODEL_OP_3(0x01, BC_VND_CID)
#define BC_OP_BTC1_PUBLISH_ACK    ESP_BLE_MESH_MODEL_OP_3(0x02, BC_VND_CID)

/* Configurable at provisioning time -- see Kconfig in a real project.
 * For this reference we hard-code the boat id and publish period. */
#ifndef BC_BOAT_ID
#define BC_BOAT_ID                1u
#endif

#ifndef BC_PUBLISH_PERIOD_MS
#define BC_PUBLISH_PERIOD_MS      1000u
#endif

static uint32_t s_seq;

/* ---------- Configuration server (mandatory for every node) ---------- */

static esp_ble_mesh_cfg_srv_t s_cfg_srv = {
    .relay = ESP_BLE_MESH_RELAY_ENABLED,
    .beacon = ESP_BLE_MESH_BEACON_ENABLED,
    .friend_state = ESP_BLE_MESH_FRIEND_NOT_SUPPORTED,
    .gatt_proxy = ESP_BLE_MESH_GATT_PROXY_NOT_SUPPORTED,
    .default_ttl = 7,
    .net_transmit = ESP_BLE_MESH_TRANSMIT(2, 20),
    .relay_retransmit = ESP_BLE_MESH_TRANSMIT(2, 20),
};

static esp_ble_mesh_model_t s_root_models[] = {
    ESP_BLE_MESH_MODEL_CFG_SRV(&s_cfg_srv),
};

/* ---------- Vendor server model ---------- */

static esp_ble_mesh_model_op_t s_vnd_op[] = {
    ESP_BLE_MESH_MODEL_OP(BC_OP_BTC1_PUBLISH_ACK, 0),
    ESP_BLE_MESH_MODEL_OP_END,
};

ESP_BLE_MESH_MODEL_PUB_DEFINE(s_vnd_pub, BC_MAX_PAYLOAD + 32, ROLE_NODE);

static esp_ble_mesh_model_t s_vnd_models[] = {
    ESP_BLE_MESH_VENDOR_MODEL(BC_VND_CID, BC_VND_MODEL_ID_SERVER,
                              s_vnd_op, &s_vnd_pub, NULL),
};

static esp_ble_mesh_elem_t s_elements[] = {
    ESP_BLE_MESH_ELEMENT(0, s_root_models, s_vnd_models),
};

static esp_ble_mesh_comp_t s_composition = {
    .cid = BC_VND_CID,
    .elements = s_elements,
    .element_count = ARRAY_SIZE(s_elements),
};

/* PB-ADV / PB-GATT provisioning -- random UUID derived from MAC. */
static uint8_t s_uuid[16];

static esp_ble_mesh_prov_t s_provision = {
    .uuid = s_uuid,
};

/* ---------- Telemetry source (stubbed) ---------- */

static void bc_collect_telemetry(BcTelemetrySummaryV1 *out)
{
    /* Replace with real sensor reads. Fields are scaled integers per PROTOCOL.md. */
    out->timestamp_ms     = (uint64_t) esp_log_timestamp();
    out->lat_e7           = 0;
    out->lon_e7           = 0;
    out->speed_mm_s       = 3000 + (esp_random() % 200);
    out->spm_x100         = 6000 + (esp_random() % 400);
    out->dps_x100         = 250;
    out->telemetry_flags  = 0;
}

/* Build one BTC1 frame in `out` of capacity `cap`. Returns total length, or 0 on overflow. */
static size_t bc_build_telemetry_frame(uint8_t *out, size_t cap)
{
    BcTelemetrySummaryV1 t;
    bc_collect_telemetry(&t);

    const size_t payload_len = sizeof(t);
    const size_t total = sizeof(BcFrameHeader) + payload_len + 4u;
    if (cap < total) {
        return 0;
    }

    BcFrameHeader *hdr = (BcFrameHeader *) out;
    hdr->magic[0] = BC_MAGIC_0;
    hdr->magic[1] = BC_MAGIC_1;
    hdr->magic[2] = BC_MAGIC_2;
    hdr->magic[3] = BC_MAGIC_3;
    hdr->version     = BC_VERSION;
    hdr->msg_type    = BC_MSG_TELEMETRY_SUMMARY;
    hdr->flags       = 0;
    hdr->reserved    = 0;
    hdr->boat_id     = BC_BOAT_ID;
    hdr->seq         = ++s_seq;
    hdr->payload_len = (uint16_t) payload_len;

    memcpy(out + sizeof(BcFrameHeader), &t, payload_len);

    const uint32_t crc = bc_crc32(out, sizeof(BcFrameHeader) + payload_len);
    out[total - 4] = (uint8_t)(crc       & 0xff);
    out[total - 3] = (uint8_t)((crc >> 8) & 0xff);
    out[total - 2] = (uint8_t)((crc >> 16) & 0xff);
    out[total - 1] = (uint8_t)((crc >> 24) & 0xff);
    return total;
}

/* ---------- Publish path ---------- */

/* True once provisioning has completed and a publish address is set. */
static bool s_provisioned = false;

static void bc_publish_telemetry(void)
{
    if (!s_provisioned) {
        return;
    }
    uint8_t buf[sizeof(BcFrameHeader) + sizeof(BcTelemetrySummaryV1) + 4u];
    const size_t len = bc_build_telemetry_frame(buf, sizeof(buf));
    if (len == 0) {
        ESP_LOGW(TAG, "frame build overflow");
        return;
    }

    /* Publish to the configured publish address (set by the provisioner). */
    esp_err_t err = esp_ble_mesh_model_publish(
        &s_vnd_models[0], BC_OP_BTC1_PUBLISH, len, buf, ROLE_NODE);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "publish failed: %d", err);
    } else {
        ESP_LOGI(TAG, "published BTC1 seq=%" PRIu32 " len=%u", s_seq, (unsigned) len);
    }
}

static void bc_publish_timer_cb(TimerHandle_t t)
{
    (void) t;
    bc_publish_telemetry();
}

/* ---------- Mesh callbacks ---------- */

static void bc_prov_complete(uint16_t net_idx, uint16_t addr, uint8_t flags, uint32_t iv_index)
{
    ESP_LOGI(TAG, "provisioned: net_idx=0x%04x addr=0x%04x flags=0x%02x iv=0x%08" PRIx32,
             net_idx, addr, flags, iv_index);
    s_provisioned = true;
}

static void bc_provisioning_cb(esp_ble_mesh_prov_cb_event_t event,
                               esp_ble_mesh_prov_cb_param_t *param)
{
    switch (event) {
    case ESP_BLE_MESH_NODE_PROV_COMPLETE_EVT:
        bc_prov_complete(param->node_prov_complete.net_idx,
                         param->node_prov_complete.addr,
                         param->node_prov_complete.flags,
                         param->node_prov_complete.iv_index);
        break;
    case ESP_BLE_MESH_NODE_PROV_RESET_EVT:
        ESP_LOGW(TAG, "node reset; restarting unprovisioned beacons");
        s_provisioned = false;
        esp_ble_mesh_node_local_reset();
        break;
    default:
        break;
    }
}

static void bc_config_server_cb(esp_ble_mesh_cfg_server_cb_event_t event,
                                esp_ble_mesh_cfg_server_cb_param_t *param)
{
    if (event == ESP_BLE_MESH_CFG_SERVER_STATE_CHANGE_EVT) {
        ESP_LOGI(TAG, "config server state change opcode=0x%06" PRIx32,
                 param->ctx.recv_op);
    }
}

static void bc_custom_model_cb(esp_ble_mesh_model_cb_event_t event,
                               esp_ble_mesh_model_cb_param_t *param)
{
    /* The boat node currently does not consume inbound vendor messages,
     * but a future BTC1_REQUEST opcode could be handled here. */
    if (event == ESP_BLE_MESH_MODEL_OPERATION_EVT) {
        ESP_LOGI(TAG, "vendor inbound opcode=0x%06" PRIx32 " len=%u",
                 param->model_operation.opcode,
                 (unsigned) param->model_operation.length);
    }
}

/* ---------- Setup ---------- */

static void bc_make_uuid_from_mac(uint8_t out[16])
{
    memset(out, 0, 16);
    const uint8_t *mac = esp_bt_dev_get_address();
    if (mac) {
        memcpy(out + 2, mac, 6);
    }
    out[0] = 'B';
    out[1] = 'C';
}

static esp_err_t bc_ble_mesh_init(void)
{
    bc_make_uuid_from_mac(s_uuid);

    esp_ble_mesh_register_prov_callback(bc_provisioning_cb);
    esp_ble_mesh_register_config_server_callback(bc_config_server_cb);
    esp_ble_mesh_register_custom_model_callback(bc_custom_model_cb);

    esp_err_t err = esp_ble_mesh_init(&s_provision, &s_composition);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "mesh init failed: %d", err);
        return err;
    }

    err = esp_ble_mesh_node_prov_enable(
        ESP_BLE_MESH_PROV_ADV | ESP_BLE_MESH_PROV_GATT);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "prov enable failed: %d", err);
        return err;
    }

    ESP_LOGI(TAG, "boat node ready, awaiting provisioning (boat_id=%u)", BC_BOAT_ID);
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

    ESP_ERROR_CHECK(esp_bt_controller_mem_release(ESP_BT_MODE_CLASSIC_BT));
    esp_bt_controller_config_t cfg = BT_CONTROLLER_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_bt_controller_init(&cfg));
    ESP_ERROR_CHECK(esp_bt_controller_enable(ESP_BT_MODE_BLE));
    ESP_ERROR_CHECK(esp_bluedroid_init());
    ESP_ERROR_CHECK(esp_bluedroid_enable());

    ESP_ERROR_CHECK(bc_ble_mesh_init());

    TimerHandle_t timer = xTimerCreate(
        "bc_pub", pdMS_TO_TICKS(BC_PUBLISH_PERIOD_MS), pdTRUE, NULL, bc_publish_timer_cb);
    if (timer != NULL) {
        xTimerStart(timer, 0);
    }
}
