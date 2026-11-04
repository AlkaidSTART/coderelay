export interface AgentDescriptor {
  id: string;
  binary: string;
  displayName: string;
}

export interface RuntimeStatus {
  coreVersion: string;
  protocolVersion: number;
  transport: string;
}
