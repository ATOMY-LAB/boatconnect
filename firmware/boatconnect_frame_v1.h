/**
 * boatconnect binary protocol v1 — ESP32 / Arduino (packed, little-endian).
 * Authoritative spec: ../PROTOCOL.md
 *
 * Build a full frame: fill BcFrameHeader + payload, then append CRC32 over
 * bytes [0 .. sizeof(header)+payloadLen) using IEEE 802.3 polynomial.
 */
#ifndef BOATCONNECT_FRAME_V1_H
#define BOATCONNECT_FRAME_V1_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define BC_MAGIC_0 0x42
#define BC_MAGIC_1 0x54
#define BC_MAGIC_2 0x43
#define BC_MAGIC_3 0x31
#define BC_VERSION 1
#define BC_MSG_HEARTBEAT 0
#define BC_MSG_TELEMETRY_SUMMARY 1
#define BC_MAX_PAYLOAD 2048

#pragma pack(push, 1)
typedef struct {
  uint8_t magic[4];
  uint8_t version;
  uint8_t msg_type;
  uint8_t flags;
  uint8_t reserved;
  uint32_t boat_id;
  uint32_t seq;
  uint16_t payload_len;
} BcFrameHeader;

typedef struct {
  uint64_t timestamp_ms;
  int32_t lat_e7;
  int32_t lon_e7;
  uint32_t speed_mm_s;
  uint16_t spm_x100;
  uint16_t dps_x100;
  uint16_t telemetry_flags;
} BcTelemetrySummaryV1; /* 26 bytes */
#pragma pack(pop)

#if defined(__cplusplus)
static_assert(sizeof(BcTelemetrySummaryV1) == 26, "telemetry payload size");
#else
_Static_assert(sizeof(BcTelemetrySummaryV1) == 26, "telemetry payload size");
#endif

/* CRC-32 IEEE 802.3 — init 0xFFFFFFFF, xorout 0xFFFFFFFF */
uint32_t bc_crc32(const uint8_t *data, size_t len);

#ifdef __cplusplus
}
#endif

#endif
