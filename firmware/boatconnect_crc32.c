/**
 * Reference CRC-32 (IEEE 802.3) for boatconnect frames.
 * Link this file or copy into your ESP32 project.
 */
#include "boatconnect_frame_v1.h"

uint32_t bc_crc32(const uint8_t *data, size_t len) {
  uint32_t crc = 0xFFFFFFFFu;
  for (size_t i = 0; i < len; i++) {
    crc ^= data[i];
    for (int b = 0; b < 8; b++) {
      uint32_t mask = -(crc & 1u);
      crc = (crc >> 1) ^ (0xEDB88320u & mask);
    }
  }
  return crc ^ 0xFFFFFFFFu;
}
