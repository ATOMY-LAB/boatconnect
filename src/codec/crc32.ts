/**
 * CRC-32 IEEE 802.3 (same as Ethernet, PNG): poly 0xEDB88320, init 0xFFFFFFFF, final XOR 0xFFFFFFFF.
 */
const TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  TABLE[i] = c >>> 0;
}

export function crc32(data: Uint8Array, initial = 0xffffffff): number {
  let crc = initial;
  for (let i = 0; i < data.length; i++) {
    crc = TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
