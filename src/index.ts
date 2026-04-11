export {
  FRAME_MAGIC,
  FRAME_HEADER_SIZE,
  CRC_SIZE,
  MAX_PAYLOAD_LEN,
  PROTOCOL_VERSION,
} from "./codec/constants.js";
export { crc32 } from "./codec/crc32.js";
export { BoatConnectError, type BoatConnectErrorCode } from "./codec/errors.js";
export {
  encodeFrame,
  decodeFrame,
  encodeHeartbeat,
  encodeTelemetrySummaryFrame,
  trySliceOneFrame,
  type EncodeFrameInput,
} from "./codec/frame.js";
export { encodeTelemetrySummary, decodeTelemetrySummary, TELEMETRY_SUMMARY_PAYLOAD_SIZE } from "./codec/payload.js";
export { FrameParser, type FrameHandler } from "./codec/stream-parser.js";

export { MessageType, type MessageTypeId } from "./types/message-type.js";
export { TelemetryFlag, type TelemetrySummary } from "./types/telemetry.js";
export type {
  DecodedFrame,
  DecodedFrameBase,
  DecodedHeartbeat,
  DecodedTelemetrySummary,
  DecodedUnknown,
} from "./types/frame.js";

export { FleetHub, type FleetFrameEvent, type FleetListener } from "./session/fleet-hub.js";
export { TcpClientTransport, type TcpClientOptions } from "./transports/tcp-client.js";
export { TcpServerTransport, type TcpServerOptions } from "./transports/tcp-server.js";
export { UdpListenerTransport, type UdpListenerOptions } from "./transports/udp-listener.js";
export { UdpSenderTransport, type UdpSenderOptions } from "./transports/udp-sender.js";
