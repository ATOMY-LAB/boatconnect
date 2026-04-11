export const MessageType = {
  heartbeat: 0,
  telemetrySummary: 1,
} as const;

export type MessageTypeId = (typeof MessageType)[keyof typeof MessageType];
