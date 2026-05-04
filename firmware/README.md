# BoatConnect firmware references

This directory ships:

- **Canonical wire-format helpers** consumed by every BoatConnect firmware:
  - [`boatconnect_frame_v1.h`](boatconnect_frame_v1.h) — packed `BcFrameHeader` + `BcTelemetrySummaryV1`.
  - [`boatconnect_crc32.c`](boatconnect_crc32.c) — `bc_crc32()` matching the host-side codec.
  - [`components/boatconnect_frame/`](components/boatconnect_frame/) — thin ESP-IDF component wrapper that re-exports the two files above without forking them.
- **`esp_ble_mesh_node/`** — boat-side ESP-IDF project. Vendor-server model that publishes complete `BTC1` frames over BLE Mesh. Relay enabled so boats hop frames toward the gateway when out of single-hop range.
- **`esp_ble_mesh_gateway/`** — coach-side ESP-IDF project. Provisioner + vendor-client model that subscribes to the boat group, then forwards each received access-payload (one full `BTC1` frame) to UART0 with **no extra framing**. The host opens that UART (typically a USB CDC device) and feeds the bytes into `FleetHub` via `SerialPortTransport`.

The wire format is identical across UDP, TCP, WebSocket, and BLE-Mesh-via-gateway: a `BTC1` frame is a `BTC1` frame regardless of carriage. See [`../PROTOCOL.md`](../PROTOCOL.md).

## Prerequisites

- ESP-IDF v5.1 or newer with the chip target you intend to use (ESP32, ESP32-C3, ESP32-C6, ESP32-S3 are all supported).
- `IDF_PATH` exported and `. $IDF_PATH/export.sh` (or `export.ps1` on Windows) sourced in the shell.

The two projects do **not** vendor ESP-IDF; they rely on the standard component graph.

## Building the boat node

```bash
cd firmware/esp_ble_mesh_node
idf.py set-target esp32         # or esp32c6 / esp32s3
idf.py build flash monitor
```

The boat id and publish period are compile-time constants in [`main/boatconnect_node_main.c`](esp_ble_mesh_node/main/boatconnect_node_main.c):

```c
#define BC_BOAT_ID            1u
#define BC_PUBLISH_PERIOD_MS  1000u
```

Override per board via `idf.py -DBC_BOAT_ID=7 build` or by promoting them to `Kconfig.projbuild` entries in your fork. Sensor data is currently stubbed in `bc_collect_telemetry()` — wire your real GPS/IMU pipeline in there.

## Building the coach gateway

```bash
cd firmware/esp_ble_mesh_gateway
idf.py set-target esp32         # any chip with USB CDC works for laptop use
idf.py build flash monitor
```

The gateway exposes UART0 (the same UART that `idf.py monitor` uses by default). For production deployment, route `BC_UART_NUM` to a dedicated USB-serial line so the monitor channel does not interleave debug logs with `BTC1` bytes.

## Provisioning model

- The gateway is the **provisioner**. On boot it scans for unprovisioned BLE Mesh beacons whose UUID begins with `'B','C'` (set by the boat node) and auto-enrolls them.
- Network/app keys are baked into the gateway as development defaults — regenerate per fleet for production:

  ```c
  static const uint8_t s_dev_net_key[16] = { /* fleet net key */ };
  static const uint8_t s_dev_app_key[16] = { /* fleet app key */ };
  ```

- Boats publish to the fleet group address `0xC000`. The gateway's vendor client subscribes to that group.
- The gateway assigns boat unicast addresses starting at `0x0005` (`prov_start_address`). Boat ids in the `BTC1` header are independent of mesh unicast addresses; both are useful in logs.

For a hands-on setup with the **nRF Mesh** mobile app instead of the auto-provisioner, leave the boats unprovisioned and use the app to add them, set the publish address to `0xC000`, and bind the app key — the gateway path remains identical from there.

## Vendor model identifiers

| Symbol                  | Value                              |
| ----------------------- | ---------------------------------- |
| Company ID (CID)        | `0x02E5` (Espressif test — replace before production) |
| Server model ID (boat)  | `0x0001`                           |
| Client model ID (gw)    | `0x0002`                           |
| Opcode `BTC1_PUBLISH`   | `0x01` wrapped via `OP_3(.., CID)` |
| Opcode `BTC1_PUBLISH_ACK` | `0x02` wrapped via `OP_3(.., CID)` |
| Group address           | `0xC000`                           |

## Frame size on the BLE Mesh access layer

A segmented BLE Mesh access PDU carries up to ~380 bytes of payload. A `BTC1` heartbeat is 22 bytes; `telemetrySummary` is 48 bytes. Both fit comfortably in one access PDU. If you extend the protocol with larger payloads, keep the total frame (header + payload + CRC) under ~350 bytes for BLE Mesh carriage; for IP transports the original `MAX_PAYLOAD_LEN = 2048` still applies.

## Alternatives considered

- **olegv142/esp32-ble-uart-mx** — star-topology BLE-NUS bridge (up to 4 peripherals per central). Lower-overhead than Mesh and simpler to integrate, but no multi-hop relay. Useful when every boat is within ~30 m of the coach and you do not need a long line of relays. Not implemented here; it would slot into the host side as an alternative serial bridge consuming the same `BTC1` stream.
