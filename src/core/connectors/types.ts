/** Shared shapes for inbound connector events. */

export type ConnectorChannel = "email" | "telegram" | "webhook";

export interface InboundEvent {
  channel: ConnectorChannel;
  /** e.g. telegram:12345, email:alice@x.com, webhook:zapier */
  from: string;
  subject: string;
  body: string;
  externalId: string;
  /** when true, also enqueue a task for the routeTo agent */
  createTask?: boolean;
}

export interface PollResult {
  ingested: number;
  errors: string[];
}
