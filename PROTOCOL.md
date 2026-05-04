# BoatConnect binary protocol v1

All multi-byte integers are **little-endian**. Frames are **opaque to transports**: UDP maps **one datagram = one frame**; TCP and WebSocket carry **raw concatenated frames** and require `FrameParser` reassembly.

## Frame layout

| Offset | Size | Field |
|--------|------|--------|
| 0 | 4 | Magic `0x42 0x54 0x43 0x31` (`BTC1`) |
| 4 | 1 | `version` (must be `1` for this document) |
| 5 | 1 | `msgType` (see below) |
| 6 | 1 | `flags` (reserved, set `0`) |
| 7 | 1 | `reserved` (must be `0`) |
| 8 | 4 | `boatId` (u32) |
| 12 | 4 | `seq` (u32, monotonic per boat) |
| 16 | 2 | `payloadLen` (u16, bytes) |
| 18 | `payloadLen` | `payload` |
| 18+`payloadLen` | 4 | `crc32` |

**`crc32`** is CRC-32 / IEEE 802.3 (polynomial `0xEDB88320`, init `0xFFFFFFFF`, final XOR `0xFFFFFFFF`) computed over **bytes [0 .. 18+payloadLen-1]** (entire frame **excluding** the CRC field).

**Limits:** `payloadLen` MUST be ≤ **2048**. Receivers SHOULD drop oversize frames.

## Message types (`msgType`)

| Value | Name | Payload |
|-------|------|---------|
| `0` | `heartbeat` | empty (`payloadLen` = 0) |
| `1` | `telemetrySummary` | see below |

### `telemetrySummary` payload (26 bytes)

| Offset | Size | Field |
|--------|------|--------|
| 0 | 8 | `timestampMs` (u64, device monotonic or UTC ms — implementation-defined) |
| 8 | 4 | `latE7` (i32, latitude × 10⁷; `0` if unknown) |
| 12 | 4 | `lonE7` (i32, longitude × 10⁷) |
| 16 | 4 | `speedMmS` (u32, boat speed in mm/s) |
| 20 | 2 | `spmX100` (u16, strokes per minute × 100) |
| 22 | 2 | `dpsX100` (u16, distance per stroke × 100, unit matches speedcoach DPS convention) |
| 24 | 2 | `telemetryFlags` (u16, bit0 = GPS fix valid) |

## Firmware alignment (ESP32 / C++)

Pack with `#pragma pack(push, 1)` or `__attribute__((packed))`. Send the **exact byte sequence** produced by this layout; do not insert padding.

Reference headers (little-endian, CRC-32 helper): [`firmware/boatconnect_frame_v1.h`](firmware/boatconnect_frame_v1.h), [`firmware/boatconnect_crc32.c`](firmware/boatconnect_crc32.c).

## BLE Mesh carriage

Frames may also be carried over Bluetooth Mesh by an ESP-BLE-Mesh vendor model. The wire format is unchanged: **one full `BTC1` frame is sent as the access-layer payload of one vendor opcode**. The receiving gateway forwards those bytes verbatim to USB CDC / UART, and the host-side `SerialPortTransport` parses them with the same `FrameParser` used for TCP and WebSocket.

| Item | Value |
|------|-------|
| Company ID (CID) | `0x02E5` (Espressif test — replace before production) |
| Vendor model ID, server (boat) | `0x0001` |
| Vendor model ID, client (gateway) | `0x0002` |
| Opcode `BTC1_PUBLISH` | `OP_3(0x01, CID)` |
| Opcode `BTC1_PUBLISH_ACK` | `OP_3(0x02, CID)` (reserved) |
| Default group address | `0xC000` (boat → gateway) |

A segmented BLE Mesh access PDU carries up to ~380 bytes of payload. Heartbeat (22 B) and `telemetrySummary` (48 B) frames fit easily in one PDU. **For BLE Mesh carriage, keep the total frame size (header + payload + CRC) ≤ 350 bytes.** The `MAX_PAYLOAD_LEN = 2048` limit still applies for IP transports (UDP/TCP/WebSocket).

Reference firmware: [`firmware/esp_ble_mesh_node/`](firmware/esp_ble_mesh_node/) (boat) and [`firmware/esp_ble_mesh_gateway/`](firmware/esp_ble_mesh_gateway/) (coach gateway). Both consume the canonical headers via [`firmware/components/boatconnect_frame/`](firmware/components/boatconnect_frame/).

## Metrics semantics

SPM and DPS follow [ATOMY-LAB/speedcoach](https://github.com/ATOMY-LAB/speedcoach) intent: DPS = speed / (SPM/60) when SPM &gt; 0. On-encoder values may be precomputed and sent as scaled integers above.
