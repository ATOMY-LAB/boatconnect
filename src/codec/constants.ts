/** Magic bytes: ASCII "BTC1" — BoatConnect v1 */
export const FRAME_MAGIC = new Uint8Array([0x42, 0x54, 0x43, 0x31]);

export const PROTOCOL_VERSION = 1;

/** Header: magic(4) + version(1) + msgType(1) + flags(1) + reserved(1) + boatId(4) + seq(4) + payloadLen(2) */
export const FRAME_HEADER_SIZE = 18;

export const CRC_SIZE = 4;

export const MAX_PAYLOAD_LEN = 2048;
