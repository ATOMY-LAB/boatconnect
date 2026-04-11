export class BoatConnectError extends Error {
  constructor(
    message: string,
    public readonly code: BoatConnectErrorCode,
  ) {
    super(message);
    this.name = "BoatConnectError";
  }
}

export type BoatConnectErrorCode =
  | "MAGIC"
  | "VERSION"
  | "PAYLOAD_LENGTH"
  | "CRC"
  | "TRUNCATED"
  | "TELEMETRY_PAYLOAD_SIZE";
